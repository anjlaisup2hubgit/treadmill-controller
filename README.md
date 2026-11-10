## Dashboard

Open https://anjlaisup2hubgit.github.io/treadmill-controller/ on a phone or computer to control your treadmill.

## Features

* Connect to your treadmill with Bluetooth, like pairing a pair of headphones.
* Press play to start the belt and press it again to stop.
* Pick the speed you want, and the treadmill starts at that speed.
* Tap a number from 1 to 6 for a quick speed.
* Use the faster and slower buttons to change the speed a little at a time.
* Tap the big speed number to type any speed you like.
* See your speed, how far you went, and how long you ran.
* If the connection breaks, the app tries to join your treadmill again.
* If something goes wrong, a message tells you what to do.

## File tree

```
treadmill-controller/
├── public/          the website you see and tap
│   ├── index.html   the page layout
│   ├── app.js       the brain that talks to the treadmill
│   ├── glass.css    the colors and the shiny look
│   └── favicon.svg  the small icon on the browser tab
├── docs/            notes and pictures about the app
│   ├── changelog.md the list of past changes
│   ├── components/  one note for each part of the app
│   └── mockups/     pictures of how the app should look
├── .github/workflows/pages.yml   puts the website on the internet
├── CLAUDE.md        rules for the helper that edits the code
├── MEMORY.md        a short list of what is in this project
└── README.md        this page
```
