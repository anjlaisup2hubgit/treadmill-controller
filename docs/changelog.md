# Changelog

Logs which features were added and removed.
Source: `public/.git` history.

## 2026-11-05 — Glass logo

### Changed
- Favicon/logo now matches the glass mockup tile (green glass rounded square with three mint chevrons)

## 2026-10-23 — aaec558 "Deploy public site"

### Added
- Connection: Connect/Disconnect button, FTMS-filtered Bluetooth picker, auto-reconnect with backoff
- Live metrics: speed, distance, time cards (with local fallback when the treadmill omits distance/time)
- Speed options: presets 1–6 km/h and custom speed input
- Controls: slower/faster, Start, Pause (falls back to speed 0), Stop, reset local timer & distance
- Error banner with human-readable Web Bluetooth errors
- Debug log

### Removed
- None recorded (this is the only commit in the history)
