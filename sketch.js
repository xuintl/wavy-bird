/**
 * Wavy Bird - Physical Flappy Bird Game
 */

// --- VARIABLE INITIALIZATION ---

const CONFIG = {
    // Bird Physics
    GRAVITY: 0.6,           // Downward acceleration per frame
    LIFT: -10,              // Upward velocity when flapping
    AIR_RESISTANCE: 0.9,    // Velocity multiplier for smooth movement
    START_X: 64,            // Bird's horizontal position
    ANIMATION_SPEED: 0.2,   // Speed of wing flap animation

    // Pipe Generation
    SCROLL_SPEED: 2,        // Speed at which pipes and ground move left
    PIPE_SPAWN_FRAMES: 90,  // How many frames between new pipes
    PIPE_GAP: 175,          // Vertical space between top and bottom pipes
    PIPE_WIDTH: 52,         // Width of the pipe image

    // Assets Paths
    ASSETS: {
        BG: 'sprites/background-day.png',
        BASE: 'sprites/base.png',
        PIPE: 'sprites/pipe-green.png',
        GAME_OVER: 'sprites/gameover.png',
        MESSAGE: 'sprites/message.png',
        BIRD: [
            'sprites/yellowbird-downflap.png',
            'sprites/yellowbird-midflap.png',
            'sprites/yellowbird-upflap.png'
        ],
        SOUNDS: {
            POINT: 'audio/point.ogg',
            HIT: 'audio/hit.ogg',
            DIE: 'audio/die.ogg',
            SWOOSH: 'audio/swoosh.ogg',
            WING: 'audio/wing.ogg'
        }
    }
};

// Global Variables
let sprites = {};
let sounds = {};
let bird;
let pipes = [];
let gameState = 'start'; // 'start', 'playing', 'gameOver'
let score = 0;
let baseX = 0;
let practiceMode = false;
let canvasEl; // DOM canvas element reference for scaling
const LOGICAL_WIDTH = 288;
const LOGICAL_HEIGHT = 512;

// Arduino Serial Connection
let port;
let reader;
let isConnected = false;
let connectionStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected'
let serialBuffer = '';
let debugMode = true;

// --- P5.JS LIFECYCLE FUNCTIONS ---

function preload() {
    // Load static images
    sprites.background = loadImage(CONFIG.ASSETS.BG);
    sprites.base = loadImage(CONFIG.ASSETS.BASE);
    sprites.pipe = loadImage(CONFIG.ASSETS.PIPE);
    sprites.gameOver = loadImage(CONFIG.ASSETS.GAME_OVER);
    sprites.message = loadImage(CONFIG.ASSETS.MESSAGE);

    // Load bird animation frames
    sprites.bird = CONFIG.ASSETS.BIRD.map(path => loadImage(path));

    // Load numbers for score (0-9.png)
    sprites.numbers = [];
    for (let i = 0; i < 10; i++) {
        sprites.numbers.push(loadImage(`sprites/${i}.png`));
    }

    // Load sounds
    sounds.point = loadSound(CONFIG.ASSETS.SOUNDS.POINT);
    sounds.hit = loadSound(CONFIG.ASSETS.SOUNDS.HIT);
    sounds.die = loadSound(CONFIG.ASSETS.SOUNDS.DIE);
    sounds.swoosh = loadSound(CONFIG.ASSETS.SOUNDS.SWOOSH);
    sounds.wing = loadSound(CONFIG.ASSETS.SOUNDS.WING);
}

function setup() {
    pixelDensity(1); // Keep logical pixel grid stable when scaling

    // Create canvas at logical size; scale via CSS to fit the window
    const canvas = createCanvas(LOGICAL_WIDTH, LOGICAL_HEIGHT);
    canvas.parent('main'); // Attach to the main element in HTML
    canvasEl = canvas.elt;

    // Keep scaling correct when fullscreen changes
    document.addEventListener('fullscreenchange', updateCanvasDisplaySize);

    updateCanvasDisplaySize();
    tryEnterFullscreen();

    bird = new Bird();
}

function windowResized() {
    updateCanvasDisplaySize();
}

function updateCanvasDisplaySize() {
    if (!canvasEl) {
        return;
    }

    const availableWidth = window.innerWidth;
    const availableHeight = window.innerHeight;
    const scale = Math.min(availableWidth / LOGICAL_WIDTH, availableHeight / LOGICAL_HEIGHT);

    const displayWidth = LOGICAL_WIDTH * scale;
    const displayHeight = LOGICAL_HEIGHT * scale;

    canvasEl.style.width = `${displayWidth}px`;
    canvasEl.style.height = `${displayHeight}px`;
}

function tryEnterFullscreen() {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
            // Ignore errors (most browsers require user gesture)
        });
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Fullscreen error:', err);
            });
        } else if (typeof fullscreen === 'function') {
            fullscreen(true);
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => {
                console.error('Exit fullscreen error:', err);
            });
        } else if (typeof fullscreen === 'function') {
            fullscreen(false);
        }
    }

    // Recompute CSS scaling shortly after fullscreen state changes
    setTimeout(updateCanvasDisplaySize, 100);
}

function draw() {
    // Draw background
    image(sprites.background, 0, 0, width, height);

    // Draw the scrolling base first (so text can be drawn on top)
    drawBase();

    // Handle different game states
    switch (gameState) {
        case 'start':
            drawStartScreen();
            break;
        case 'playing':
            drawPlayingScreen();
            break;
        case 'gameOver':
            drawGameOverScreen();
            break;
    }

    // Draw connection status icon at bottom
    drawConnectionStatus();
}

// --- GAME STATE DRAWING FUNCTIONS ---

function drawStartScreen() {
    image(sprites.message, width / 2 - sprites.message.width / 2, height / 2 - 150);

    fill(255);
    textAlign(CENTER, TOP);
    textSize(14);
    stroke(0);
    strokeWeight(2);
    text("Click or Press 'Space' to start\nWave or Flap physically to Play\nPress'.' for practice mode", width / 2, height / 2 - 225);
    textSize(12);
    text("Press '`' to toggle fullscreen\nPress '-' to connect/disconnect Arduino\nPress '=' to calibrate Arduino", width / 2, height - 70);

    // Show practice mode indicator
    if (practiceMode) {
        fill(100, 255, 100);
        textAlign(CENTER, TOP);
        textSize(12);
        stroke(0);
        strokeWeight(2);
        text("PRACTICE MODE", width / 2, 5);
    }
}

function drawPlayingScreen() {
    // Spawn pipes
    if (frameCount % CONFIG.PIPE_SPAWN_FRAMES === 0) {
        pipes.push(new Pipe());
    }

    // Update and draw pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].show();
        pipes[i].update();

        // Check for collisions (skip in practice mode)
        if (!practiceMode && pipes[i].hits(bird)) {
            gameOver();
        }

        // Update score (skip in practice mode)
        if (!practiceMode && pipes[i].pass(bird)) {
            score++;
            sounds.point.play();
        }

        // Remove off-screen pipes
        if (pipes[i].offscreen()) {
            pipes.splice(i, 1);
        }
    }

    bird.update();
    bird.show();

    // Check for ground/ceiling collision (skip in practice mode)
    if (!practiceMode) {
        const floorY = height - sprites.base.height;
        if (bird.y + bird.h / 2 > floorY || bird.y - bird.h / 2 < 0) {
            gameOver();
        }
    }

    drawScore();

    // Show practice mode indicator
    if (practiceMode) {
        fill(100, 255, 100);
        textAlign(CENTER, TOP);
        textSize(12);
        stroke(0);
        strokeWeight(2);
        text("PRACTICE MODE", width / 2, 5);
    }
}

function drawGameOverScreen() {
    image(sprites.gameOver, width / 2 - sprites.gameOver.width / 2, height / 2 - 100);
    drawScore(height / 2);

    fill(255);
    textAlign(CENTER, CENTER);
    textSize(14);
    stroke(0);
    strokeWeight(2);
    text("Click or press SPACE to play again.", width / 2, height / 2 + 80);
}

function drawBase() {
    // Create a seamless scrolling effect
    baseX -= CONFIG.SCROLL_SPEED;
    if (baseX <= -width) {
        baseX = 0;
    }
    image(sprites.base, baseX, height - sprites.base.height, width, sprites.base.height);
    image(sprites.base, baseX + width, height - sprites.base.height, width, sprites.base.height);
}

function drawScore(yPos = 30) {
    const scoreStr = score.toString();
    let totalWidth = 0;

    // Calculate total width to center the score
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

function gameOver() {
    sounds.hit.play();
    sounds.die.play();
    gameState = 'gameOver';
}

// --- USER INPUT AND GAME RESET ---

function mousePressed() {
    handleInput();
}

function keyPressed() {
    // Toggle practice mode with '.' key
    if (key === '.') {
        practiceMode = !practiceMode;
        console.log('Practice mode:', practiceMode ? 'ON' : 'OFF');
        return false;
    }

    // Toggle fullscreen with '`' key
    if (key === '`') {
        toggleFullscreen();
        return false;
    }

    // Toggle Arduino connection with '-' key
    if (key === '-') {
        toggleConnection();
        return false;
    }

    // Calibrate Arduino with '=' key
    if (key === '=') {
        calibrateArduino();
        return false;
    }

    if (key === ' ' || keyCode === 32) {
        handleInput();
        return false;
    }
}

function handleInput() {
    switch (gameState) {
        case 'start':
            sounds.swoosh.play();
            gameState = 'playing';
            break;
        case 'playing':
            bird.flap();
            break;
        case 'gameOver':
            resetGame();
            break;
    }
}

function resetGame() {
    pipes = [];
    bird = new Bird();
    score = 0;
    gameState = 'start';
    sounds.swoosh.play();
}

// --- CLASSES ---

class Bird {
    constructor() {
        this.y = height / 2;
        this.x = CONFIG.START_X;
        this.w = 34; // Approximate width from asset
        this.h = 24; // Approximate height from asset
        this.vy = 0;
        this.frame = 0;
    }

    show() {
        // Animate the bird by cycling through frames
        const currentFrame = sprites.bird[floor(this.frame) % sprites.bird.length];
        image(currentFrame, this.x - this.w / 2, this.y - this.h / 2);
        this.frame += CONFIG.ANIMATION_SPEED;
    }

    update() {
        this.vy += CONFIG.GRAVITY;
        this.vy *= CONFIG.AIR_RESISTANCE;
        this.y += this.vy;

        // Keep bird in bounds (prevent flying above ceiling)
        if (this.y < 0) {
            this.y = 0;
            this.vy = 0;
        }

        // Floor collision is handled in drawPlayingScreen
        const floorY = height - sprites.base.height;
        if (this.y > floorY) {
            this.y = floorY;
            this.vy = 0;
        }
    }

    flap() {
        this.vy = CONFIG.LIFT;
        if (sounds.wing && !sounds.wing.isPlaying()) {
            sounds.wing.play();
        }
    }
}

class Pipe {
    constructor() {
        this.spacing = CONFIG.PIPE_GAP;
        // Randomize pipe position
        // Ensure pipe is within playable area (between top and base)
        const minTop = height / 6;
        const maxTop = (height - sprites.base.height) - this.spacing - (height / 6);

        this.top = random(minTop, maxTop);
        this.bottom = this.top + this.spacing;
        this.x = width;
        this.w = CONFIG.PIPE_WIDTH;
        this.speed = CONFIG.SCROLL_SPEED;
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
        // Check horizontal overlap
        if (bird.x + bird.w / 2 > this.x && bird.x - bird.w / 2 < this.x + this.w) {
            // Check vertical overlap (hit top pipe OR hit bottom pipe)
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

// --- ARDUINO SERIAL CONNECTION FUNCTIONS ---

async function toggleConnection() {
    if (isConnected) {
        await disconnectArduino();
    } else {
        await connectArduino();
    }
}

async function connectArduino() {
    if (!('serial' in navigator)) {
        console.error('Web Serial API not supported in this browser');
        alert('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
        return;
    }

    try {
        connectionStatus = 'connecting';
        console.log('Requesting serial port...');

        // Request a port and open a connection
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });

        isConnected = true;
        connectionStatus = 'connected';
        console.log('Connected to Arduino');

        // Start reading from the port
        readSerialData();

    } catch (err) {
        console.error('Connection error:', err);
        connectionStatus = 'disconnected';
        isConnected = false;
    }
}

async function disconnectArduino() {
    try {
        if (reader) {
            await reader.cancel();
            reader = null;
        }
        if (port) {
            await port.close();
            port = null;
        }
        isConnected = false;
        connectionStatus = 'disconnected';
        console.log('Disconnected from Arduino');
    } catch (err) {
        console.error('Disconnect error:', err);
    }
}

async function readSerialData() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log('Reader closed');
                break;
            }

            // Append to buffer and process complete lines
            serialBuffer += value;
            let lines = serialBuffer.split('\n');

            // Keep the last incomplete line in the buffer
            serialBuffer = lines.pop();

            // Process complete lines
            for (let line of lines) {
                line = line.trim();
                if (line) {
                    processSerialLine(line);
                }
            }
        }
    } catch (err) {
        console.error('Read error:', err);
    } finally {
        reader.releaseLock();
    }
}

function processSerialLine(line) {
    if (debugMode) {
        console.log('[Arduino]:', line);
    }

    // Check for wave/flap command
    if (line === 'WAVE') {
        if (gameState === 'playing') {
            bird.flap();
            if (debugMode) {
                console.log('Physical flap detected!');
            }
        } else if (gameState === 'gameOver') {
            resetGame();
            if (debugMode) {
                console.log('Game restarted with physical wave!');
            }
        }
    }
    // Log other messages
    else if (line.startsWith('DEBUG:') || line.startsWith('Rest position:') ||
        line.includes('Calibrating') || line === 'READY') {
        console.log('[Arduino]:', line);
    }
}

async function calibrateArduino() {
    if (!isConnected) {
        console.log('Arduino not connected. Connect first with "-" key.');
        return;
    }

    try {
        console.log('Sending calibration command to Arduino...');
        const writer = port.writable.getWriter();
        const data = new Uint8Array([48]); // ASCII '0' to trigger calibration
        await writer.write(data);
        writer.releaseLock();
        console.log('Calibration command sent');
    } catch (err) {
        console.error('Calibration error:', err);
    }
}

function drawConnectionStatus() {
    const iconSize = 12;
    const x = width - iconSize - 10;
    const y = height - iconSize - 10;

    noStroke();

    // Draw colored circle based on connection status
    if (connectionStatus === 'connected') {
        fill(0, 255, 0); // Green
    } else if (connectionStatus === 'connecting') {
        fill(255, 255, 0); // Yellow
    } else {
        fill(255, 0, 0); // Red
    }

    circle(x + iconSize / 2, y + iconSize / 2, iconSize);

    // Add a subtle border
    stroke(0);
    strokeWeight(1);
    noFill();
    circle(x + iconSize / 2, y + iconSize / 2, iconSize);
}
