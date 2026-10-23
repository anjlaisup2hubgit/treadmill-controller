# Treadmill Controller

Single-page web dashboard that connects to an FTMS (Fitness Machine Service) treadmill over Web Bluetooth. Shows live speed, distance and time, and sends speed/start/pause/stop commands.

## Requirements
- Chrome or Edge (desktop/Android); iOS via Bluefy
- Page served over HTTPS or `localhost`
- Treadmill advertising the FTMS service (0x1826)

## Folder Tree
treadmill controller/
├── CLAUDE.md              (instructions for Claude, not the user)
├── README.md              (states purpose, requirements, structure)
├── input.css
├── tailwind.config.js
├── public/                (index.html, styles.css)
├── docs/
│   └── changelog.md       (instructions for Claude, not the user)
└── src/components/
    ├── connection.md
    ├── live-metrics.md
    ├── speed-options.md
    ├── controls.md
    ├── error-banner.md
    └── debug-log.md

## Structure
```
treadmill controller/
  CLAUDE.md            project instructions for Claude
  README.md
  input.css            Tailwind source
  tailwind.config.js
  public/              deployable site (index.html, styles.css)
  docs/changelog.md    features added/removed
  src/components/      one md file per website feature
```

