# Pitchy Bird: Voice-Controlled Flappy Bird

A web-based clone of the classic Flappy Bird game, controlled entirely by your voice using Machine Learning. This project uses **p5.js** for game rendering and **ml5.js** for real-time audio pitch detection.

## Overview

Instead of tapping the screen or clicking a mouse, players must hum, sing, or whistle to control the bird. The game utilizes the microphone to detect sound frequency (pitch).

- **Make noise/Sing High:** The bird flaps/flies up.
- **Silence/Low Pitch:** The bird falls.

## Features

- **Voice Control:** Real-time pitch detection using the `CREPE` model via ml5.js.
- **Sprite Rendering:** Classic pixel-art style graphics using p5.js image handling.
- **Debug Mode:** Visual feedback for pitch frequency (Hz) and noise thresholds.
- **Score System:** Sprite-based score rendering.
- **Responsive Zoom:** Canvas automatically scales to match the current window height for a full-viewport experience.
- **Fullscreen Toggle:** Press `F` at any time to enter or exit fullscreen mode instantly.

## Project Structure

```text
├── index.html          # Main entry point, loads libraries and sketch
├── sketch.js           # Main game logic, game loop, and pitch detection
├── style.css           # CSS styling for the canvas container
├── p5.js               # Local p5.js library
├── p5.sound.min.js     # Local p5.sound library
├── ml5.min.js          # Local ml5.js library
├── audio/              # Sound effects (flap, score, crash)
└── sprites/            # Game assets (bird, pipes, background, numbers)
```

## Setup & Installation

Because this project requires access to the browser's Microphone API and loads external ML models, **you cannot just double-click `index.html`.** Run the game either inside the official p5.js Web Editor or through a local web server to avoid CORS (Cross-Origin Resource Sharing) errors.

### Prerequisites
- A modern web browser (Chrome or Firefox recommended).
- A working microphone.
- A code editor (VS Code recommended).

### Option 1: p5.js Web Editor (Run Anywhere)
1. Visit https://editor.p5js.org/ and create a new sketch.
2. Replace the default `sketch.js` contents with the code from this repo's `sketch.js`.
3. Open the editor's `index.html` tab and paste the markup from this project's `index.html`, keeping the `<script>` tags that load `p5.js`, `p5.sound`, and `ml5.js`.
4. In the Files sidebar, use **Add file → Upload file** (or drag and drop) to import the `audio/` and `sprites/` folders so asset paths stay identical.
5. Click **Play** and grant microphone permission when prompted.

### Option 2: VS Code Live Server
1. Open this folder in **Visual Studio Code**.
2. Install the **Live Server** extension by Ritwick Dey.
3. Right-click on `index.html` in the file explorer.
4. Select **"Open with Live Server"**.

### Option 3: Python
If you have Python installed, you can run a simple server from the terminal:

```bash
# Python 3
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

### Option 4: Node.js
If you have Node.js installed:

```bash
npx http-server
```

## How to Play

1. Open the game in your browser using one of the methods above.
2. **Allow Microphone Access** when prompted by the browser.
3. Wait a moment for the "Pitch model loaded" message in the console/debug view.
4. **Control the Bird:**
   - Produce a steady tone (humming works best) to make the bird fly.
   - Stop making noise to let gravity pull the bird down.
5. Avoid the pipes!
6. Press `F` if you want to toggle fullscreen.

## Technologies Used

*   **[p5.js](https://p5js.org/)**: A JavaScript library for creative coding, handling the canvas drawing, game loop, and sprite management.
*   **[p5.sound](https://p5js.org/reference/#/libraries/p5.sound)**: Handles audio input stream from the microphone.
*   **[ml5.js](https://ml5js.org/)**: Friendly Machine Learning for the web. Specifically uses the `pitchDetection` model.

## Configuration

You can tweak the sensitivity of the game in `sketch.js`:

```javascript
// sketch.js
let noiseThreshold = 0.XX; // Adjust this if the bird is too sensitive to background noise
```

## Next Steps & Roadmap

- **Invincibility Phase:** 
    - Implement a 5-second "warm-up" or invincibility period at the start of each game to allow players to calibrate their voice without dying immediately.
- **Leaderboard System:**
    - Save high scores locally (using `localStorage`) or to a backend.
    - Prompt the player for their name when a new record is broken.
    - Display a leaderboard screen before the game starts.

## Acknowledgements

- https://github.com/samuelcust/flappy-bird-assets
