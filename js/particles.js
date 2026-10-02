/**
 * Particle and Visual Effects System
 * Manages tire skid marks, tire smoke, grass dust, collision sparks, and speed lines.
 */

class ParticleSystem {
    constructor(worldWidth = 3500, worldHeight = 2500) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        // Particle pools
        this.smokeParticles = [];
        this.dustParticles = [];
        this.sparks = [];

        // Offscreen canvas for persistent high-performance skid marks
        this.skidCanvas = document.createElement('canvas');
        this.skidCanvas.width = worldWidth;
        this.skidCanvas.height = worldHeight;
        this.skidCtx = this.skidCanvas.getContext('2d');

        // Speed lines state
        this.speedLines = [];
        for (let i = 0; i < 40; i++) {
            this.speedLines.push({
                x: Math.random(),
                y: Math.random(),
                length: 20 + Math.random() * 50,
                speed: 15 + Math.random() * 25,
                alpha: Math.random() * 0.4
            });
        }
    }

    reset() {
        this.smokeParticles = [];
        this.dustParticles = [];
        this.sparks = [];
        this.skidCtx.clearRect(0, 0, this.worldWidth, this.worldHeight);
    }

    // Add continuous tire skid mark to offscreen buffer
    addSkidSegment(p1, p2, width = 4, alpha = 0.35) {
        if (!this.skidCtx) return;
        this.skidCtx.strokeStyle = `rgba(18, 18, 20, ${alpha})`;
        this.skidCtx.lineWidth = width;
        this.skidCtx.lineCap = 'round';
        this.skidCtx.beginPath();
        this.skidCtx.moveTo(p1.x, p1.y);
        this.skidCtx.lineTo(p2.x, p2.y);
        this.skidCtx.stroke();
    }

    // Spawn white smoke puffs when tires are sliding
    emitDriftSmoke(x, y, vx, vy) {
        if (this.smokeParticles.length > 250) return;
        this.smokeParticles.push({
            x: x + (Math.random() - 0.5) * 6,
            y: y + (Math.random() - 0.5) * 6,
            vx: vx * 0.2 + (Math.random() - 0.5) * 1.5,
            vy: vy * 0.2 + (Math.random() - 0.5) * 1.5,
            radius: 4 + Math.random() * 3,
            maxRadius: 18 + Math.random() * 10,
            alpha: 0.5 + Math.random() * 0.25,
            life: 1.0,
            decay: 0.025 + Math.random() * 0.015
        });
    }

    // Spawn dirt / grass debris when tires are on the grass
    emitGrassDust(x, y, vx, vy) {
        if (this.dustParticles.length > 200) return;
        const count = 2;
        for (let i = 0; i < count; i++) {
            const isBrown = Math.random() > 0.4;
            this.dustParticles.push({
                x: x + (Math.random() - 0.5) * 8,
                y: y + (Math.random() - 0.5) * 8,
                vx: -vx * 0.25 + (Math.random() - 0.5) * 3,
                vy: -vy * 0.25 + (Math.random() - 0.5) * 3,
                size: 2.5 + Math.random() * 3,
                color: isBrown ? '#5d4037' : '#33691e',
                alpha: 0.7,
                life: 1.0,
                decay: 0.035 + Math.random() * 0.02
            });
        }
    }

    // Spawn energetic bright sparks on hard collision
    emitSparks(x, y, normalX, normalY, count = 12) {
        for (let i = 0; i < count; i++) {
            const angle = Math.atan2(normalY, normalX) + (Math.random() - 0.5) * Math.PI * 0.8;
            const speed = 4 + Math.random() * 9;
            this.sparks.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                length: 4 + Math.random() * 6,
                color: Math.random() > 0.3 ? '#ffea00' : '#ff3d00',
                alpha: 1.0,
                decay: 0.05 + Math.random() * 0.04
            });
        }
    }

    update(dt) {
        // Update drift smoke
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.radius += (p.maxRadius - p.radius) * 0.08;
            p.life -= p.decay;
            p.alpha = Math.max(0, p.life * 0.45);
            if (p.life <= 0) {
                this.smokeParticles.splice(i, 1);
            }
        }

        // Update grass dust
        for (let i = this.dustParticles.length - 1; i >= 0; i--) {
            const p = this.dustParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            p.alpha = Math.max(0, p.life * 0.7);
            if (p.life <= 0) {
                this.dustParticles.splice(i, 1);
            }
        }

        // Update collision sparks
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.x += s.vx;
            s.y += s.vy;
            s.vx *= 0.94;
            s.vy *= 0.94;
            s.alpha -= s.decay;
            if (s.alpha <= 0) {
                this.sparks.splice(i, 1);
            }
        }
    }

    // Render world-space particles (skids, smoke, dust, sparks)
    renderWorld(ctx) {
        // 1. Skid marks from offscreen canvas
        ctx.drawImage(this.skidCanvas, 0, 0);

        // 2. Grass dust
        for (let i = 0; i < this.dustParticles.length; i++) {
            const p = this.dustParticles[i];
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // 3. Smoke puffs
        for (let i = 0; i < this.smokeParticles.length; i++) {
            const p = this.smokeParticles[i];
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. Collision sparks
        for (let i = 0; i < this.sparks.length; i++) {
            const s = this.sparks[i];
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = s.alpha;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * 1.5, s.y - s.vy * 1.5);
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;
    }

    // Render screen-space speed lines (when car is moving fast)
    renderSpeedLines(ctx, screenWidth, screenHeight, speedRatio) {
        if (speedRatio < 0.72) return;

        const intensity = (speedRatio - 0.72) / 0.28;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;

        const centerX = screenWidth * 0.5;
        const centerY = screenHeight * 0.5;

        // Radiating streaks from outer edges toward center
        const streakCount = Math.floor(18 * intensity);
        for (let i = 0; i < streakCount; i++) {
            const angle = (i / streakCount) * Math.PI * 2 + (Date.now() * 0.003);
            const distInner = Math.min(screenWidth, screenHeight) * (0.35 + Math.random() * 0.1);
            const distOuter = Math.min(screenWidth, screenHeight) * 0.65;

            const x1 = centerX + Math.cos(angle) * distInner;
            const y1 = centerY + Math.sin(angle) * distInner;
            const x2 = centerX + Math.cos(angle) * distOuter;
            const y2 = centerY + Math.sin(angle) * distOuter;

            ctx.globalAlpha = (0.2 + Math.random() * 0.35) * intensity;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

window.ParticleSystem = ParticleSystem;
