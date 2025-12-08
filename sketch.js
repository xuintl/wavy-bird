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
let score = 0; // Can go negative
let base_x = 0; // for scrolling base
let totalCollisions = 0;
let tiltErrors = 0;
let playingStartMs = 0;

// Stage state
let stageIndex = 0;
let stagePasses = 0;
let stageStartMs = 0;
let nextPipeDueMs = 0;
let pipesCleared = 0;

// Serial / accelerometer integration
let serialManager;
let serialStatus = 'disconnected'; // disconnected | connecting | connected | error
let latestTiltEvent = null; // {dir, velocity, angle, ts}
let bumpQueued = false; // true when a BUMP event is received
let lastTiltProcessedMs = 0; // Debounce tilt events
let inputMode = 'keyboard'; // 'serial' or 'keyboard'

// Trial data
let trialData = [];
let sessionId = Math.floor(Math.random() * 1e6).toString(16);
let currentTrialNum = 0;
let activePipeRef = null; // reference to the lead pipe carrying current stimulus

// Feedback visuals
let flashOverlay = null; // {color, expiresMs}
let markerOverlays = []; // array of {x,y,color,expiresMs}
let floatingTexts = []; // array of FloatingText instances
let tutorialFeedbacks = []; // array of {text,color,expiresMs}
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

  // Setup audio for pitch detection
  audioContext = getAudioContext();
  // Don't create mic here, will do when calibration starts

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
  fill(200);
  text("Type your name and press ENTER", width / 2, height / 2 + 60);
  text("Press 'C' to connect accelerometer", width / 2, height - 40);
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
  text("Wave to flap!\n\nClick to start", width / 2, height / 2 - 180);
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
    // assignStimulus(pipe, stage);
    pipes.push(pipe);
    activePipeRef = pipe;
    // Dynamic pipe interval
    nextPipeDueMs = nowMs + random(2000, stage.pipeIntervalMs);
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
      markPipeCleared(pipes[i]);
      checkStageProgress();
    }

    // Remove pipes that are off-screen
    if (pipes[i].offscreen()) {
      pipes.splice(i, 1);
    }
  }

  // Apply pending bump (flap)
  if (bumpQueued) {
    bird.flap();
    bumpQueued = false;
  }

  bird.update();
  bird.show();

  // Handle tilt event once per trial with debounce
  /*
  if (latestTiltEvent && activePipeRef && activePipeRef.trial) {
    const tiltAge = nowMs - latestTiltEvent.ts;
    const timeSinceLastTilt = nowMs - lastTiltProcessedMs;
    // Only process if tilt is fresh (<2s) and debounced (>300ms since last)
    if (tiltAge < 2000 && timeSinceLastTilt > 300) {
      recordTiltForActivePipe(latestTiltEvent);
      lastTiltProcessedMs = nowMs;
      latestTiltEvent = null; // Consume after successful recording
    }
  }
  */

  // Check for ground collision
  if (bird.y + bird.h / 2 > height - sprites.base.height) {
    handleCollision();
  }

  drawScore();
  drawHud(stage);
  // drawTutorialOverlay();
  // drawStimulusOverlay();
  // drawTutorialFeedback();
  // drawFeedbackOverlays();
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
  const accuracy = computeAccuracy();
  const finalScoreColor = score >= 0 ? color(50, 255, 50) : color(255, 50, 50);
  fill(finalScoreColor);
  text(`Final Score: ${score}`, width / 2, height / 2 - 70);

  fill(255);
  text(`Pipes Cleared: ${pipesCleared}/40`, width / 2, height / 2 - 45);
  text(`Total Collisions: ${totalCollisions}`, width / 2, height / 2 - 20);
  // text(`Tilt Errors: ${tiltErrors}`, width / 2, height / 2 + 5);
  // text(`Tilt Accuracy: ${accuracy.toFixed(1)}%`, width / 2, height / 2 + 30);

  textSize(12);
  text("Click to replay. Press 'E' to download CSV + summary.", width / 2, height / 2 + 60);
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
  if (latestTiltEvent) {
    const v = latestTiltEvent.velocity != null ? latestTiltEvent.velocity.toFixed(0) : '-';
    const a = latestTiltEvent.angle != null ? latestTiltEvent.angle.toFixed(1) : '-';
    text(`Tilt: ${latestTiltEvent.dir} v=${v} a=${a}`, 5, 32);
  }
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

function drawTutorialOverlay() {
  const stage = stages[stageIndex];
  if (!stage || stage.key !== 'tutorial') return;

  push();
  // Compute tutorial progress
  const tutorialCorrect = trialData.filter((t) => t.level === 'tutorial' && t.correct).length;
  const tutorialTarget = stage.targetPasses || 8;

  // Instruction panel
  const panelY = 34;
  const panelH = 70;
  const panelW = width * 0.94;
  const panelX = (width - panelW) / 2;
  fill(0, 0, 0, 140);
  noStroke();
  rect(panelX, panelY, panelW, panelH, 8);

  // Legend boxes
  const legendY = panelY + 18;
  const legendX = panelX + 12;
  const boxW = 60;
  const boxH = 20;
  fill(0, 180, 0, 220);
  rect(legendX, legendY, boxW, boxH, 4);
  fill(255);
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(12);
  text('GOOD = LEFT', legendX + boxW + 6, legendY + boxH / 2);

  const redX = legendX + 120;
  fill(200, 40, 40, 220);
  noStroke();
  rect(redX, legendY, boxW, boxH, 4);
  fill(255);
  text('BAD = RIGHT', redX + boxW + 6, legendY + boxH / 2);

  // Bump hint
  const bumpX = redX + 130;
  fill(255);
  textSize(12);
  text('WAVE to flap', bumpX, legendY + boxH / 2);

  // Counter
  const counterX = panelX + panelW - 100;
  const counterY = legendY + boxH / 2;
  textAlign(RIGHT, CENTER);
  text(`Tutorial: ${tutorialCorrect}/${tutorialTarget}`, counterX, counterY);
  pop();

  // Skip button
  drawSkipButton();
}

function drawSkipButton() {
  push();
  const { x, y, w, h } = getSkipButtonRect();
  const hover = mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h;
  fill(hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)');
  stroke(255);
  strokeWeight(1);
  rect(x, y, w, h, 6);
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(12);
  text('Skip Tutorial', x + w / 2, y + h / 2);
  pop();
}

function getSkipButtonRect() {
  const w = 100;
  const h = 26;
  const x = width - w - 12;
  const y = height - h - 12;
  return { x, y, w, h };
}

function addTutorialFeedback(trial, correct) {
  const stage = stages[stageIndex];
  if (!stage || stage.key !== 'tutorial') return;
  const expectedPhrase = trial.expectedTilt === 'left' ? 'GREEN = GOOD → LEFT' : 'RED = BAD → RIGHT';
  const text = correct ? `Great! ${expectedPhrase} ✓` : `Try again! ${expectedPhrase}`;
  const col = correct ? color(50, 220, 50, 230) : color(240, 80, 80, 230);
  tutorialFeedbacks.push({ text, color: col, expiresMs: millis() + 1200 });
}

function drawTutorialFeedback() {
  const stage = stages[stageIndex];
  if (!stage || stage.key !== 'tutorial') return;
  const now = millis();
  tutorialFeedbacks = tutorialFeedbacks.filter((f) => now <= f.expiresMs);
  if (!tutorialFeedbacks.length) return;
  push();
  const latest = tutorialFeedbacks[tutorialFeedbacks.length - 1];
  const panelW = width * 0.9;
  const panelH = 36;
  const panelX = (width - panelW) / 2;
  const panelY = height - panelH - 60;
  fill(0, 0, 0, 160);
  noStroke();
  rect(panelX, panelY, panelW, panelH, 8);
  fill(latest.color);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  text(latest.text, width / 2, panelY + panelH / 2);
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
  if (audioContext.state !== 'running') {
    audioContext.resume();
  }
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
      // Start pitch detection
      startPitch();
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

function stopSound() {
  if (mic && mic.enabled) {
    mic.stop();
    console.log("Microphone stopped.");
  }
  // Also nullify the pitch object to be recreated
  pitch = null;
}

function resetGame() {
  console.log('[DEBUG] Resetting game...');
  pipes = [];
  bird = new Bird();
  score = 0;
  pipesCleared = 0;
  stageIndex = 0;
  stagePasses = 0;
  trialData = [];
  totalCollisions = 0;
  tiltErrors = 0;
  floatingTexts = [];
  participantName = '';
  initStage();
  // Reset frequencies
  currentFreq = 0;
  smoothedFreq = 0;
  freqHistory = [];
  gameState = 'nameEntry';
  sounds.swoosh.play();
  // No need to restart mic here, it will be created on next 'start' click
}

function handleCollision() {
  console.log(`[DEBUG] Collision! Score: ${score} -> ${score - 5}`);
  totalCollisions += 1;
  score -= 5; // Deduct 5 points
  sounds.hit.play();
  sounds.die.play();

  // Spawn floating -5 text
  floatingTexts.push(new FloatingText(bird.x, bird.y, '-5', color(255, 50, 50), -1));

  // If there is an active trial not yet logged, record as miss (no pipe clear)
  if (activePipeRef && activePipeRef.trial && !activePipeRef.trial.logged) {
    const t = activePipeRef.trial;
    t.logged = true;
    t.actualTilt = t.actualTilt ?? '';
    t.RT_ms = t.RT_ms ?? '';
    t.angle_deg = t.angle_deg ?? '';
    t.velocity_deg_s = t.velocity_deg_s ?? '';
    t.correct = false;
    t.points_at_trial = score;
    t.timestamp_unix = Date.now();
    trialData.push({ ...t });
  }

  // Always respawn - no game over
  pipes = [];
  bird = new Bird();
  nextPipeDueMs = millis() + stages[stageIndex].pipeIntervalMs;
  activePipeRef = null;
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

function recordTiltForActivePipe(tilt) {
  if (!activePipeRef || !activePipeRef.trial) return;
  const trial = activePipeRef.trial;
  const rtMs = tilt.ts - trial.wordShownMs;
  const correct = tilt.dir === trial.expectedTilt;

  trial.logged = true;
  trial.actualTilt = tilt.dir;
  trial.RT_ms = rtMs;
  trial.angle_deg = tilt.angle;
  trial.velocity_deg_s = tilt.velocity;
  trial.correct = correct;
  trial.points_at_trial = score;
  trial.timestamp_unix = Date.now();

  trialData.push({ ...trial });

  if (correct) {
    console.log(`[DEBUG] Tilt CORRECT. Word="${trial.word}", Dir=${tilt.dir}, RT=${rtMs}ms`);
    markerOverlays.push({ x: bird.x + 20, y: bird.y, color: 'green', expiresMs: millis() + 200 });
    addTutorialFeedback(trial, true);
  } else {
    console.log(`[DEBUG] Tilt INCORRECT. Word="${trial.word}", Dir=${tilt.dir}, Expected=${trial.expectedTilt}`);
    tiltErrors += 1;
    score -= 2; // Deduct 2 points for incorrect tilt
    flashOverlay = { color: 'rgba(255,0,0,0.5)', expiresMs: millis() + 200 };
    markerOverlays.push({ x: bird.x + 20, y: bird.y, color: 'red', expiresMs: millis() + 500 });
    floatingTexts.push(new FloatingText(bird.x + 30, bird.y, '-2', color(255, 150, 0), 0));
    addTutorialFeedback(trial, false);
  }
}

function markPipeCleared(pipe) {
  if (pipe.trial) {
    pipe.trial.pipeCleared = true;
    if (!pipe.trial.logged) {
      pipe.trial.logged = true;
      pipe.trial.points_at_trial = score;
      pipe.trial.timestamp_unix = Date.now();
      trialData.push({ ...pipe.trial });
    }
  }
  // Advance active pipe reference to next pipe
  const next = pipes.find((p) => !p.passed);
  activePipeRef = next || null;
}

function drawStimulusOverlay() {
  if (!activePipeRef || !activePipeRef.trial) return;
  push();
  const { word, expectedTilt, colorCue } = activePipeRef.trial;
  const bg = expectedTilt === 'left' ? color(0, 150, 0, 120) : color(200, 30, 30, 120);
  fill(bg);
  rectMode(CENTER);
  noStroke();
  rect(width / 2, 60, width * 0.9, 50, 6);
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(18);
  text(word, width / 2, 60);
  textSize(10);
  text(expectedTilt === 'left' ? 'Tilt LEFT (green)' : 'Tilt RIGHT (red)', width / 2, 82);
  rectMode(CORNER);
  pop();
}

function drawFeedbackOverlays() {
  const now = millis();
  if (flashOverlay && now > flashOverlay.expiresMs) {
    flashOverlay = null;
  }
  if (flashOverlay) {
    noStroke();
    fill(flashOverlay.color);
    rectMode(CORNER);
    rect(0, 0, width, height);
  }

  markerOverlays = markerOverlays.filter((m) => now <= m.expiresMs);
  markerOverlays.forEach((m) => {
    fill(m.color === 'green' ? 'rgba(0,255,0,0.9)' : 'rgba(255,0,0,0.9)');
    noStroke();
    textAlign(LEFT, CENTER);
    textSize(16);
    text(m.color === 'green' ? '✓' : '✕', m.x, m.y);
  });
}

function drawFloatingTexts() {
  const now = millis();
  floatingTexts = floatingTexts.filter((ft) => !ft.isDead(now));
  floatingTexts.forEach((ft) => {
    ft.update();
    ft.show();
  });
}

function computeAccuracy() {
  if (!trialData.length) return 0;
  const correct = trialData.filter((t) => t.correct).length;
  return (correct / trialData.length) * 100;
}

function exportTrialCsv() {
  if (!trialData.length) {
    console.warn('No trial data to export');
    return;
  }
  const header = ['participant_name', 'session_id', 'trial', 'word', 'category', 'color_cue', 'expected_tilt', 'actual_tilt', 'RT_ms', 'angle_deg', 'velocity_deg_s', 'correct', 'pipe_cleared', 'points_at_trial', 'level', 'timestamp_unix'];
  const rows = trialData.map((t) => [
    participantName || 'Anonymous',
    sessionId,
    t.trialNum,
    t.word,
    t.category,
    t.colorCue,
    t.expectedTilt,
    t.actualTilt ?? '',
    t.RT_ms ?? '',
    t.angle_deg ?? '',
    t.velocity_deg_s ?? '',
    t.correct ?? '',
    t.pipeCleared,
    t.points_at_trial ?? '',
    t.level,
    t.timestamp_unix ?? ''
  ]);
  const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const namePart = participantName ? participantName.replace(/\s+/g, '_') : 'Anonymous';
  triggerDownload(`FlappyIAT_${namePart}_${sessionId}.csv`, csv);
}

function exportSessionSummary() {
  const name = participantName || 'Anonymous';
  const finalScore = score;
  const cleared = pipesCleared;
  const accuracyPct = computeAccuracy().toFixed(1);
  const rtValues = trialData
    .map((t) => t.RT_ms)
    .filter((v) => typeof v === 'number' && !isNaN(v));
  const avgRt = rtValues.length ? (rtValues.reduce((a, b) => a + b, 0) / rtValues.length).toFixed(1) : '';
  const timestamp = Date.now();

  const header = ['participant_name', 'session_id', 'final_score', 'pipes_cleared', 'accuracy_pct', 'avg_RT_ms', 'total_collisions', 'tilt_errors', 'timestamp_unix'];
  const row = [name, sessionId, finalScore, cleared, accuracyPct, avgRt, totalCollisions, tiltErrors, timestamp];
  const csv = `${header.join(',')}\n${row.join(',')}`;
  const namePart = participantName ? participantName.replace(/\s+/g, '_') : 'Anonymous';
  triggerDownload(`session_summary_${namePart}_${sessionId}.csv`, csv);
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function assignStimulus(pipe, stage) {
  currentTrialNum += 1;
  const stimulus = pickStimulusForStage(stage);
  const expectedTilt = stimulus.expectedTilt;
  const colorCue = expectedTilt === 'left' ? 'green' : 'red';
  const wordShownMs = millis();

  pipe.trial = {
    trialNum: currentTrialNum,
    word: stimulus.word,
    category: stimulus.category,
    colorCue,
    expectedTilt,
    wordShownMs,
    pipeCleared: false,
    level: stage.key,
    logged: false
  };
  console.log(`[DEBUG] Pipe spawned. Trial #${currentTrialNum}: Word="${stimulus.word}", Expect=${expectedTilt}, Level=${stage.key}`);
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

  // Manual serial connect/disconnect
  if (key === 'c' || key === 'C') {
    serialManager.connect();
  }

  if ((key === 'e' || key === 'E') && gameState === 'results') {
    exportTrialCsv();
    exportSessionSummary();
  }

  // Name entry handling
  if (gameState === 'nameEntry') {
    if (key === 'Enter' && participantName.trim().length > 0) {
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
      bumpQueued = true; // Space = flap
      return false;
    }
    if (keyCode === LEFT_ARROW || key === 'ArrowLeft') {
      registerTiltEvent('left', null, null, 'keyboard');
      return false;
    }
    if (keyCode === RIGHT_ARROW || key === 'ArrowRight') {
      registerTiltEvent('right', null, null, 'keyboard');
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

// Unified tilt registration so keyboard fallback can reuse logging path
function registerTiltEvent(dir, velocity = null, angle = null, source = 'keyboard') {
  latestTiltEvent = {
    dir,
    velocity: velocity ?? null,
    angle: angle ?? null,
    ts: millis(),
    source
  };
}

// --- WEB SERIAL INTEGRATION ---

function onSerialLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  if (line === 'WAVE') {
    console.log('[DEBUG] Serial Event: WAVE');
    bumpQueued = true;
    return;
  }

  const tiltMatch = line.match(/^TILT_(LEFT|RIGHT):([0-9]+):(-?[0-9]+(?:\.\d+)?)/);
  if (tiltMatch) {
    console.log(`[DEBUG] Serial Event: TILT ${tiltMatch[1]} (vel=${tiltMatch[2]}, ang=${tiltMatch[3]})`);
    registerTiltEvent(
      tiltMatch[1] === 'LEFT' ? 'left' : 'right',
      parseFloat(tiltMatch[2]),
      parseFloat(tiltMatch[3]),
      'serial'
    );
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
