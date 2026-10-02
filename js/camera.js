/**
 * Cinematic Smooth Follow Camera
 * Centers on the player car with velocity lookahead, smooth damping, and screen shake.
 */

class Camera {
    constructor(viewportWidth = 1280, viewportHeight = 720) {
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;

        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;

        // Smoothing factor (lerp)
        this.smoothSpeed = 0.085;

        // Screen shake
        this.shakeAmount = 0;
        this.shakeDecay = 0.88;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
    }

    setViewport(width, height) {
        this.viewportWidth = width;
        this.viewportHeight = height;
    }

    reset(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.shakeAmount = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
    }

    addShake(amount) {
        this.shakeAmount = Math.min(25, this.shakeAmount + amount);
    }

    update(targetX, targetY, heading, speed) {
        // Lookahead: bias camera slightly in the direction the car is traveling
        const lookaheadDist = Math.min(speed * 18, 140);
        this.targetX = targetX + Math.cos(heading) * lookaheadDist;
        this.targetY = targetY + Math.sin(heading) * lookaheadDist;

        // Smooth damping towards target
        this.x += (this.targetX - this.x) * this.smoothSpeed;
        this.y += (this.targetY - this.y) * this.smoothSpeed;

        // Update screen shake
        if (this.shakeAmount > 0.3) {
            this.shakeOffsetX = (Math.random() - 0.5) * 2 * this.shakeAmount;
            this.shakeOffsetY = (Math.random() - 0.5) * 2 * this.shakeAmount;
            this.shakeAmount *= this.shakeDecay;
        } else {
            this.shakeAmount = 0;
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
        }
    }

    apply(ctx) {
        ctx.save();
        // Translate screen center to camera position
        ctx.translate(
            Math.round(this.viewportWidth * 0.5 + this.shakeOffsetX),
            Math.round(this.viewportHeight * 0.5 + this.shakeOffsetY)
        );
        ctx.translate(-Math.round(this.x), -Math.round(this.y));
    }

    restore(ctx) {
        ctx.restore();
    }

    // Convert screen coordinates to world coordinates
    screenToWorld(sx, sy) {
        return {
            x: sx - (this.viewportWidth * 0.5 + this.shakeOffsetX) + this.x,
            y: sy - (this.viewportHeight * 0.5 + this.shakeOffsetY) + this.y
        };
    }

    // Convert world coordinates to screen coordinates
    worldToScreen(wx, wy) {
        return {
            x: wx - this.x + (this.viewportWidth * 0.5 + this.shakeOffsetX),
            y: wy - this.y + (this.viewportHeight * 0.5 + this.shakeOffsetY)
        };
    }
}

window.Camera = Camera;
