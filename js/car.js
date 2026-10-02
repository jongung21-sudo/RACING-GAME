// Polyfill for roundRect to support older browsers
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r = 0) {
        if (typeof r === 'number') r = [r, r, r, r];
        const [tl, tr, br, bl] = r;
        this.beginPath();
        this.moveTo(x + tl, y);
        this.lineTo(x + w - tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + tr);
        this.lineTo(x + w, y + h - br);
        this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        this.lineTo(x + bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - bl);
        this.lineTo(x, y + tl);
        this.quadraticCurveTo(x, y, x + tl, y);
        this.closePath();
        return this;
    };
}

class Car {
    constructor(config = {}) {
        // Identification & Appearance
        this.id = config.id || 'car_' + Math.random().toString(36).substr(2, 6);
        this.name = config.name || 'Driver';
        this.isPlayer = config.isPlayer || false;
        this.color = config.color || '#ff204e';
        this.accentColor = config.accentColor || '#ffffff';
        this.number = config.number || 1;

        // Dimensions (oriented bounding box)
        this.width = 24;
        this.length = 46;
        this.halfWidth = this.width * 0.5;
        this.halfLength = this.length * 0.5;
        this.collisionRadius = 22;

        // Position & Orientation
        this.x = config.x || 0;
        this.y = config.y || 0;
        this.heading = config.angle || 0; // Car facing angle in radians
        this.angularVelocity = 0;

        // Velocity vectors (World coordinates)
        this.vx = 0;
        this.vy = 0;
        this.forwardSpeed = 0; // Speed along car heading
        this.lateralSpeed = 0; // Sideways slip speed

        // Arcade Performance Parameters
        this.maxSpeed = config.maxSpeed || 14.5;       // ~200 km/h display speed
        this.maxReverseSpeed = 5.0;
        this.acceleration = config.acceleration || 0.22;
        this.braking = 0.35;
        this.reverseAcceleration = 0.12;
        this.baseSteerRate = 0.052;
        this.airDrag = 0.015;
        this.rollingResistance = 0.02;

        // Drift / Grip settings
        this.isDrifting = false;
        this.driftIntensity = 0;
        this.handbrake = false;
        this.currentSurface = 'asphalt';
        this.isOffRoad = false;

        // Controls input state (set by Player or AI)
        this.throttleInput = 0; // -1 (reverse/brake) to +1 (forward)
        this.steerInput = 0;    // -1 (left) to +1 (right)
        this.handbrakeInput = false;

        // Lap tracking state (Continuous track distance)
        this.currentLap = 1;
        this.totalLaps = 3;
        this.hasPassedHalfway = false;
        this.prevSampleDist = null;
        this.lapStartTime = 0;
        this.currentLapTime = 0;
        this.bestLapTime = null;
        this.lapHistory = [];
        this.finished = false;
        this.finishTime = 0;
        this.totalRaceTime = 0;
        this.finalRank = 0;
        this.isWrongWay = false;
        this.raceProgress = 0;

        // Tire positions relative to car center (for skids & particles)
        this.prevTirePositions = null;
    }

    reset(x, y, angle) {
        this.x = x;
        this.y = y;
        this.heading = angle;
        this.vx = 0;
        this.vy = 0;
        this.forwardSpeed = 0;
        this.lateralSpeed = 0;
        this.angularVelocity = 0;
        this.isDrifting = false;
        this.driftIntensity = 0;
        this.handbrake = false;
        this.throttleInput = 0;
        this.steerInput = 0;
        this.handbrakeInput = false;
        this.currentLap = 1;
        this.hasPassedHalfway = false;
        this.prevSampleDist = null;
        this.lapStartTime = 0;
        this.currentLapTime = 0;
        this.bestLapTime = null;
        this.lapHistory = [];
        this.finished = false;
        this.finishTime = 0;
        this.totalRaceTime = 0;
        this.finalRank = 0;
        this.isWrongWay = false;
        this.raceProgress = 0;
        this.prevTirePositions = null;
    }

    // Get current speed in km/h for HUD display
    getSpeedKmH() {
        const speed = Math.hypot(this.vx, this.vy);
        return Math.round(speed * 14.2);
    }

    getSpeedRatio() {
        return Math.min(1, Math.hypot(this.vx, this.vy) / this.maxSpeed);
    }

    // World coordinates of the four tires
    getTireWorldPositions() {
        const cos = Math.cos(this.heading);
        const sin = Math.sin(this.heading);

        const frontOffset = this.halfLength * 0.65;
        const rearOffset = -this.halfLength * 0.65;
        const lateralOffset = this.halfWidth * 0.88;

        return {
            frontLeft: {
                x: this.x + cos * frontOffset - sin * (-lateralOffset),
                y: this.y + sin * frontOffset + cos * (-lateralOffset)
            },
            frontRight: {
                x: this.x + cos * frontOffset - sin * (lateralOffset),
                y: this.y + sin * frontOffset + cos * (lateralOffset)
            },
            rearLeft: {
                x: this.x + rearOffset * cos - sin * (-lateralOffset),
                y: this.y + rearOffset * sin + cos * (-lateralOffset)
            },
            rearRight: {
                x: this.x + rearOffset * cos - sin * (lateralOffset),
                y: this.y + rearOffset * sin + cos * (lateralOffset)
            }
        };
    }

    updatePhysics(dt, track, particleSystem, soundEngine) {
        // Forward and Lateral unit vectors
        const forwardX = Math.cos(this.heading);
        const forwardY = Math.sin(this.heading);
        const rightX = -forwardY;
        const rightY = forwardX;

        // Decompose velocity into forward and lateral components
        this.forwardSpeed = this.vx * forwardX + this.vy * forwardY;
        this.lateralSpeed = this.vx * rightX + this.vy * rightY;

        // Check track surface
        const surfaceInfo = track.getSurfaceInfo(this.x, this.y);
        this.currentSurface = surfaceInfo.surface;
        this.isOffRoad = surfaceInfo.isOffRoad;

        // Max speed and drag adjust dynamically based on terrain
        let effectiveMaxSpeed = this.maxSpeed;
        let surfaceFriction = 1.0;

        if (this.isOffRoad) {
            // Significant slowdown on grass (capped to 35% speed)
            effectiveMaxSpeed = this.maxSpeed * 0.38;
            surfaceFriction = 2.6;
        } else if (surfaceInfo.isCurb) {
            effectiveMaxSpeed = this.maxSpeed * 0.92;
        }

        // 1. Steering
        const speedMagnitude = Math.hypot(this.vx, this.vy);
        if (speedMagnitude > 0.3) {
            // High-speed steering is slightly more stable (arcade feel)
            const speedRatio = Math.min(1, speedMagnitude / this.maxSpeed);
            const steerFactor = 1.0 - speedRatio * 0.32;
            const turnDirection = Math.sign(this.forwardSpeed) || 1;

            this.heading += this.steerInput * this.baseSteerRate * steerFactor * turnDirection;
        }

        // 2. Throttle & Braking
        if (this.throttleInput > 0) {
            // Accelerating forward
            if (this.forwardSpeed < effectiveMaxSpeed) {
                const accel = this.acceleration * this.throttleInput;
                this.forwardSpeed += accel;
            }
        } else if (this.throttleInput < 0) {
            // Braking or reversing
            if (this.forwardSpeed > 0.8) {
                // Strong brake
                this.forwardSpeed -= this.braking * Math.abs(this.throttleInput);
            } else if (this.forwardSpeed >= -this.maxReverseSpeed) {
                // Reverse gear
                this.forwardSpeed -= this.reverseAcceleration * Math.abs(this.throttleInput);
            }
        }

        // 3. Rolling resistance and air drag
        this.forwardSpeed *= (1 - (this.rollingResistance * surfaceFriction + this.airDrag));

        // 4. Lateral grip & Drifting
        this.handbrake = this.handbrakeInput;
        let gripCoeff = 0.90; // Normal tire cornering grip

        if (this.handbrake) {
            gripCoeff = 0.38; // Handbrake drift initiates slide
        } else if (Math.abs(this.lateralSpeed) > 3.0 && speedMagnitude > 6.0) {
            // Natural dynamic slide during aggressive sharp cornering
            gripCoeff = 0.58;
        }

        if (this.isOffRoad) {
            gripCoeff = 0.45; // Slippery on grass
        }

        // Dampen lateral speed by grip coefficient
        this.lateralSpeed *= (1 - gripCoeff);

        // Reconstruct velocity from forward and lateral components
        this.vx = forwardX * this.forwardSpeed + rightX * this.lateralSpeed;
        this.vy = forwardY * this.forwardSpeed + rightY * this.lateralSpeed;

        // Apply movement
        this.x += this.vx;
        this.y += this.vy;

        // 5. Barrier Collision handling
        if (surfaceInfo.hitsBarrier && surfaceInfo.barrierNormal) {
            // Push car out of barrier
            const pushDist = (surfaceInfo.absOffset - (track.roadWidth * 0.5 + track.barrierOffset)) + 6;
            this.x += surfaceInfo.barrierNormal.x * pushDist;
            this.y += surfaceInfo.barrierNormal.y * pushDist;

            // Reflect velocity with significant restitution damping
            const normal = surfaceInfo.barrierNormal;
            const dot = this.vx * normal.x + this.vy * normal.y;
            if (dot < 0) {
                this.vx = (this.vx - 1.4 * dot * normal.x) * 0.52;
                this.vy = (this.vy - 1.4 * dot * normal.y) * 0.52;

                // Visual and audio effects
                if (particleSystem) {
                    particleSystem.emitSparks(this.x, this.y, normal.x, normal.y, 14);
                }
                if (soundEngine && this.isPlayer) {
                    soundEngine.playCollision(Math.min(1.5, Math.abs(dot) * 0.2));
                }
                if (this.isPlayer && window.gameCamera) {
                    window.gameCamera.addShake(Math.min(14, Math.abs(dot) * 2.2));
                }
            }
        }

        // 6. Drift evaluation & Particle emission
        const currentTires = this.getTireWorldPositions();
        this.driftIntensity = Math.min(1, Math.abs(this.lateralSpeed) / 4.2 + (this.handbrake ? 0.4 : 0));
        this.isDrifting = (this.driftIntensity > 0.32 && speedMagnitude > 3.0);

        if (particleSystem && this.prevTirePositions) {
            // Tire skid marks during drifting or hard braking
            const shouldSkid = this.isDrifting || (this.throttleInput < -0.4 && this.forwardSpeed > 5.0);

            if (shouldSkid && !this.isOffRoad) {
                const alpha = Math.min(0.45, this.driftIntensity * 0.4);
                particleSystem.addSkidSegment(this.prevTirePositions.rearLeft, currentTires.rearLeft, 3.5, alpha);
                particleSystem.addSkidSegment(this.prevTirePositions.rearRight, currentTires.rearRight, 3.5, alpha);

                // Drift smoke from rear tires
                if (Math.random() > 0.25) {
                    particleSystem.emitDriftSmoke(currentTires.rearLeft.x, currentTires.rearLeft.y, this.vx, this.vy);
                    particleSystem.emitDriftSmoke(currentTires.rearRight.x, currentTires.rearRight.y, this.vx, this.vy);
                }
            }

            // Grass dust particles when off-road
            if (this.isOffRoad && speedMagnitude > 2.0) {
                if (Math.random() > 0.4) {
                    particleSystem.emitGrassDust(currentTires.rearLeft.x, currentTires.rearLeft.y, this.vx, this.vy);
                    particleSystem.emitGrassDust(currentTires.rearRight.x, currentTires.rearRight.y, this.vx, this.vy);
                }
            }
        }

        this.prevTirePositions = currentTires;

        // Audio updates for player
        if (this.isPlayer && soundEngine) {
            const isAcc = this.throttleInput > 0.1;
            const isBrk = this.throttleInput < -0.1;
            soundEngine.updateEngine(this.getSpeedRatio(), isAcc, isBrk);
            soundEngine.updateSkid(this.isDrifting ? this.driftIntensity : 0);
        }

        // Update checkpoints and lap progress
        this.updateCheckpoints(track, soundEngine);
    }

    updateCheckpoints(track, soundEngine) {
        if (this.finished) return;

        const totalSamples = track.samples.length;
        const { sample, index } = track.getClosestSample(this.x, this.y);

        // Distance from start line along track (0 to totalSamples - 1)
        const sampleDist = (index - track.startSampleIdx + totalSamples) % totalSamples;

        // Wrong way detection
        const forwardDot = (sample.tangent.x * Math.cos(this.heading)) + (sample.tangent.y * Math.sin(this.heading));
        this.isWrongWay = (this.forwardSpeed > 2.0 && forwardDot < -0.2);

        // Mark halfway reached when car drives through the midsection of the track (35% to 85%)
        if (sampleDist > totalSamples * 0.35 && sampleDist < totalSamples * 0.85) {
            this.hasPassedHalfway = true;
        }

        // Detect crossing start/finish line:
        // Car was in the final sector (> 75% track length) and now transitioned to the start sector (< 20% track length)
        // AND hasPassedHalfway is true (prevents cheating or backwards crossing)
        if (this.prevSampleDist !== null) {
            const crossedFinishLine = (this.prevSampleDist > totalSamples * 0.70 && sampleDist < totalSamples * 0.25 && this.hasPassedHalfway);

            if (crossedFinishLine) {
                this.hasPassedHalfway = false; // Reset for next lap

                if (this.lapStartTime > 0) {
                    const now = performance.now();
                    const lapDuration = (now - this.lapStartTime) / 1000;
                    this.lapHistory.push(lapDuration);

                    if (this.bestLapTime === null || lapDuration < this.bestLapTime) {
                        this.bestLapTime = lapDuration;
                    }

                    if (this.isPlayer && soundEngine) {
                        soundEngine.playLapSound();
                    }

                    this.lapStartTime = now;
                } else {
                    this.lapStartTime = performance.now();
                }

                this.currentLap++;

                // Race finished after completing 3 laps!
                if (this.currentLap > this.totalLaps) {
                    this.finished = true;
                    this.currentLap = this.totalLaps;
                    this.finishTime = performance.now();
                    this.totalRaceTime = this.lapHistory.reduce((a, b) => a + b, 0);
                }
            }
        }

        this.prevSampleDist = sampleDist;

        // Continuous progress metric for live race ranking
        this.raceProgress = (this.currentLap - 1) * totalSamples + sampleDist;
    }

    // Car-to-Car Collision Resolution
    checkCarCollision(otherCar, particleSystem, soundEngine) {
        const dx = otherCar.x - this.x;
        const dy = otherCar.y - this.y;
        const dist = Math.hypot(dx, dy);
        const minDist = this.collisionRadius + otherCar.collisionRadius;

        if (dist < minDist && dist > 0.001) {
            // Overlap detected: separate cars along collision normal
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = (minDist - dist) * 0.5;

            this.x -= nx * overlap;
            this.y -= ny * overlap;
            otherCar.x += nx * overlap;
            otherCar.y += ny * overlap;

            // Momentum exchange (elastic collision with damping)
            const kx = this.vx - otherCar.vx;
            const ky = this.vy - otherCar.vy;
            const p = 2 * (nx * kx + ny * ky) / 2; // Equal mass assumption

            this.vx -= p * nx * 0.65;
            this.vy -= p * ny * 0.65;
            otherCar.vx += p * nx * 0.65;
            otherCar.vy += p * ny * 0.65;

            // Collision effects
            if (particleSystem && Math.abs(p) > 1.5) {
                const midX = (this.x + otherCar.x) * 0.5;
                const midY = (this.y + otherCar.y) * 0.5;
                particleSystem.emitSparks(midX, midY, -nx, -ny, 8);
            }

            if (soundEngine && (this.isPlayer || otherCar.isPlayer) && Math.abs(p) > 1.2) {
                soundEngine.playCollision(Math.min(1.2, Math.abs(p) * 0.25));
                if (window.gameCamera) {
                    window.gameCamera.addShake(Math.min(10, Math.abs(p) * 1.5));
                }
            }
        }
    }

    // Render detailed vector top-down car
    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.heading);

        const w = this.width;
        const l = this.length;
        const hw = this.halfWidth;
        const hl = this.halfLength;

        // 1. Soft directional drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.beginPath();
        ctx.roundRect(-hl + 4, -hw + 4, l, w, 7);
        ctx.fill();

        // 2. Wheels / Tires (4 corners)
        ctx.fillStyle = '#1a1a1a';
        const wheelW = 10;
        const wheelH = 5;

        // Front-left wheel
        ctx.beginPath();
        ctx.roundRect(hl * 0.45, -hw - 1.5, wheelW, wheelH, 2);
        ctx.fill();
        // Front-right wheel
        ctx.beginPath();
        ctx.roundRect(hl * 0.45, hw - wheelH + 1.5, wheelW, wheelH, 2);
        ctx.fill();
        // Rear-left wheel
        ctx.beginPath();
        ctx.roundRect(-hl * 0.75, -hw - 1.5, wheelW, wheelH, 2);
        ctx.fill();
        // Rear-right wheel
        ctx.beginPath();
        ctx.roundRect(-hl * 0.75, hw - wheelH + 1.5, wheelW, wheelH, 2);
        ctx.fill();

        // 3. Aerodynamic Car Body Chassis
        ctx.fillStyle = this.color;
        ctx.beginPath();
        // Front nose curve
        ctx.moveTo(hl, 0);
        ctx.bezierCurveTo(hl, -hw * 0.7, hl * 0.7, -hw, hl * 0.3, -hw);
        // Left side
        ctx.lineTo(-hl * 0.75, -hw);
        // Rear left wing
        ctx.lineTo(-hl, -hw * 0.9);
        // Rear tail
        ctx.lineTo(-hl, hw * 0.9);
        // Rear right wing
        ctx.lineTo(-hl * 0.75, hw);
        // Right side
        ctx.lineTo(hl * 0.3, hw);
        // Front right curve
        ctx.bezierCurveTo(hl * 0.7, hw, hl, hw * 0.7, hl, 0);
        ctx.closePath();
        ctx.fill();

        // Subtle body outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // 4. Racing Stripes / Accent livery
        ctx.fillStyle = this.accentColor;
        ctx.fillRect(-hl * 0.6, -2, l * 0.9, 4);

        // 5. Cockpit & Windshield
        // Front windshield (curved black/tinted glass)
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.moveTo(hl * 0.35, -hw * 0.6);
        ctx.lineTo(hl * 0.35, hw * 0.6);
        ctx.lineTo(-hl * 0.25, hw * 0.68);
        ctx.lineTo(-hl * 0.25, -hw * 0.68);
        ctx.closePath();
        ctx.fill();

        // Windshield reflection highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.moveTo(hl * 0.32, -hw * 0.5);
        ctx.lineTo(hl * 0.1, -hw * 0.5);
        ctx.lineTo(-hl * 0.15, -hw * 0.2);
        ctx.lineTo(hl * 0.1, -hw * 0.2);
        ctx.closePath();
        ctx.fill();

        // Roof panel
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(-hl * 0.2, -hw * 0.5, l * 0.32, hw, 3);
        ctx.fill();

        // 6. Rear Spoiler / Wing
        ctx.fillStyle = '#111111';
        ctx.fillRect(-hl - 2, -hw * 0.95, 4, hw * 1.9);

        // Spoiler endplates
        ctx.fillStyle = this.color;
        ctx.fillRect(-hl - 3, -hw * 0.95, 5, 2.5);
        ctx.fillRect(-hl - 3, hw * 0.95 - 2.5, 5, 2.5);

        // 7. Headlights (Bright neon LEDs)
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 4;
        ctx.fillRect(hl - 3, -hw * 0.72, 3, 4);
        ctx.fillRect(hl - 3, hw * 0.72 - 4, 3, 4);
        ctx.shadowBlur = 0; // Reset shadow

        // 8. Taillights & Glowing Brake Lights
        const isBraking = this.throttleInput < -0.1 || this.handbrake;
        ctx.fillStyle = isBraking ? '#ff0033' : '#aa0011';
        if (isBraking) {
            ctx.shadowColor = '#ff0033';
            ctx.shadowBlur = 8;
        }
        ctx.fillRect(-hl, -hw * 0.8, 2.5, 4.5);
        ctx.fillRect(-hl, hw * 0.8 - 4.5, 2.5, 4.5);
        ctx.shadowBlur = 0;

        ctx.restore();
    }
}

window.Car = Car;
