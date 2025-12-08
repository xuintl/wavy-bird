class Pipe {
    constructor(spacing = 125, speed = BASE_SCROLL_SPEED) {
        this.spacing = spacing; // Space between top and bottom pipe
        this.top = random(height / 6, 3 / 4 * height - this.spacing);
        this.bottom = this.top + this.spacing;
        this.x = width;
        this.w = 52; // Width of the pipe asset
        this.speed = speed;
        this.passed = false;
        this.trial = null; // {trialNum, word, category, colorCue, expectedTilt, wordShownMs, pipeCleared, level}
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
