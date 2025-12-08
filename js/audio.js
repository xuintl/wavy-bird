// Pitch detection
let mic;
let pitch;
let audioContext;
let currentFreq = 0;
let smoothedFreq = 0;
let freqHistory = []; // Store recent frequencies for better smoothing
const SMOOTHING_WINDOW = 5; // Number of readings to average

// Calibration
let minPitch = DEFAULT_MIN_PITCH;
let maxPitch = DEFAULT_MAX_PITCH;
let noiseThreshold = NOISE_THRESHOLD;
let isCalibratingLow = false;
let isCalibratingHigh = false;

function startPitch() {
    // Create a new mic instance each time we start pitch detection
    mic = new p5.AudioIn();
    // The callback function will start pitch detection after the mic is ready
    mic.start(() => {
        pitch = ml5.pitchDetection(MODEL_URL, audioContext, mic.stream, modelLoaded);
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

        // Throttled logging for pitch to avoid console flood (every ~60 frames or 1 sec approx)
        if (frameCount % 60 === 0) {
            console.log(`[DEBUG] Pitch: ${currentFreq.toFixed(2)} Hz | Smoothed: ${smoothedFreq.toFixed(2)} Hz | Amp: ${amplitude.toFixed(3)}`);
        }

        // Continue the loop
        if (typeof gameState !== 'undefined' && gameState !== 'gameOver') {
            getPitch();
        } else if (typeof gameState === 'undefined') {
            // Fallback if gameState not available
            getPitch();
        }
    });
}

// We need to handle voiceIsActive. It's used in sketch.js (initialized to false).
// I'll add it here.
let voiceIsActive = false;
