/**
 * Main Game Controller and Engine Loop
 * Orchestrates game state, input handling, physics updates, rendering, and race lifecycle.
 */

class GameManager {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Virtual internal resolution
        this.virtualWidth = 1280;
        this.virtualHeight = 720;
        this.canvas.width = this.virtualWidth;
        this.canvas.height = this.virtualHeight;

        // Subsystems
        this.track = new Track();
        this.camera = new Camera(this.virtualWidth, this.virtualHeight);
        window.gameCamera = this.camera;
        this.particles = new ParticleSystem(3500, 2500);
        this.ui = new UIManager();
        this.sound = window.soundEngine;

        // Entities
        this.playerCar = null;
        this.aiCars = [];
        this.aiControllers = [];
        this.allCars = [];

        // Game State: 'MENU', 'COUNTDOWN', 'RACING', 'FINISHED'
        this.state = 'MENU';
        this.countdownTimer = 0;
        this.countdownStep = 3;
        this.raceStartTime = 0;
        this.raceTime = 0;

        // Keyboard Input Map
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false,
            space: false
        };

        // Time tracking
        this.lastFrameTime = performance.now();

        // Bind events and initialize
        this.setupEventListeners();
        this.setupCars();
        this.handleResize();

        // Start game loop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    setupEventListeners() {
        // Keyboard controls
        window.addEventListener('keydown', (e) => {
            // Unlock Web Audio context on user gesture
            if (this.sound && !this.sound.isInitialized) {
                this.sound.init();
            }

            const code = e.code;
            if (code === 'KeyW' || code === 'ArrowUp') { this.keys.up = true; e.preventDefault(); }
            if (code === 'KeyS' || code === 'ArrowDown') { this.keys.down = true; e.preventDefault(); }
            if (code === 'KeyA' || code === 'ArrowLeft') { this.keys.left = true; e.preventDefault(); }
            if (code === 'KeyD' || code === 'ArrowRight') { this.keys.right = true; e.preventDefault(); }
            if (code === 'Space') { this.keys.space = true; e.preventDefault(); }

            // Quick reset on track if stuck
            if (code === 'KeyR' && (this.state === 'RACING' || this.state === 'COUNTDOWN')) {
                this.resetPlayerOnTrack();
            }

            // Audio mute toggle
            if (code === 'KeyM') {
                const isMuted = this.sound.toggleMute();
                this.ui.updateMuteButton(isMuted);
            }
        });

        window.addEventListener('keyup', (e) => {
            const code = e.code;
            if (code === 'KeyW' || code === 'ArrowUp') { this.keys.up = false; }
            if (code === 'KeyS' || code === 'ArrowDown') { this.keys.down = false; }
            if (code === 'KeyA' || code === 'ArrowLeft') { this.keys.left = false; }
            if (code === 'KeyD' || code === 'ArrowRight') { this.keys.right = false; }
            if (code === 'Space') { this.keys.space = false; }
        });

        // Window resize
        window.addEventListener('resize', () => this.handleResize());

        // UI Button clicks
        const btnStart = document.getElementById('btn-start-race');
        if (btnStart) {
            btnStart.addEventListener('click', () => {
                this.sound.init();
                this.startCountdown();
            });
        }

        const btnHowTo = document.getElementById('btn-how-to-play');
        if (btnHowTo) {
            btnHowTo.addEventListener('click', () => {
                this.ui.showHowToPlay(true);
            });
        }

        const btnCloseModal = document.getElementById('btn-close-modal');
        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => {
                this.ui.showHowToPlay(false);
            });
        }

        const btnRaceAgain = document.getElementById('btn-race-again');
        if (btnRaceAgain) {
            btnRaceAgain.addEventListener('click', () => {
                this.startCountdown();
            });
        }

        const btnMainMenu = document.getElementById('btn-main-menu');
        if (btnMainMenu) {
            btnMainMenu.addEventListener('click', () => {
                this.goToMenu();
            });
        }

        const btnMute = document.getElementById('btn-mute');
        if (btnMute) {
            btnMute.addEventListener('click', () => {
                this.sound.init();
                const isMuted = this.sound.toggleMute();
                this.ui.updateMuteButton(isMuted);
            });
        }

        // On-screen touch controls for mobile/tablet support
        this.setupTouchControls();
    }

    setupTouchControls() {
        const bindTouch = (id, keyName) => {
            const el = document.getElementById(id);
            if (!el) return;
            const start = (e) => {
                e.preventDefault();
                this.sound.init();
                this.keys[keyName] = true;
            };
            const end = (e) => {
                e.preventDefault();
                this.keys[keyName] = false;
            };
            el.addEventListener('touchstart', start, { passive: false });
            el.addEventListener('touchend', end, { passive: false });
            el.addEventListener('mousedown', start);
            el.addEventListener('mouseup', end);
            el.addEventListener('mouseleave', end);
        };

        bindTouch('touch-up', 'up');
        bindTouch('touch-down', 'down');
        bindTouch('touch-left', 'left');
        bindTouch('touch-right', 'right');
        bindTouch('touch-drift', 'space');
    }

    handleResize() {
        const container = document.getElementById('game-container');
        if (!container) return;

        const windowW = window.innerWidth;
        const windowH = window.innerHeight;
        const targetRatio = 16 / 9;
        const currentRatio = windowW / windowH;

        let w, h;
        if (currentRatio > targetRatio) {
            h = windowH;
            w = h * targetRatio;
        } else {
            w = windowW;
            h = w / targetRatio;
        }

        container.style.width = `${Math.floor(w)}px`;
        container.style.height = `${Math.floor(h)}px`;
    }

    setupCars() {
        const gridPositions = this.track.getStartingPositions();

        // 1. Create Player Car (Grid slot 0 - Pole Position or Slot 5)
        // Placing player in slot 0 (Front) for clear view at start
        const playerPos = gridPositions[0];
        this.playerCar = new Car({
            id: 'player_car',
            name: 'PLAYER 1',
            color: '#ff204e', // Bright racing red
            accentColor: '#ffffff',
            number: 1,
            isPlayer: true,
            x: playerPos.x,
            y: playerPos.y,
            angle: playerPos.angle
        });

        // 2. Create 5 AI Opponents
        const { aiCars, aiControllers } = createAIOpponents(this.track, gridPositions);
        this.aiCars = aiCars;
        this.aiControllers = aiControllers;

        this.allCars = [this.playerCar, ...this.aiCars];

        // Center camera initially on player
        this.camera.reset(this.playerCar.x, this.playerCar.y);
    }

    resetPlayerOnTrack() {
        if (!this.playerCar) return;
        const closest = this.track.getClosestSample(this.playerCar.x, this.playerCar.y);
        this.playerCar.x = closest.sample.x;
        this.playerCar.y = closest.sample.y;
        this.playerCar.heading = closest.sample.angle;
        this.playerCar.vx = 0;
        this.playerCar.vy = 0;
        this.playerCar.forwardSpeed = 0;
        this.playerCar.lateralSpeed = 0;
    }

    startCountdown() {
        this.state = 'COUNTDOWN';
        this.countdownStep = 3;
        this.countdownTimer = 0;
        this.raceTime = 0;
        this.winnerAnnounced = false;
        this.winner = null;
        this.particles.reset();
        this.sound.stopAll();

        // Position all cars at their starting grid slots
        const gridPositions = this.track.getStartingPositions();
        this.allCars.forEach((car, idx) => {
            const pos = gridPositions[idx];
            car.reset(pos.x, pos.y, pos.angle);
        });

        this.camera.reset(this.playerCar.x, this.playerCar.y);
        this.ui.showGameHUD();
        this.ui.updateHUD(this.playerCar, this.allCars, 0);
        this.ui.renderMinimap(this.track, this.allCars);
        this.ui.showCountdown('3', false);
        this.sound.playCountdownBeep(false);
    }

    goToMenu() {
        this.state = 'MENU';
        this.sound.stopAll();
        this.ui.showMenu();
        const gridPositions = this.track.getStartingPositions();
        this.allCars.forEach((car, idx) => {
            const pos = gridPositions[idx];
            car.reset(pos.x, pos.y, pos.angle);
        });
        this.camera.reset(this.playerCar.x, this.playerCar.y);
    }

    updateCountdown(dt) {
        this.countdownTimer += dt;

        if (this.countdownStep === 3 && this.countdownTimer >= 1.0) {
            this.countdownStep = 2;
            this.ui.showCountdown('2', false);
            this.sound.playCountdownBeep(false);
        } else if (this.countdownStep === 2 && this.countdownTimer >= 2.0) {
            this.countdownStep = 1;
            this.ui.showCountdown('1', false);
            this.sound.playCountdownBeep(false);
        } else if (this.countdownStep === 1 && this.countdownTimer >= 3.0) {
            this.countdownStep = 0;
            this.ui.showCountdown('GO!', true);
            this.sound.playCountdownBeep(true);
            this.state = 'RACING';
            this.raceStartTime = performance.now();
            this.playerCar.lapStartTime = this.raceStartTime;
            this.aiCars.forEach(ai => ai.lapStartTime = this.raceStartTime);

            // Hide countdown after 0.8s
            setTimeout(() => {
                if (this.state === 'RACING') {
                    this.ui.hideCountdown();
                }
            }, 800);
        }
    }

    updateControls() {
        // Player inputs
        let throttle = 0;
        if (this.keys.up) throttle += 1;
        if (this.keys.down) throttle -= 1;

        let steer = 0;
        if (this.keys.left) steer -= 1;
        if (this.keys.right) steer += 1;

        this.playerCar.throttleInput = throttle;
        this.playerCar.steerInput = steer;
        this.playerCar.handbrakeInput = this.keys.space;
    }

    updateRaceRanks() {
        // Sort cars descending by continuous race progress and finish status
        const sorted = [...this.allCars].sort((a, b) => {
            if (a.finished && b.finished) {
                return (a.totalRaceTime || a.finishTime) - (b.totalRaceTime || b.finishTime);
            }
            if (a.finished) return -1;
            if (b.finished) return 1;
            return b.raceProgress - a.raceProgress;
        });

        sorted.forEach((car, idx) => {
            car.currentRank = idx + 1;
            if (car.finished && !car.finalRank) {
                car.finalRank = idx + 1;
            }
        });

        return sorted;
    }

    finishRace() {
        if (this.state === 'FINISHED') return;
        this.state = 'FINISHED';
        this.sound.stopAll();
        this.sound.playFinishSound();

        const sortedCars = this.updateRaceRanks();
        const winner = sortedCars[0];
        this.ui.showResults(sortedCars, this.playerCar, this.raceTime, winner);
    }

    gameLoop(timestamp) {
        const dt = Math.min(0.05, (timestamp - this.lastFrameTime) / 1000);
        this.lastFrameTime = timestamp;

        // 1. Logic Update
        if (this.state === 'COUNTDOWN') {
            this.updateCountdown(dt);
            this.camera.update(this.playerCar.x, this.playerCar.y, this.playerCar.heading, 0);
        } else if (this.state === 'RACING') {
            this.raceTime = (timestamp - this.raceStartTime) / 1000;
            this.updateControls();

            // Update AI controllers
            this.aiControllers.forEach(ai => ai.update(this.allCars, dt));

            // Update physics for all cars
            this.allCars.forEach(car => {
                car.updatePhysics(dt, this.track, this.particles, this.sound);
            });

            // Car-to-Car collisions
            for (let i = 0; i < this.allCars.length; i++) {
                for (let j = i + 1; j < this.allCars.length; j++) {
                    this.allCars[i].checkCarCollision(this.allCars[j], this.particles, this.sound);
                }
            }

            // Update particles
            this.particles.update(dt);

            // Update camera tracking
            this.camera.update(
                this.playerCar.x,
                this.playerCar.y,
                this.playerCar.heading,
                this.playerCar.forwardSpeed
            );

            // Update live race ranks
            const sortedCars = this.updateRaceRanks();

            // Check race completion:
            // 1. If player car has completed 3 laps -> finish immediately
            // 2. If 1st place car has finished 3 laps -> announce winner and end race after brief moment
            const firstPlaceCar = sortedCars[0];
            if (this.playerCar.finished && this.state !== 'FINISHED') {
                this.finishRace();
            } else if (firstPlaceCar && firstPlaceCar.finished && !this.winnerAnnounced && this.state === 'RACING') {
                this.winnerAnnounced = true;
                this.winner = firstPlaceCar;
                this.ui.showWinnerBanner(firstPlaceCar);

                // Give 2 seconds for player to cross or conclude the race
                setTimeout(() => {
                    if (this.state === 'RACING') {
                        this.finishRace();
                    }
                }, 2000);
            }

            // Update HUD & Mini-map
            this.ui.updateHUD(this.playerCar, this.allCars, this.raceTime);
            this.ui.renderMinimap(this.track, this.allCars);
        } else if (this.state === 'MENU') {
            // Gentle camera float around start line
            const time = timestamp * 0.0005;
            const camX = 900 + Math.sin(time) * 120;
            const camY = 420 + Math.cos(time * 0.8) * 80;
            this.camera.update(camX, camY, 0, 0);
        }

        // 2. Rendering
        this.render();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    render() {
        const ctx = this.ctx;

        // Clear screen with grass background color
        ctx.fillStyle = '#2d5a27';
        ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);

        // Apply Camera Transform
        this.camera.apply(ctx);

        // 1. Draw Track & Environment
        this.track.render(ctx);

        // 2. Draw World Particles (Tire skids, smoke, dust, sparks)
        this.particles.renderWorld(ctx);

        // 3. Draw All Cars (sorted by Y so lower cars overlap higher cars naturally)
        const renderOrder = [...this.allCars].sort((a, b) => a.y - b.y);
        renderOrder.forEach(car => car.render(ctx));

        // Restore Camera Transform
        this.camera.restore(ctx);

        // 4. Render Screen-space effects (Speed lines when player is going fast)
        if (this.state === 'RACING' && this.playerCar) {
            this.particles.renderSpeedLines(
                ctx,
                this.virtualWidth,
                this.virtualHeight,
                this.playerCar.getSpeedRatio()
            );
        }
    }
}

// Instantiate game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new GameManager();
});
