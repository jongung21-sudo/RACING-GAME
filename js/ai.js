/**
 * AI Opponent System
 * Controls 5 AI racing cars with distinct driving personalities, corner braking, and overtaking logic.
 */

class AIController {
    constructor(car, track, profile = {}) {
        this.car = car;
        this.track = track;

        // Personality profile
        this.targetSpeedMultiplier = profile.speedMultiplier || 1.0;
        this.cornerAggression = profile.cornerAggression || 1.0;
        this.racingLineOffset = profile.racingLineOffset || 0; // Ideal lateral position across track
        this.currentOffset = this.racingLineOffset;
        this.overtakeBias = 0;
        this.lookaheadDist = profile.lookaheadDist || 200;
        this.reactionTimer = 0;
    }

    update(allCars, dt) {
        if (this.car.finished) {
            // Coast to slow stop after race finish
            this.car.throttleInput = 0;
            this.car.steerInput = 0;
            return;
        }

        // 1. Locate current position along track
        const closest = this.track.getClosestSample(this.car.x, this.car.y);
        const totalSamples = this.track.samples.length;
        const currentIdx = closest.index;

        // 2. Corner anticipation and speed management
        // Look ahead 15 to 25 samples (~250-350px) to evaluate track curvature
        let maxUpcomingCurvature = 0;
        for (let i = 4; i <= 22; i++) {
            const sample = this.track.samples[(currentIdx + i) % totalSamples];
            if (sample.curvature > maxUpcomingCurvature) {
                maxUpcomingCurvature = sample.curvature;
            }
        }

        // Calculate safe corner entry speed
        let targetSpeed = this.car.maxSpeed * this.targetSpeedMultiplier;
        if (maxUpcomingCurvature > 0.045) {
            // Tight bend or hairpin ahead: brake in advance
            const brakeFactor = Math.max(0.48, 1.0 - (maxUpcomingCurvature * 7.5 * (1.1 - this.cornerAggression * 0.2)));
            targetSpeed *= brakeFactor;
        }

        // 3. Collision avoidance and overtaking
        let avoidanceOffset = 0;
        let shouldBrakeForCarAhead = false;

        for (let i = 0; i < allCars.length; i++) {
            const other = allCars[i];
            if (other === this.car) continue;

            const dx = other.x - this.car.x;
            const dy = other.y - this.car.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 160) {
                // Check if other car is in front
                const forwardX = Math.cos(this.car.heading);
                const forwardY = Math.sin(this.car.heading);
                const dotForward = (dx * forwardX + dy * forwardY) / dist;

                if (dotForward > 0.6) {
                    // Car is ahead of us
                    const rightX = -forwardY;
                    const rightY = forwardX;
                    const dotRight = (dx * rightX + dy * rightY);

                    // If directly in front and moving slower
                    if (dist < 90 && other.forwardSpeed < this.car.forwardSpeed) {
                        shouldBrakeForCarAhead = true;
                    }

                    // Steer around them: pick open side
                    if (Math.abs(dotRight) < 32) {
                        avoidanceOffset = dotRight >= 0 ? -38 : 38;
                    }
                }
            }
        }

        // Smoothly blend racing line with overtake avoidance
        const targetOffset = this.racingLineOffset + avoidanceOffset;
        this.currentOffset += (targetOffset - this.currentOffset) * 0.08;

        // 4. Lookahead Target Navigation
        // Speed-dependent lookahead distance
        const dynamicLookahead = this.lookaheadDist * (0.7 + (this.car.forwardSpeed / this.car.maxSpeed) * 0.5);
        const lookaheadSamples = Math.floor(dynamicLookahead / 15);
        const targetSampleIdx = (currentIdx + lookaheadSamples) % totalSamples;
        const targetSample = this.track.samples[targetSampleIdx];

        // Target position with lateral offset
        const targetX = targetSample.x + targetSample.normal.x * this.currentOffset;
        const targetY = targetSample.y + targetSample.normal.y * this.currentOffset;

        // Angle to target
        const desiredAngle = Math.atan2(targetY - this.car.y, targetX - this.car.x);
        let angleDiff = desiredAngle - this.car.heading;

        // Normalize angle to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // 5. Apply Steering
        this.car.steerInput = Math.max(-1, Math.min(1, angleDiff * 3.8));

        // 6. Apply Throttle / Brake
        if (shouldBrakeForCarAhead || this.car.forwardSpeed > targetSpeed + 0.6) {
            this.car.throttleInput = -0.65; // Brake
        } else if (this.car.forwardSpeed < targetSpeed) {
            this.car.throttleInput = 1.0;   // Accelerate
        } else {
            this.car.throttleInput = 0.3;   // Cruise
        }

        // Check if off-road: rapidly steer toward track centerline to rejoin asphalt
        if (this.car.isOffRoad) {
            this.currentOffset = 0;
            const returnSample = this.track.samples[(currentIdx + 5) % totalSamples];
            const returnAngle = Math.atan2(returnSample.y - this.car.y, returnSample.x - this.car.x);
            let returnDiff = returnAngle - this.car.heading;
            while (returnDiff > Math.PI) returnDiff -= Math.PI * 2;
            while (returnDiff < -Math.PI) returnDiff += Math.PI * 2;
            this.car.steerInput = Math.max(-1, Math.min(1, returnDiff * 3.8));
            this.car.throttleInput = 1.0;
        }
    }
}

// Factory helper to build the 5 AI opponents with unique profiles
function createAIOpponents(track, startPositions) {
    const aiDrivers = [
        {
            name: 'CYAN COMET',
            color: '#00e5ff',
            accentColor: '#ffffff',
            number: 2,
            profile: { speedMultiplier: 1.02, cornerAggression: 1.08, racingLineOffset: -18, lookaheadDist: 210 }
        },
        {
            name: 'SOLAR VIPER',
            color: '#ffd600',
            accentColor: '#111111',
            number: 3,
            profile: { speedMultiplier: 0.99, cornerAggression: 0.95, racingLineOffset: 16, lookaheadDist: 195 }
        },
        {
            name: 'VENOM GT',
            color: '#00e676',
            accentColor: '#ffffff',
            number: 4,
            profile: { speedMultiplier: 0.97, cornerAggression: 0.90, racingLineOffset: -24, lookaheadDist: 185 }
        },
        {
            name: 'SHADOW PURPLE',
            color: '#d500f9',
            accentColor: '#ffffff',
            number: 5,
            profile: { speedMultiplier: 1.01, cornerAggression: 1.04, racingLineOffset: 22, lookaheadDist: 205 }
        },
        {
            name: 'BLAZE RACER',
            color: '#ff6d00',
            accentColor: '#111111',
            number: 6,
            profile: { speedMultiplier: 0.98, cornerAggression: 0.98, racingLineOffset: 0, lookaheadDist: 190 }
        }
    ];

    const aiCars = [];
    const aiControllers = [];

    aiDrivers.forEach((driver, idx) => {
        // AI cars take grid slots 1 through 5 (Player takes slot 0 / pole or slot 5)
        const pos = startPositions[idx + 1] || startPositions[0];
        const car = new Car({
            id: 'ai_' + (idx + 1),
            name: driver.name,
            color: driver.color,
            accentColor: driver.accentColor,
            number: driver.number,
            isPlayer: false,
            x: pos.x,
            y: pos.y,
            angle: pos.angle
        });

        const controller = new AIController(car, track, driver.profile);
        aiCars.push(car);
        aiControllers.push(controller);
    });

    return { aiCars, aiControllers };
}

window.AIController = AIController;
window.createAIOpponents = createAIOpponents;
