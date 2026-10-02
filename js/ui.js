/**
 * UI and HUD Rendering & Interaction
 * Manages HUD, Countdown animation, Mini-map, Results modal, and Menus.
 */

class UIManager {
    constructor() {
        // DOM Elements
        this.menuScreen = document.getElementById('menu-screen');
        this.howToPlayModal = document.getElementById('how-to-play-modal');
        this.hudScreen = document.getElementById('hud-screen');
        this.resultsScreen = document.getElementById('results-screen');
        this.countdownOverlay = document.getElementById('countdown-overlay');
        this.countdownNumber = document.getElementById('countdown-number');

        // HUD readout elements
        this.posVal = document.getElementById('hud-position-val');
        this.lapVal = document.getElementById('hud-lap-val');
        this.speedVal = document.getElementById('hud-speed-val');
        this.speedBar = document.getElementById('hud-speed-bar');
        this.timeVal = document.getElementById('hud-time-val');
        this.bestVal = document.getElementById('hud-best-val');
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

        // Results elements
        this.resultRank = document.getElementById('result-rank');
        this.resultTotalTime = document.getElementById('result-total-time');
        this.resultBestLap = document.getElementById('result-best-lap');
        this.resultsTableBody = document.getElementById('results-table-body');

        // Mute button
        this.muteBtn = document.getElementById('btn-mute');
    }

    // Utility: Format seconds to MM:SS.CC
    static formatTime(seconds) {
        if (!seconds || seconds <= 0 || isNaN(seconds)) return '--:--.--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const centis = Math.floor((seconds % 1) * 100);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
    }

    showMenu() {
        this.menuScreen.classList.remove('hidden');
        this.hudScreen.classList.add('hidden');
        this.resultsScreen.classList.add('hidden');
        this.countdownOverlay.classList.add('hidden');
    }

    showHowToPlay(show = true) {
        if (show) {
            this.howToPlayModal.classList.remove('hidden');
        } else {
            this.howToPlayModal.classList.add('hidden');
        }
    }

    showGameHUD() {
        this.menuScreen.classList.add('hidden');
        this.howToPlayModal.classList.add('hidden');
        this.resultsScreen.classList.add('hidden');
        this.hudScreen.classList.remove('hidden');
        this.countdownOverlay.classList.add('hidden');
    }

    showCountdown(text, isGo = false) {
        this.countdownOverlay.classList.remove('hidden');
        this.countdownNumber.textContent = text;

        this.countdownNumber.className = 'countdown-text';
        void this.countdownNumber.offsetWidth; // Trigger CSS reflow for animation
        this.countdownNumber.classList.add(isGo ? 'countdown-go' : 'countdown-pop');
    }

    hideCountdown() {
        this.countdownOverlay.classList.add('hidden');
    }

    updateHUD(playerCar, allCars, raceTime) {
        if (!playerCar) return;

        // Position: 1/6
        if (this.posVal) {
            this.posVal.textContent = `${playerCar.finalRank || playerCar.currentRank || 1} / ${allCars.length}`;
        }

        // Lap: 1 / 3
        if (this.lapVal) {
            this.lapVal.textContent = `${Math.min(playerCar.currentLap, playerCar.totalLaps)} / ${playerCar.totalLaps}`;
        }

        // Speed: 143 km/h
        const speed = playerCar.getSpeedKmH();
        if (this.speedVal) {
            this.speedVal.textContent = `${speed}`;
        }
        if (this.speedBar) {
            const ratio = playerCar.getSpeedRatio();
            this.speedBar.style.width = `${Math.round(ratio * 100)}%`;
        }

        // Race Time
        if (this.timeVal) {
            this.timeVal.textContent = UIManager.formatTime(raceTime);
        }

        // Best Lap
        if (this.bestVal) {
            this.bestVal.textContent = UIManager.formatTime(playerCar.bestLapTime);
        }
    }

    renderMinimap(track, allCars) {
        if (!this.minimapCtx || !track) return;
        const ctx = this.minimapCtx;
        const width = this.minimapCanvas.width;
        const height = this.minimapCanvas.height;

        ctx.clearRect(0, 0, width, height);

        // Track bounding box mapping to minimap
        // Track coords range roughly [200, 2900] in X, [200, 2100] in Y
        const minX = 150, maxX = 2850;
        const minY = 200, maxY = 2100;
        const scaleX = (width - 24) / (maxX - minX);
        const scaleY = (height - 24) / (maxY - minY);
        const scale = Math.min(scaleX, scaleY);

        const offsetX = (width - (maxX - minX) * scale) * 0.5;
        const offsetY = (height - (maxY - minY) * scale) * 0.5;

        const toMap = (x, y) => ({
            x: offsetX + (x - minX) * scale,
            y: offsetY + (y - minY) * scale
        });

        // 1. Draw track line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < track.samples.length; i += 4) {
            const s = track.samples[i];
            const m = toMap(s.x, s.y);
            if (i === 0) ctx.moveTo(m.x, m.y);
            else ctx.lineTo(m.x, m.y);
        }
        ctx.closePath();
        ctx.stroke();

        // 2. Draw Start/Finish line notch
        const start = toMap(900, 420);
        ctx.fillStyle = '#ff204e';
        ctx.fillRect(start.x - 3, start.y - 3, 6, 6);

        // 3. Draw AI car dots
        allCars.forEach(car => {
            if (car.isPlayer) return;
            const m = toMap(car.x, car.y);
            ctx.fillStyle = car.color;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // 4. Draw Player car dot (larger with glowing ring)
        const player = allCars.find(c => c.isPlayer);
        if (player) {
            const m = toMap(player.x, player.y);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 4.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ff204e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 6.5, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    showResults(sortedCars, playerCar, raceTime, winner = null) {
        this.resultsScreen.classList.remove('hidden');
        this.hudScreen.classList.add('hidden');
        this.countdownOverlay.classList.add('hidden');
        this.hideWinnerBanner();

        const actualWinner = winner || sortedCars[0];
        const isPlayerWinner = actualWinner && actualWinner.isPlayer;

        const winnerBadge = document.getElementById('result-winner-badge');
        if (winnerBadge && actualWinner) {
            winnerBadge.textContent = isPlayerWinner 
                ? `🏆 1위 우승: ${actualWinner.name} (PLAYER 1)!` 
                : `🏆 1위 우승: ${actualWinner.name}`;
            winnerBadge.style.color = actualWinner.color || '#ffd600';
        }

        const myRank = playerCar.finalRank || playerCar.currentRank || 1;
        if (this.resultRank) {
            if (isPlayerWinner) {
                this.resultRank.textContent = `🏆 최종 우승 (1위)!`;
                this.resultRank.className = `result-rank-title rank-1`;
            } else {
                this.resultRank.textContent = `내 순위: ${myRank}위`;
                this.resultRank.className = `result-rank-title rank-${myRank}`;
            }
        }

        if (this.resultTotalTime) {
            this.resultTotalTime.textContent = UIManager.formatTime(playerCar.totalRaceTime || raceTime);
        }

        if (this.resultBestLap) {
            this.resultBestLap.textContent = UIManager.formatTime(playerCar.bestLapTime);
        }

        // Populate leaderboard table
        if (this.resultsTableBody) {
            this.resultsTableBody.innerHTML = '';
            sortedCars.forEach((car, index) => {
                const tr = document.createElement('tr');
                if (car.isPlayer) {
                    tr.classList.add('player-row');
                }
                if (index === 0) {
                    tr.classList.add('winner-row');
                }

                const totalTimeStr = car.finished
                    ? UIManager.formatTime(car.totalRaceTime || raceTime)
                    : (car.isPlayer ? UIManager.formatTime(raceTime) : '+1 Lap');

                const bestLapStr = UIManager.formatTime(car.bestLapTime);
                const rankDisplay = index === 0 ? '👑 1' : `${index + 1}`;

                tr.innerHTML = `
                    <td class="col-pos">${rankDisplay}</td>
                    <td class="col-driver">
                        <span class="driver-color-swatch" style="background-color: ${car.color}"></span>
                        <span class="driver-name">${car.name} ${car.isPlayer ? '(YOU)' : ''}</span>
                    </td>
                    <td class="col-best">${bestLapStr}</td>
                    <td class="col-time">${totalTimeStr}</td>
                `;
                this.resultsTableBody.appendChild(tr);
            });
        }
    }

    showWinnerBanner(winner) {
        let banner = document.getElementById('winner-banner');
        if (!banner) return;
        const text = winner.isPlayer ? '🏆 1위 우승! 축하합니다!' : `🏁 1위 확정: ${winner.name}!`;
        banner.textContent = text;
        banner.classList.remove('hidden');
    }

    hideWinnerBanner() {
        const banner = document.getElementById('winner-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }

    updateMuteButton(isMuted) {
        if (this.muteBtn) {
            this.muteBtn.textContent = isMuted ? '🔇 SOUND: OFF' : '🔊 SOUND: ON';
            this.muteBtn.classList.toggle('muted', isMuted);
        }
    }
}

window.UIManager = UIManager;
