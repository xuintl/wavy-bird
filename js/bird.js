class Bird {
    constructor() {
        this.y = height / 2;
        this.x = 64;
        this.w = 34; // Approximate width from asset
        this.h = 24; // Approximate height from asset
        this.vy = 0;
        this.gravity = 0.2; // Further reduced for slower fall
        this.lift = -6.5; // Softer flap for finer control
        this.frame = 0;
    }

    show() {
        // Animate the bird by cycling through frames
        const currentFrame = birdFrames[floor(this.frame) % birdFrames.length];
        image(currentFrame, this.x - this.w / 2, this.y - this.h / 2);
        this.frame += 0.2; // Control animation speed
    }

    update() {
        this.vy += this.gravity;
        this.y += this.vy;

        // Keep bird in bounds
        if (this.y < 0) {
            this.y = 0;
            this.vy = 0;
        }
        const floorY = height - sprites.base.height;
        if (this.y > floorY) {
            this.y = floorY;
            this.vy = 0;
        }
    }

    flap() {
        this.vy = this.lift;
        if (sounds.wing && !sounds.wing.isPlaying()) {
            sounds.wing.play();
        }
    }
}
