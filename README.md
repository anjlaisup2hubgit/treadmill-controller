# Treadmill Controller

This web page lets you watch and control your treadmill from your phone or computer.

It talks to the treadmill over Bluetooth, so you do not need to install an app.

Open it here: https://anjlaisup2hubgit.github.io/treadmill-controller/

## What you need

- A treadmill that supports FTMS, which is the standard Bluetooth protocol for fitness machines.
- A device with Bluetooth turned on.
- Chrome or Edge on a computer or an Android phone.
- The Bluefy browser if you use an iPhone, because Safari does not support this feature.

## How to use it

1. Turn on the treadmill.
2. Close any other app that is connected to the treadmill.
3. Open the page and press **Connect**.
4. Choose your treadmill from the list that appears.
5. Wait until the top of the page says **Connected**.
6. Press **Start** to begin.
7. Pick a speed with a preset button, the slower and faster buttons, or the custom speed box.
8. Press **Pause** to slow the belt to zero, and press **Start** to continue.
9. Press **Stop** to end your workout.
10. Press **Disconnect** when you are done.

## What the page shows

- **Speed** is how fast the belt moves, in km/h.
- **Distance** is how far you have gone, in km.
- **Time** is how long you have been going, in minutes and seconds.
- The page counts distance and time itself when the treadmill does not send them.
- The reset button sets the page's own distance and time back to zero.

## If something goes wrong

- A red banner explains the problem in plain words.
- The debug log at the bottom of the page lists every step the page takes.
- The page tries to reconnect up to 5 times if the connection drops.
- If you see no treadmill in the list, make sure it is awake and not connected to another phone or app.
- If the controls stay grey, your treadmill allows viewing but not control.

## Run it

**Easiest:** open https://anjlaisup2hubgit.github.io/treadmill-controller/ in Chrome or Edge (or Bluefy on iPhone). There is nothing to install.

**On your own computer:**

1. Install [Python 3](https://www.python.org/downloads/) if you do not have it.
2. Download or clone this repository.
3. Open a terminal in the project folder and run:

   ```bash
   cd public
   python -m http.server 8000
   ```

4. Open http://localhost:8000 in Chrome or Edge.

Bluetooth only works on `localhost` or `https`, so double-clicking `index.html` will not work.

## File tree

```
treadmill-controller/
├── .github/
│   └── workflows/
│       └── pages.yml        publishes public/ to GitHub Pages when main changes
├── public/                  the website
│   ├── index.html
│   ├── app.js
│   ├── glass.css
│   └── favicon.svg
├── docs/
│   ├── changelog.md         which features were added or removed
│   ├── components/          one note per feature on the page
│   └── mockups/             design mockups (SVG)
├── CLAUDE.md
└── README.md
```
