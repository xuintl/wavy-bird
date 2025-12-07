// Base canvas dimensions (keep game logic consistent)
const BASE_WIDTH = 288;
const BASE_HEIGHT = 512;
let canvasRenderer;

// Game assets
let sprites = {};
let birdFrames = [];
let sounds = {};

// Game objects
let bird;
let pipes = [];

// Game state and score
let gameState = 'start'; // 'start', 'calibrateNoise', 'calibratePitch', 'playing', 'gameOver'
let score = 0;
let base_x = 0; // for scrolling base
let voiceIsActive = false; // To track if voice is detected

// Pitch detection
let mic;
let pitch;
let audioContext;
let currentFreq = 0;
let smoothedFreq = 0;
let freqHistory = []; // Store recent frequencies for better smoothing
const SMOOTHING_WINDOW = 5; // Number of readings to average

// Calibration
let minPitch = 100; // Default low C
let maxPitch = 500; // Default high C
let noiseThreshold = 0.01; // Default amplitude threshold
let isCalibratingLow = false;
let isCalibratingHigh = false;

const model_url = 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/';

// Preload all image sprites
function preload() {
  // Load static images
  sprites.background = loadImage('sprites/background-day.png');
  sprites.base = loadImage('sprites/base.png');
  sprites.pipe = loadImage('sprites/pipe-green.png');
  sprites.gameOver = loadImage('sprites/gameover.png');
  sprites.message = loadImage('sprites/message.png');

  // Load bird animation frames
  birdFrames.push(loadImage('sprites/yellowbird-downflap.png'));
  birdFrames.push(loadImage('sprites/yellowbird-midflap.png'));
  birdFrames.push(loadImage('sprites/yellowbird-upflap.png'));

  // Load numbers for score
  sprites.numbers = [];
  for (let i = 0; i < 10; i++) {
    sprites.numbers.push(loadImage(`sprites/${i}.png`));
  }

  // Load sounds
  sounds.point = loadSound('audio/point.ogg');
  sounds.hit = loadSound('audio/hit.ogg');
  sounds.die = loadSound('audio/die.ogg');
  sounds.swoosh = loadSound('audio/swoosh.ogg');
  sounds.wing = loadSound('audio/wing.ogg');
}

function setup() {
  canvasRenderer = createCanvas(BASE_WIDTH, BASE_HEIGHT);
  applyViewportScale();
  bird = new Bird();

  // Setup audio for pitch detection
  audioContext = getAudioContext();
  // Don't create mic here, will do when calibration starts
}

// --- PITCH DETECTION FUNCTIONS ---

function startPitch() {
  // Create a new mic instance each time we start pitch detection
  mic = new p5.AudioIn();
  // The callback function will start pitch detection after the mic is ready
  mic.start(() => {
    pitch = ml5.pitchDetection(model_url, audioContext, mic.stream, modelLoaded);
  }, (err) => {
    console.error("Mic start error:", err);
  });
}

function modelLoaded() {
  console.log('Pitch model loaded');
  getPitch();
}

function getPitch() {
  if (!mic.enabled) return; // Stop listening if mic is off

  pitch.getPitch((err, frequency) => {
    const amplitude = mic.getLevel();

    // Only update frequency if amplitude is above the noise threshold
    if (amplitude > noiseThreshold) {
      voiceIsActive = true;
      if (frequency) {
        currentFreq = frequency;

        // Add to history for smoothing
        freqHistory.push(frequency);
        if (freqHistory.length > SMOOTHING_WINDOW) {
          freqHistory.shift();
        }

        // Calculate smoothed frequency (average of recent readings)
        smoothedFreq = freqHistory.reduce((a, b) => a + b, 0) / freqHistory.length;
      }
    } else {
      voiceIsActive = false;
    }
    // If below threshold, don't reset frequencies, let the bird hover

    console.log(`Detected: ${currentFreq.toFixed(2)} Hz | Smoothed: ${smoothedFreq.toFixed(2)} Hz | Amp: ${amplitude.toFixed(3)}`);

    // Continue the loop
    if (gameState !== 'gameOver') {
      getPitch();
    }
  });
}

// --- GAME LOGIC AND DRAW LOOP ---

function draw() {
  // Draw background
  image(sprites.background, 0, 0, width, height);

  // Handle different game states
  switch (gameState) {
    case 'start':
      drawStartScreen();
      break;
    case 'calibrateNoise':
      drawCalibrateNoiseScreen();
      break;
    case 'calibratePitch':
      drawCalibratePitchScreen();
      break;
    case 'playing':
      drawPlayingScreen();
      break;
    case 'gameOver':
      drawGameOverScreen();
      break;
  }

  // Draw the scrolling base
  drawBase();
}

// --- GAME STATE DRAWING FUNCTIONS ---

function drawStartScreen() {
  image(sprites.message, width / 2 - sprites.message.width / 2, height / 2 - 150);
  fill(255);
  textAlign(CENTER, CENTER);
  text("Use your voice to control the bird!\nClick to calibrate your vocal range.", width / 2, height / 2 - 200);
}

function drawCalibrateNoiseScreen() {
  textAlign(CENTER, CENTER);
  fill(255);
  text("Please be quiet for a moment...\nCalibrating background noise.", width / 2, height / 2);
}

function drawCalibratePitchScreen() {
  textAlign(CENTER, CENTER);
  fill(255);
  if (isCalibratingLow) {
    text("Sing your LOWEST comfortable note.", width / 2, height / 2);
  } else if (isCalibratingHigh) {
    text("Now sing your HIGHEST comfortable note.", width / 2, height / 2);
  }
}

function drawPlayingScreen() {
  // Update and draw pipes
  if (frameCount % 90 === 0) {
    pipes.push(new Pipe());
  }
  for (let i = pipes.length - 1; i >= 0; i--) {
    pipes[i].show();
    pipes[i].update();

    // Check for collisions
    if (pipes[i].hits(bird)) {
      sounds.hit.play();
      sounds.die.play();
      stopSound();
      gameState = 'gameOver';
    }

    // Update score
    if (pipes[i].pass(bird)) {
      score++;
      sounds.point.play();
    }

    // Remove pipes that are off-screen
    if (pipes[i].offscreen()) {
      pipes.splice(i, 1);
    }
  }

  // Update and draw bird - use smoothed frequency
  bird.handlePitch(smoothedFreq, voiceIsActive);
  bird.update();
  bird.show();

  // Check for ground collision
  if (bird.y + bird.h / 2 > height - sprites.base.height) {
    sounds.hit.play();
    sounds.die.play();
    stopSound();
    gameState = 'gameOver';
  }

  drawScore();
  drawDebugInfo();

  // Display warning if no voice is detected
  if (!voiceIsActive) {
    fill(255, 0, 0);
    textAlign(CENTER, TOP);
    textSize(14);
    text("NO VOICE DETECTED", width / 2, 5);
  }
}

function drawGameOverScreen() {
  image(sprites.gameOver, width / 2 - sprites.gameOver.width / 2, height / 2 - 100);
  drawScore(height / 2);
  fill(255);
  textAlign(CENTER, CENTER);
  text("Click to play again.", width / 2, height / 2 + 80);
}

function drawBase() {
  // Create a seamless scrolling effect
  base_x -= 2;
  if (base_x <= -width) {
    base_x = 0;
  }
  image(sprites.base, base_x, height - sprites.base.height, width, sprites.base.height);
  image(sprites.base, base_x + width, height - sprites.base.height, width, sprites.base.height);
}

function drawDebugInfo() {
  fill(0);
  textSize(10);
  textAlign(LEFT, TOP);
  text(`Low: ${minPitch.toFixed(0)} Hz`, 5, 5);
  text(`High: ${maxPitch.toFixed(0)} Hz`, 5, 20);
  text(`Threshold: ${noiseThreshold.toFixed(3)}`, 5, 35);
  textSize(12); // Reset text size
}

function drawScore(yPos = 30) {
  const scoreStr = score.toString();
  let totalWidth = 0;
  for (let char of scoreStr) {
    totalWidth += sprites.numbers[parseInt(char)].width;
  }

  let x = (width - totalWidth) / 2;
  for (let char of scoreStr) {
    const num = parseInt(char);
    image(sprites.numbers[num], x, yPos);
    x += sprites.numbers[num].width;
  }
}

// --- USER INPUT AND GAME RESET ---

function mousePressed() {
  if (audioContext.state !== 'running') {
    audioContext.resume();
  }
  switch (gameState) {
    case 'start':
      sounds.swoosh.play();
      gameState = 'calibrateNoise';
      // Start pitch detection process, which now includes creating the mic
      startPitch();
      // Calibrate noise, then pitch, then play
      setTimeout(() => {
        // Set noise threshold (average level + a buffer)
        noiseThreshold = mic.getLevel() * 1.5 + 0.01;
        console.log("Noise threshold set to: " + noiseThreshold);

        gameState = 'calibratePitch';
        isCalibratingLow = true;
        // Capture lowest pitch after a short delay
        setTimeout(() => {
          minPitch = smoothedFreq > 50 ? smoothedFreq : 100;
          console.log("Min pitch set to: " + minPitch);
          isCalibratingLow = false;
          isCalibratingHigh = true;
          // Capture highest pitch after another delay
          setTimeout(() => {
            maxPitch = smoothedFreq > minPitch ? smoothedFreq : minPitch + 400;
            console.log("Max pitch set to: " + maxPitch);
            isCalibratingHigh = false;
            // Ensure model is loaded before starting game loop with getPitch
            if (pitch) {
              gameState = 'playing';
            } else {
              console.log("Pitch model not ready, waiting...");
              // Add a fallback or wait mechanism if needed
            }
          }, 3000);
        }, 3000);
      }, 2000); // 2 seconds for noise calibration
      break;
    case 'gameOver':
      resetGame();
      break;
  }
}

function stopSound() {
  if (mic && mic.enabled) {
    mic.stop();
    console.log("Microphone stopped.");
  }
  // Also nullify the pitch object to be recreated
  pitch = null;
}

function resetGame() {
  pipes = [];
  bird = new Bird();
  score = 0;
  // Reset frequencies
  currentFreq = 0;
  smoothedFreq = 0;
  freqHistory = [];
  gameState = 'start';
  sounds.swoosh.play();
  // No need to restart mic here, it will be created on next 'start' click
}

// --- BIRD CLASS ---

class Bird {
  constructor() {
    this.y = height / 2;
    this.x = 64;
    this.w = 34; // Approximate width from asset
    this.h = 24; // Approximate height from asset

    // Remove gravity-based physics
    this.frame = 0;
  }

  show() {
    // Animate the bird by cycling through frames
    const currentFrame = birdFrames[floor(this.frame) % birdFrames.length];
    image(currentFrame, this.x - this.w / 2, this.y - this.h / 2);
    this.frame += 0.2; // Control animation speed
  }

  update() {
    // Keep bird in bounds
    if (this.y < 0) {
      this.y = 0;
    }
    if (this.y > height - sprites.base.height) {
      this.y = height - sprites.base.height;
    }
  }

  // Improved pitch control with no falling
  handlePitch(freq, isActive) {
    if (isActive && freq > 50) { // Only respond to meaningful frequencies
      // Map the calibrated pitch to screen height
      let targetY = map(freq, minPitch, maxPitch, height - sprites.base.height - 20, 20);
      // Constrain to valid range
      targetY = constrain(targetY, 20, height - sprites.base.height - 20);
      // Smooth interpolation
      this.y = lerp(this.y, targetY, 0.15);
      // // Play wing sound if bird is moving up significantly
      // if (this.y < bird.y - 1 && !sounds.wing.isPlaying()) {
      //   sounds.wing.play();
      // }
    } else {
      // If no active voice, apply slight gravity
      this.y += 1.5;
    }
  }
}

// --- PIPE CLASS ---

class Pipe {
  constructor() {
    this.spacing = 125; // Space between top and bottom pipe
    this.top = random(height / 6, 3 / 4 * height - this.spacing);
    this.bottom = this.top + this.spacing;
    this.x = width;
    this.w = 52; // Width of the pipe asset
    this.speed = 2;
    this.passed = false;
  }

  show() {
    // Draw bottom pipe
    image(sprites.pipe, this.x, this.bottom);

    // Draw top pipe (flipped)
    push();
    translate(this.x + this.w, this.top);
    scale(1, -1); // Flip vertically
    image(sprites.pipe, 0, 0);
    pop();
  }

  update() {
    this.x -= this.speed;
  }

  offscreen() {
    return this.x < -this.w;
  }

  hits(bird) {
    // Check if bird is within the x-range of the pipe
    if (bird.x + bird.w / 2 > this.x && bird.x - bird.w / 2 < this.x + this.w) {
      // Check if bird hits the top or bottom pipe
      if (bird.y - bird.h / 2 < this.top || bird.y + bird.h / 2 > this.bottom) {
        return true;
      }
    }
    return false;
  }

  pass(bird) {
    if (bird.x > this.x + this.w && !this.passed) {
      this.passed = true;
      return true;
    }
    return false;
  }
}

// --- VIEWPORT AND DISPLAY HELPERS ---

function applyViewportScale() {
  if (!canvasRenderer) {
    return;
  }
  const viewportHeight = windowHeight || window.innerHeight || BASE_HEIGHT;
  const scaleFactor = viewportHeight / BASE_HEIGHT;
  const scaledWidth = BASE_WIDTH * scaleFactor;
  canvasRenderer.style('height', `${viewportHeight}px`);
  canvasRenderer.style('width', `${scaledWidth}px`);
  canvasRenderer.style('max-width', '100vw');
  canvasRenderer.style('display', 'block');
}

function windowResized() {
  applyViewportScale();
}

function keyPressed() {
  if (key === 'f' || key === 'F') {
    toggleFullscreen();
  }
}

function toggleFullscreen() {
  const fs = fullscreen();
  fullscreen(!fs);
  // Allow the browser a moment to enter/exit fullscreen before re-scaling
  setTimeout(applyViewportScale, 150);
}