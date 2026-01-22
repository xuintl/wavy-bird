# Wavy Bird — Accelerator-Controlled Flappy Bird

Physical, browser-based Flappy Bird built with p5.js and the Web Serial API. Play with keyboard/mouse or wave an MMA8452Q accelerometer wired to an Arduino.

## Features
- Flappy Bird clone with smooth physics, sprite animations, and scrolling ground.
- Practice mode (no collisions or scoring) for demoing and debugging motion input.
- Web Serial integration: wave the controller to flap, calibrate on demand, and see live status.
- Responsive canvas scales to the window; fullscreen toggle built in.
- Sound effects and pixel fonts via bundled sprites/audio.

## Controls
- `Space` or mouse click: flap / start / restart.
- `.`: toggle practice mode.
- `` ` ``: toggle fullscreen.
- `-`: connect or disconnect the Arduino (Web Serial prompt).
- `=`: send calibration command to Arduino.

## Project structure
- `index.html` – loads p5.js and hooks canvas to `sketch.js`.
- `sketch.js` – game loop, physics, sprites, scoring, Web Serial handling, fullscreen scaling.
- `style.css` – centers and scales the canvas, dark background.
- `audio/` and `sprites/` – game assets.
- `arduino/` – Arduino sketch and reference examples.

## p5.js setup

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

## Arduino setup (MMA8452Q)
- Board: Arduino with Web Serial–compatible USB connection.
- Sensor: MMA8452Q accelerometer (3.3 V). Follow the wiring in `arduino/arduino.ino` (330 Ω inline on SDA/SCL for level shifting).
- Upload: Copy the code in `arduino/arduino.ino` to Arduino IDE, upload to and sync with the board at 9600 baud.
- Gesture detection: downward motion detected when the drop from rest exceeds ~0.2 g; cooldown 250 ms; sampled at 20 Hz.

## Tips and troubleshooting
- If the serial prompt does not appear, verify you are on a secure context (`https://` or `http://localhost`) and using a supported browser.
- If flaps feel sluggish, check the serial console for `WAVE` timing; adjust `waveThresholdG` or `waveCooldownMs` in `arduino/arduino.ino`.
- For presentation, toggle fullscreen (`` ` ``) and rely on CSS scaling to fit any display.

## Acknowledgements

- https://github.com/samuelcust/flappy-bird-assets
