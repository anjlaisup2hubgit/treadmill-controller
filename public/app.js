"use strict";

const UUID = {
  FTMS_SERVICE:      0x1826,
  FTMS_FEATURE:      0x2acc,
  TREADMILL_DATA:    0x2acd,
  SPEED_RANGE:       0x2ad4,
  CONTROL_POINT:     0x2ad9,
};

// FTMS Control Point opcodes
const OP = { REQUEST_CONTROL: 0x00, RESET: 0x01, SET_SPEED: 0x02, START: 0x07, STOP_PAUSE: 0x08, RESPONSE: 0x80 };
const RESULT = { 1: "Success", 2: "Op code not supported", 3: "Invalid parameter", 4: "Operation failed", 5: "Control not permitted" };

/* FTMS Treadmill Data (0x2ACD) parser. Little-endian. 16-bit Flags, then fields in fixed order,
   each present only if its flag bit is set (bit 0 is INVERTED: 0 => speed present). */
function parseTreadmillData(dv) {
  let o = 0;
  const u8  = () => { const v = dv.getUint8(o);          o += 1; return v; };
  const u16 = () => { const v = dv.getUint16(o, true);   o += 2; return v; };
  const s16 = () => { const v = dv.getInt16(o, true);    o += 2; return v; };
  const u24 = () => { const v = dv.getUint16(o, true) | (dv.getUint8(o + 2) << 16); o += 3; return v; };

  const flags = u16();
  const has = (bit) => (flags & (1 << bit)) !== 0;
  const r = {};

  if (!has(0)) r.speedKmh = u16() * 0.01;
  if (has(1))  r.avgSpeedKmh = u16() * 0.01;
  if (has(2))  r.distanceM = u24();
  if (has(3)) {
    r.inclinePct = s16() * 0.1;
    r.rampAngleDeg = s16() * 0.1;
  }
  if (has(4)) {
    r.elevGainPosM = u16() * 0.1;
    r.elevGainNegM = u16() * 0.1;
  }
  if (has(5))  r.paceMinPerKm = u8() * 0.1;
  if (has(6))  r.avgPaceMinPerKm = u8() * 0.1;
  if (has(7)) {
    const total = u16(), perHour = u16(), perMin = u8();
    if (total !== 0xffff)   r.energyKcal = total;
    if (perHour !== 0xffff) r.energyPerHour = perHour;
    if (perMin !== 0xff)    r.energyPerMin = perMin;
  }
  if (has(8))  r.heartRate = u8();
  if (has(9))  r.metabolicEq = u8() * 0.1;
  if (has(10)) r.elapsedS = u16();
  if (has(11)) r.remainingS = u16();
  if (has(12)) { r.forceOnBeltN = s16(); r.powerW = s16(); }
  return r;
}

const state = {
  device: null,
  userDisconnected: false,
  reconnecting: false,
  controlPoint: null,
  hasControl: false,
  pending: null,
  queue: Promise.resolve(),
  speedMin: 0, speedMax: 6.0, speedStep: 0.1, rangeKnown: false,
  targetKmh: null,
  speed: 0,
  deviceDistanceM: null, deviceElapsedS: null,
  localDistanceKm: 0, localSeconds: 0,
  lastTick: performance.now(),
  packets: 0, connectedAt: 0,
};

const $ = (id) => document.getElementById(id);
const all = (sel) => document.querySelectorAll(sel);
const bind = (name, text) => all(`[data-bind="${name}"]`).forEach((n) => { if (n.textContent !== text) n.textContent = text; });
const el = { error: $("error"), log: $("log") };

function log(msg) {
  el.log.textContent += `[${new Date().toLocaleTimeString()}] ${msg}
`;
  el.log.scrollTop = el.log.scrollHeight;
  console.log(msg);
}

/* Shrink an over-long status line to fit its box (SVG text has no ellipsis) */
function fitStatus() {
  all(".status").forEach((t) => {
    t.removeAttribute("textLength");
    const max = parseFloat(t.dataset.max), len = t.getComputedTextLength();
    if (len > max) { t.setAttribute("textLength", max); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
  });
}
function setStatus(msg) {
  all(".status").forEach((t) => (t.textContent = msg));
  all(".head").forEach((h) => h.classList.toggle("on", /^Connected/.test(msg)));
  fitStatus();
  render();
}
window.addEventListener("resize", fitStatus);
function showError(msg) { el.error.textContent = msg; el.error.hidden = false; log("ERROR: " + msg); }
function clearError() { el.error.hidden = true; }
function setControlsEnabled(on) {
  all(".ctrl, .speed-input").forEach((b) => (b.disabled = !on));
}
const setConnectLabel = (t) => bind("connectLabel", t);

/* Translate Web Bluetooth errors into something a human can act on */
function explainError(e) {
  switch (e && e.name) {
    case "NotFoundError":
      return /cancel/i.test(e.message) ? "Device selection was cancelled."
        : "No matching device found. Make sure the treadmill is on, awake, and not connected to another app/phone.";
    case "SecurityError":
      return "Bluetooth blocked: the page must be on HTTPS or localhost, and Bluetooth permission must be allowed.";
    case "NotAllowedError":
      return "Bluetooth permission denied. Allow it in the browser/site settings and make sure Bluetooth is on.";
    case "NetworkError":
      return "Connection to the treadmill failed or dropped. Move closer and try again.";
    case "NotSupportedError":
      return "The treadmill doesn't support this operation.";
    case "InvalidStateError":
      return "Bluetooth is busy or the device is in an invalid state. Try reconnecting.";
    default:
      return (e && e.message) || String(e);
  }
}

const fmtTime = (s) => {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

function render() {
  bind("speed", state.speed.toFixed(1));
  const km = state.deviceDistanceM != null ? state.deviceDistanceM / 1000 : state.localDistanceKm;
  bind("distance", km.toFixed(2));
  bind("time", fmtTime(state.deviceElapsedS != null ? state.deviceElapsedS : state.localSeconds));

  // Gauge: 270 degree arc from bottom-left (135 deg) round the top to bottom-right
  const max = state.rangeKnown && state.speedMax > 0 ? state.speedMax : 12;
  const f = Math.min(1, Math.max(0, state.speed / max));
  const a = (135 + 270 * f) * Math.PI / 180;
  all(".wheel").forEach((w) => {
    const cx = +w.dataset.cx, cy = +w.dataset.cy, R = +w.dataset.r;
    const sx = cx + R * Math.cos(Math.PI * 3 / 4), sy = cy + R * Math.sin(Math.PI * 3 / 4);
    const ex = (cx + R * Math.cos(a)).toFixed(1), ey = (cy + R * Math.sin(a)).toFixed(1);
    const knob = w.querySelector(".w-knob"), ksh = w.querySelector(".w-ksh");
    knob.setAttribute("cx", ex); knob.setAttribute("cy", ey);
    ksh.setAttribute("cx", ex); ksh.setAttribute("cy", (+ey + 2).toFixed(1));
    w.querySelector(".w-arc").setAttribute("d", f > 0.002 ? `M${sx.toFixed(1)} ${sy.toFixed(1)}A${R} ${R} 0 ${f > 2 / 3 ? 1 : 0} 1 ${ex} ${ey}` : "");
    w.querySelector(".w-max").textContent = String(Math.round(max * 10) / 10);
  });

  const connected = !!(state.device && state.device.gatt.connected);
  const running = state.speed > 0.05;
  bind("caption", !connected ? "Connect to a treadmill to start" : running ? "Running" : state.hasControl ? "Press play to start" : "Connected");
  all(".play").forEach((b) => b.classList.toggle("running", running));
  const shown = state.targetKmh != null ? state.targetKmh : state.speed;
  all(".preset").forEach((b) =>
    b.classList.toggle("is-active", Math.abs(parseFloat(b.dataset.speed) - shown) < 0.05));
}

/* Local fallback integration (used if the treadmill omits distance / elapsed time) */
setInterval(() => {
  const now = performance.now();
  const dt = (now - state.lastTick) / 1000;
  state.lastTick = now;
  if (state.device && state.device.gatt.connected && state.speed > 0) {
    state.localSeconds += dt;
    state.localDistanceKm += (state.speed * dt) / 3600;
  }
  render();
}, 250);

function onTreadmillData(ev) {
  let d;
  try { d = parseTreadmillData(ev.target.value); }
  catch (e) { log("Bad treadmill packet: " + e.message); return; }

  state.packets++;
  if (state.packets <= 3) {
    const hex = Array.from(new Uint8Array(ev.target.value.buffer), (b) => b.toString(16).padStart(2, "0")).join(" ");
    log(`Data packet #${state.packets}: ${hex} -> ${JSON.stringify(d)}`);
  }
  if (d.speedKmh != null) {
    state.speed = d.speedKmh;
    if (state.targetKmh == null) state.targetKmh = Math.max(state.speedMin, Math.round(d.speedKmh * 10) / 10);
  }
  if (d.distanceM != null) state.deviceDistanceM = d.distanceM;
  if (d.elapsedS != null)  state.deviceElapsedS = d.elapsedS;
  render();
}

/* Control-point indications: [0x80, requestOpcode, resultCode, ...] */
function onControlResponse(ev) {
  const v = ev.target.value;
  if (v.getUint8(0) !== OP.RESPONSE) return;
  const opcode = v.getUint8(1), result = v.getUint8(2);
  log(`CP response: op 0x${opcode.toString(16)} -> ${RESULT[result] || result}`);
  const p = state.pending;
  if (p && p.opcode === opcode) {
    clearTimeout(p.timer);
    state.pending = null;
    result === 1 ? p.resolve() : p.reject(new Error(RESULT[result] || `Result ${result}`));
  }
}

function sendControl(bytes) {
  const run = () => new Promise((resolve, reject) => {
    if (!state.controlPoint) return reject(new Error("Control point not available"));
    const timer = setTimeout(() => { state.pending = null; reject(new Error("Treadmill did not respond")); }, 5000);
    state.pending = { opcode: bytes[0], resolve, reject, timer };
    state.controlPoint.writeValueWithResponse(new Uint8Array(bytes)).catch((e) => {
      clearTimeout(timer); state.pending = null; reject(e);
    });
  });
  state.queue = state.queue.then(run, run);
  return state.queue;
}

async function safeControl(label, bytes) {
  try { clearError(); await sendControl(bytes); }
  catch (e) { showError(`${label} failed: ${explainError(e)}`); }
}

const setSpeedBytes = (kmh) => {
  const raw = Math.round(kmh * 100);
  return [OP.SET_SPEED, raw & 0xff, (raw >> 8) & 0xff];
};

async function setSpeed(kmh) {
  if (!Number.isFinite(kmh)) return;
  const next = Math.min(state.speedMax, Math.max(state.speedMin, Math.round(kmh * 10) / 10));
  state.targetKmh = next;
  render();
  await safeControl("Set speed", setSpeedBytes(next));
}

const changeSpeed = (delta) => setSpeed((state.targetKmh != null ? state.targetKmh : state.speed) + delta);

// Tap the big number to type a speed
function openCustom(input) {
  if (input.disabled) return;
  input.min = state.speedMin; input.max = state.speedMax;
  input.value = (state.targetKmh != null ? state.targetKmh : state.speed).toFixed(1);
  input.hidden = false; input.focus(); input.select();
}
all(".speed-input").forEach((input) => {
  input.onblur = () => { input.hidden = true; };
  input.onkeydown = (e) => {
    if (e.key === "Escape") return (input.hidden = true);
    if (e.key !== "Enter") return;
    const v = parseFloat(input.value);
    if (!Number.isFinite(v) || v < state.speedMin || v > state.speedMax) {
      showError(`Enter a speed between ${state.speedMin.toFixed(1)} and ${state.speedMax.toFixed(1)} km/h.`);
      return;
    }
    input.hidden = true;
    setSpeed(v);
  };
});

const doStart = async () => {
  await safeControl("Start", [OP.START]);
  if (state.targetKmh != null) await safeControl("Set speed", setSpeedBytes(state.targetKmh));
};
const doPause = async () => {
  try {
    clearError();
    await sendControl([OP.STOP_PAUSE, 0x02]);
    // Some treadmills ack pause with Success but keep running; verify the belt actually slowed
    await new Promise((r) => setTimeout(r, 3000));
    if (state.speed > 0.1) {
      log("Pause acknowledged but belt still at " + state.speed.toFixed(1) + " km/h; setting speed to 0 instead");
      await safeControl("Pause", setSpeedBytes(0));
    }
  } catch (e) {
    // Many treadmills ignore or reject FTMS pause; drop the belt to 0 instead (target is kept so Start resumes)
    log("Pause not accepted (" + explainError(e) + "); setting speed to 0 instead");
    await safeControl("Pause", setSpeedBytes(0));
  }
};

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || t.disabled) return;
  log("Tap: " + t.dataset.act);
  switch (t.dataset.act) {
    case "preset":    return setSpeed(parseFloat(t.dataset.speed));
    case "faster":    return changeSpeed(+state.speedStep);
    case "slower":    return changeSpeed(-state.speedStep);
    case "toggle":    return state.speed > 0.05 ? doPause() : doStart();
    case "editspeed": return openCustom(t.closest(".stage").querySelector(".speed-input"));
    case "connect":   return state.device && state.device.gatt.connected ? disconnect() : connect();
  }
});

async function setupGatt(server) {
  let ftms = null;
  try { ftms = await server.getPrimaryService(UUID.FTMS_SERVICE); } catch (_) { }

  if (ftms) {
    const data = await ftms.getCharacteristic(UUID.TREADMILL_DATA);
    data.addEventListener("characteristicvaluechanged", onTreadmillData);
    await data.startNotifications();
    log("Subscribed to Treadmill Data");

    try {
      const rng = await (await ftms.getCharacteristic(UUID.SPEED_RANGE)).readValue();
      state.speedMin  = rng.getUint16(0, true) * 0.01;
      state.speedMax  = rng.getUint16(2, true) * 0.01;
      state.speedStep = Math.max(0.1, rng.getUint16(4, true) * 0.01);
      state.rangeKnown = true;
      log(`Speed range ${state.speedMin}-${state.speedMax} km/h`);
    } catch (_) { log("Speed range not readable; using defaults"); }

    try {
      const cp = await ftms.getCharacteristic(UUID.CONTROL_POINT);
      cp.addEventListener("characteristicvaluechanged", onControlResponse);
      await cp.startNotifications();
      state.controlPoint = cp;
      await sendControl([OP.REQUEST_CONTROL]);
      state.hasControl = true;
      setControlsEnabled(true);
      log("Control granted");
    } catch (e) {
      state.hasControl = false;
      setControlsEnabled(false);
      log("Control unavailable: " + explainError(e));
    }
  }

  if (ftms) log("FTMS service found");
  if (!ftms) log("No FTMS service on this device (unsupported treadmill).");
}

async function connectToDevice(device) {
  setStatus(`Connecting to ${device.name || "device"}…`);
  const server = await device.gatt.connect();
  await setupGatt(server);
  // The link can drop mid-setup; the disconnect event is ignored while a reconnect is running, so check here
  if (!device.gatt.connected) throw new DOMException("Connection dropped during setup", "NetworkError");
  setStatus(`Connected · ${device.name || "device"}`);
  setConnectLabel("Disconnect");
  state.packets = 0; state.connectedAt = performance.now();
  log(`Setup done | gatt.connected=${device.gatt.connected} | control=${state.hasControl}`);
  setTimeout(() => {
    if (state.device === device && state.packets === 0)
      log(`WARNING: no treadmill data 5s after connect | gatt.connected=${device.gatt.connected}`);
  }, 5000);
}

function resetUiDisconnected(msg) {
  setStatus(msg);
  setControlsEnabled(false);
  setConnectLabel("Connect");
  state.speed = 0; state.hasControl = false; state.controlPoint = null;
  render();
}

/* Auto-reconnect with exponential backoff (1,2,4,8,16 s) */
async function reconnect() {
  if (state.reconnecting) return;
  state.reconnecting = true;
  for (let attempt = 1; attempt <= 5 && !state.userDisconnected; attempt++) {
    const wait = 1000 * 2 ** (attempt - 1);
    setStatus(`Connection lost. Reconnecting (${attempt}/5) in ${wait / 1000}s…`);
    await new Promise((r) => setTimeout(r, wait));
    if (state.userDisconnected) break;
    try {
      await connectToDevice(state.device);
      clearError();
      state.reconnecting = false;
      log("Reconnected");
      return;
    } catch (e) { log(`Reconnect ${attempt} failed: ${explainError(e)}`); }
  }
  state.reconnecting = false;
  if (!state.userDisconnected) {
    resetUiDisconnected("Disconnected");
    showError("Could not reconnect automatically. Press Connect to try again.");
  }
}

function onGattDisconnected() {
  log(`GATT disconnected ${state.connectedAt ? ((performance.now() - state.connectedAt) / 1000).toFixed(1) + "s after connect" : "during setup"} | packets=${state.packets}`);
  state.connectedAt = 0;
  if (state.pending) { clearTimeout(state.pending.timer); state.pending = null; }
  setControlsEnabled(false);
  state.speed = 0; render();
  if (!state.userDisconnected) reconnect();
  else resetUiDisconnected("Disconnected");
}

async function connect() {
  clearError();
  state.userDisconnected = false;
  try {
    log("Opening Bluetooth picker…");
    // Only show treadmills: devices advertising FTMS, plus FitShow treadmills (name "FS-...") that don't advertise it
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UUID.FTMS_SERVICE] }, { namePrefix: "FS-" }],
      optionalServices: [UUID.FTMS_SERVICE],
    });
    if (state.device) state.device.removeEventListener("gattserverdisconnected", onGattDisconnected);
    state.device = device;
    device.addEventListener("gattserverdisconnected", onGattDisconnected);
    state.lastTick = performance.now();
    state.localSeconds = 0; state.localDistanceKm = 0; state.deviceDistanceM = null; state.deviceElapsedS = null;
    await connectToDevice(device);
  } catch (e) {
    const msg = explainError(e);
    if (e.name === "NotFoundError" && /cancel/i.test(e.message)) { log(msg); setStatus("Not connected"); }
    else { showError(msg); resetUiDisconnected("Not connected"); }
  }
}

function disconnect() {
  state.userDisconnected = true;
  if (state.device && state.device.gatt.connected) state.device.gatt.disconnect();
  else resetUiDisconnected("Disconnected");
}

(function init() {
  window.addEventListener("error", (e) => log("JS error: " + e.message));
  window.addEventListener("unhandledrejection", (e) => log("Promise error: " + (e.reason && e.reason.message || e.reason)));
  log(`Loaded v6 | secure=${window.isSecureContext} | bluetooth=${"bluetooth" in navigator}`);
  setControlsEnabled(false);
  if (!window.isSecureContext) {
    showError("Web Bluetooth needs a secure context. Open this page via https:// or http://localhost.");
    all("[data-act=connect]").forEach((b) => (b.disabled = true));
  } else if (!("bluetooth" in navigator)) {
    showError("This browser doesn't support Web Bluetooth. Use Chrome or Edge on desktop/Android (iOS: the Bluefy browser).");
    all("[data-act=connect]").forEach((b) => (b.disabled = true));
  } else {
    navigator.bluetooth.getAvailability?.().then((ok) => {
      if (!ok) showError("No Bluetooth adapter available, or Bluetooth is turned off.");
    }).catch(() => {});
  }
  render();
})();
