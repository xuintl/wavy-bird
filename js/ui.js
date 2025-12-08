class FloatingText {
    constructor(x, y, text, color, vy) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.vy = vy; // 1 = rise, -1 = fall, 0 = horizontal drift
        this.vx = this.vy === 0 ? 0.5 : 0;
        this.alpha = 255;
        this.birthMs = millis();
        this.lifetimeMs = 1500;
    }

    update() {
        this.y += this.vy * 0.5;
        this.x += this.vx;
        const age = millis() - this.birthMs;
        this.alpha = map(age, 0, this.lifetimeMs, 255, 0);
    }

    show() {
        push();
        fill(red(this.color), green(this.color), blue(this.color), this.alpha);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(18);
        textStyle(BOLD);
        text(this.text, this.x, this.y);
        pop();
    }

    isDead(now) {
        return (now - this.birthMs) > this.lifetimeMs;
    }
}
