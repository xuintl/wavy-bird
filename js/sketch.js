// Game assets
let canvasRenderer;
let sprites = {};
let birdFrames = [];
let sounds = {};

// Game objects
let bird;
let pipes = [];

// Game state and score
let gameState = 'nameEntry'; // 'nameEntry', 'start', 'playing', 'gameOver', 'results'
let participantName = '';
let score = INITIAL_SCORE; // Can go negative
let base_x = 0; // for scrolling base
let totalCollisions = 0;

// Stage state
let stageIndex = 0;
let stagePasses = 0;
let stageStartMs = 0;
let nextPipeDueMs = 0;
let pipesCleared = 0;

// Serial / accelerometer integration
let serialManager;
let serialStatus = 'disconnected'; // disconnected | connecting | connected | error
let waveQueued = false; // true when a WAVE event is received
let inputMode = 'keyboard'; // 'serial' or 'keyboard'

// Feedback visuals
let floatingTexts = []; // array of FloatingText instances
let transitionOverlay = null; // {text, expiresMs}

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
  pixelDensity(1); // Avoid HiDPI scaling artifacts on text/UI
  canvasRenderer.parent('main');
  applyViewportScale();
  bird = new Bird();

  // Setup text rendering
  textFont('Arial');
  textAlign(LEFT, BASELINE);

  // Prepare serial manager but don't auto-connect; user triggers with 'C'
  serialManager = new SerialManager(onSerialLine, onSerialError, onSerialOpen, onSerialClose);

  initStage();
  console.log('[DEBUG] Setup complete. Initial state:', gameState);
}

// --- GAME LOGIC AND DRAW LOOP ---

function draw() {
  // Draw background
  image(sprites.background, 0, 0, width, height);

  // Handle different game states
  switch (gameState) {
    case 'nameEntry':
      drawNameEntryScreen();
      break;
    case 'start':
      drawStartScreen();
      break;
    case 'playing':
      drawPlayingScreen();
      break;
    case 'gameOver':
      drawGameOverScreen();
      break;
    case 'results':
      drawResultsScreen();
      break;
  }

  // Draw the scrolling base
  drawBase();

  // Serial status should render on top of the base
  drawSerialStatus();
}

// --- GAME STATE DRAWING FUNCTIONS ---

function drawNameEntryScreen() {
  push();
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(24);
  text("Welcome to Wavy Bird", width / 2, height / 3);

  textSize(16);
  text("Enter your name to begin:", width / 2, height / 2 - 40);

  // Draw input box
  noFill();
  stroke(255);
  strokeWeight(2);
  rect(width / 4, height / 2, width / 2, 40, 5);

  // Draw entered name
  fill(255);
  noStroke();
  textSize(18);
  text(participantName + (frameCount % 30 < 15 ? '|' : ''), width / 2, height / 2 + 20);

  textSize(12);
  fill(0);
  text("Type your name and press ENTER", width / 2, height / 2 + 75);
  text("Press '-' to connect accelerometer", width / 2, height - 60);
  pop();
}

function drawStartScreen() {
  push();
  image(sprites.message, width / 2 - sprites.message.width / 2, height / 2 - 150);

  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Welcome, " + participantName + "!", width / 2, height / 2 - 220);

  textSize(12);
  text("Wave to flap and navigate through pipes!\nPress SPACE or wave your device\nClick to start", width / 2, height / 2 - 180);
  pop();
}

function drawPlayingScreen() {
  // Stage data
  const stage = stages[stageIndex];

  // If in transition, show overlay and pause gameplay updates
  if (transitionOverlay) {
    if (millis() > transitionOverlay.expiresMs) {
      transitionOverlay = null;
    } else {
      drawTransitionOverlay();
      return;
    }
  }

  // Spawn pipes on schedule
  const nowMs = millis();
  if (nowMs >= nextPipeDueMs) {
    const pipe = new Pipe(stage.gap);
    pipes.push(pipe);
    // Dynamic pipe interval
    nextPipeDueMs = nowMs + random(PIPE_SPAWN_MIN_MS, stage.pipeIntervalMs);
  }

  for (let i = pipes.length - 1; i >= 0; i--) {
    pipes[i].show();
    pipes[i].update();

    // Check for collisions
    if (pipes[i].hits(bird)) {
      handleCollision();
    }

    // Update score
    if (pipes[i].pass(bird)) {
      console.log(`[DEBUG] Pipe passed! Score: ${score} -> ${score + 10}`);
      score += 10;
      pipesCleared++;
      stagePasses++;
      sounds.point.play();
      floatingTexts.push(new FloatingText(bird.x, bird.y - 20, '+10', color(50, 255, 50), 1));
      checkStageProgress();
    }

    // Remove pipes that are off-screen
    if (pipes[i].offscreen()) {
      pipes.splice(i, 1);
    }
  }

  // Apply pending wave (flap)
  if (waveQueued) {
    bird.flap();
    waveQueued = false;
  }

  bird.update();
  bird.show();

  // Check for ground collision
  if (bird.y + bird.h / 2 > height - sprites.base.height) {
    handleCollision();
  }

  drawScore();
  drawHud(stage);
  drawFloatingTexts();
  drawDebugInfo();
}

function drawGameOverScreen() {
  push();
  image(sprites.gameOver, width / 2 - sprites.gameOver.width / 2, height / 2 - 100);
  drawScore(height / 2);
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Click to play again.", width / 2, height / 2 + 80);
  pop();
}

function drawResultsScreen() {
  push();
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(22);
  text('Session Complete!', width / 2, height / 2 - 130);

  textSize(16);
  text(`Participant: ${participantName || 'Anonymous'}`, width / 2, height / 2 - 100);

  textSize(14);
  const finalScoreColor = score >= 0 ? color(50, 255, 50) : color(255, 50, 50);
  fill(finalScoreColor);
  text(`Final Score: ${score}`, width / 2, height / 2 - 70);

  fill(255);
  text(`Pipes Cleared: ${pipesCleared}/40`, width / 2, height / 2 - 45);
  text(`Total Collisions: ${totalCollisions}`, width / 2, height / 2 - 20);

  textSize(12);
  text("Click to replay.", width / 2, height / 2 + 60);
  pop();
}

function drawBase() {
  // Create a seamless scrolling effect
  base_x -= BASE_SCROLL_SPEED;
  if (base_x <= -width) {
    base_x = 0;
  }
  image(sprites.base, base_x, height - sprites.base.height, width, sprites.base.height);
  image(sprites.base, base_x + width, height - sprites.base.height, width, sprites.base.height);
}

function drawDebugInfo() {
  push();
  fill(0);
  noStroke();
  textSize(10);
  textAlign(LEFT, TOP);
  text(`Serial: ${serialStatus}`, 5, 5);
  text(`Input: ${inputMode}`, 5, 18);
  pop();
}

function drawSerialStatus() {
  push();
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(12);

  let statusText = '';
  let statusColor = color(255);

  if (serialStatus === 'connected') {
    statusText = '🟢 Accelerometer Connected (Serial)';
    statusColor = color(100, 255, 100);
  } else if (serialStatus === 'connecting') {
    statusText = '🟡 Connecting to Accelerometer...';
    statusColor = color(255, 255, 100);
  } else if (serialStatus === 'error') {
    statusText = '🔴 Serial Error - Using Keyboard';
    statusColor = color(255, 100, 100);
  } else {
    statusText = '⚪ Keyboard Mode (Press \'-\' to connect serial)';
    statusColor = color(200, 200, 200);
  }

  fill(statusColor);
  text(statusText, width / 2, height - 20);
  pop();
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

function drawHud(stage) {
  push();
  noStroke();
  textAlign(LEFT, TOP);
  textSize(12);
  fill(255);
  text(`${stage.label}`, 8, 8);
  text(`Stage passes: ${stagePasses}/${stage.targetPasses ?? '-'}`, 8, 24);

  // Large score display at top center
  textAlign(CENTER, TOP);
  textSize(20);
  const scoreColor = score < 0 ? color(255, 100, 100) : color(255);
  fill(scoreColor);
  text(`Score: ${score}`, width / 2, 8);
  pop();
}

function drawTransitionOverlay() {
  if (!transitionOverlay) return;
  push();
  fill(0, 0, 0, 180);
  noStroke();
  rect(0, 0, width, height);
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(26);
  text(transitionOverlay.text, width / 2, height / 2);
  pop();
}

// --- USER INPUT AND GAME RESET ---

function mousePressed() {
  // Handle skip tutorial click while playing tutorial
  if (gameState === 'playing' && stages[stageIndex]?.key === 'tutorial') {
    const { x, y, w, h } = getSkipButtonRect();
    if (mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h) {
      stageIndex = 1; // Jump to Level 1
      pipes = [];
      activePipeRef = null;
      initStage();
      return;
    }
  }
  switch (gameState) {
    case 'nameEntry':
      // Must enter name first
      break;
    case 'start':
      console.log('[DEBUG] State transition: start -> playing');
      sounds.swoosh.play();
      gameState = 'playing';
      initStage();
      break;
    case 'gameOver':
      console.log('[DEBUG] State transition: gameOver -> reset');
      resetGame();
      break;
    case 'results':
      console.log('[DEBUG] State transition: results -> reset');
      resetGame();
      break;
  }
}

function resetGame() {
  console.log('[DEBUG] Resetting game...');
  pipes = [];
  bird = new Bird();
  score = INITIAL_SCORE;
  pipesCleared = 0;
  stageIndex = 0;
  stagePasses = 0;
  totalCollisions = 0;
  floatingTexts = [];
  participantName = '';
  initStage();
  gameState = 'nameEntry';
  sounds.swoosh.play();
}

function handleCollision() {
  console.log(`[DEBUG] Collision! Score: ${score} -> ${score - 5}`);
  totalCollisions += 1;
  score -= 5; // Deduct 5 points
  sounds.hit.play();
  sounds.die.play();

  // Spawn floating -5 text
  floatingTexts.push(new FloatingText(bird.x, bird.y, '-5', color(255, 50, 50), -1));

  // Always respawn - no game over
  pipes = [];
  bird = new Bird();
  nextPipeDueMs = millis() + stages[stageIndex].pipeIntervalMs;
}

function initStage() {
  stageStartMs = millis();
  stagePasses = 0;
  nextPipeDueMs = stageStartMs + stages[stageIndex].pipeIntervalMs;
  activePipeRef = null;
}

function checkStageProgress() {
  const stage = stages[stageIndex];
  const nowMs = millis();

  const hitPassTarget = stage.targetPasses && stagePasses >= stage.targetPasses;
  const hitDuration = stage.maxDurationMs && (nowMs - stageStartMs) >= stage.maxDurationMs;

  if (!hitPassTarget && !hitDuration) {
    return;
  }

  // Advance stage or finish
  stageIndex += 1;
  if (stageIndex >= stages.length) {
    console.log('[DEBUG] All stages complete. Moving to results.');
    gameState = 'results';
    return;
  }

  console.log(`[DEBUG] Level Up! Entering stage: ${stages[stageIndex].label}`);
  transitionOverlay = { text: `LEVEL UP! ${stages[stageIndex].label}`, expiresMs: millis() + 900 };
  initStage();
}

function drawFloatingTexts() {
  const now = millis();
  floatingTexts = floatingTexts.filter((ft) => !ft.isDead(now));
  floatingTexts.forEach((ft) => {
    ft.update();
    ft.show();
  });
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
  if (key === '`') {
    toggleFullscreen();
  }

  // Manual serial connect/disconnect
  if (key === '-') {
    serialManager.connect();
  }

  // Calibration trigger (sends '0' to Arduino)
  if (key === '=') {
    if (serialStatus === 'connected') {
      serialManager.send('0');
      console.log('[DEBUG] Calibration command sent to Arduino');
    } else {
      console.log('[DEBUG] Cannot calibrate: Serial not connected');
    }
  }

  // Name entry handling
  if (gameState === 'nameEntry') {
    if (key === 'Enter' && participantName.trim().length > 0) {
      // Capitalize first letter of each word
      participantName = participantName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      console.log(`[DEBUG] Name entered: "${participantName.trim()}"`);
      gameState = 'start';
      sounds.swoosh.play();
    } else if (key === 'Backspace') {
      participantName = participantName.slice(0, -1);
    } else if (key.length === 1 && /[a-zA-Z0-9 ]/.test(key)) {
      if (participantName.length < 20) {
        participantName += key;
      }
    }
    return false; // Prevent default
  }

  // Gameplay keyboard fallback
  if (gameState === 'playing') {
    if (key === ' ' || keyCode === 32) {
      waveQueued = true; // Space = flap
      return false;
    }
  }
}

function toggleFullscreen() {
  const fs = fullscreen();
  fullscreen(!fs);
  // Allow the browser a moment to enter/exit fullscreen before re-scaling
  setTimeout(applyViewportScale, 150);
}

// --- WEB SERIAL INTEGRATION ---

function onSerialLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  if (line === 'WAVE') {
    console.log('[DEBUG] Serial Event: WAVE');
    waveQueued = true;
    return;
  }

  // Unknown lines are kept visible in console for troubleshooting
  console.log('Serial (unparsed):', line);
}

function onSerialError(err) {
  console.error('Serial error', err);
  serialStatus = 'error';
}

function onSerialOpen() {
  serialStatus = 'connected';
  inputMode = 'serial';
  console.log('Serial connected');
}

function onSerialClose() {
  serialStatus = 'disconnected';
  inputMode = 'keyboard';
  console.log('Serial closed');
}
