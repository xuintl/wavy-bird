// Base canvas dimensions (keep game logic consistent)
const BASE_WIDTH = 288;
const BASE_HEIGHT = 512;
const BASE_SCROLL_SPEED = 1.8; // Lower to slow the scene
const INVULN_MS = 1200; // Grace period after start to avoid insta-death

// Stages (tutorial + 3 levels)
const stages = [
    { key: 'tutorial', label: 'Tutorial - Practice', pipeIntervalMs: 5000, gap: 320, targetPasses: 8, maxDurationMs: 120000 },
    { key: 'level1', label: 'Level 1', pipeIntervalMs: 4000, gap: 280, targetPasses: 15 },
    { key: 'level2', label: 'Level 2', pipeIntervalMs: 3500, gap: 260, targetPasses: 15 },
    { key: 'level3', label: 'Level 3', pipeIntervalMs: 3000, gap: 240, targetPasses: 10 }
];

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/';
