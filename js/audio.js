/**
 * Audio Engine using Web Audio API
 * Generates all sound effects procedurally without requiring external sound files.
 */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.isInitialized = false;

        // Engine sound nodes
        this.engineOsc1 = null;
        this.engineOsc2 = null;
        this.engineFilter = null;
        this.engineGain = null;

        // Skid sound nodes
        this.skidSource = null;
        this.skidFilter = null;
        this.skidGain = null;

        // Noise buffer for collisions & skids
        this.noiseBuffer = null;
    }

    init() {
        if (this.isInitialized) {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        this.ctx = new AudioContext();
        this.createNoiseBuffer();
        this.setupEngineSound();
        this.setupSkidSound();
        this.isInitialized = true;
    }

    createNoiseBuffer() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    }

    setupEngineSound() {
        if (!this.ctx) return;

        this.engineOsc1 = this.ctx.createOscillator();
        this.engineOsc2 = this.ctx.createOscillator();
        this.engineOsc1.type = 'sawtooth';
        this.engineOsc2.type = 'triangle';

        this.engineOsc1.frequency.setValueAtTime(45, this.ctx.currentTime);
        this.engineOsc2.frequency.setValueAtTime(46, this.ctx.currentTime);

        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.setValueAtTime(260, this.ctx.currentTime);
        this.engineFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc2.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);

        this.engineOsc1.start();
        this.engineOsc2.start();
    }

    setupSkidSound() {
        if (!this.ctx || !this.noiseBuffer) return;

        this.skidSource = this.ctx.createBufferSource();
        this.skidSource.buffer = this.noiseBuffer;
        this.skidSource.loop = true;

        this.skidFilter = this.ctx.createBiquadFilter();
        this.skidFilter.type = 'bandpass';
        this.skidFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
        this.skidFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

        this.skidGain = this.ctx.createGain();
        this.skidGain.gain.setValueAtTime(0, this.ctx.currentTime);

        this.skidSource.connect(this.skidFilter);
        this.skidFilter.connect(this.skidGain);
        this.skidGain.connect(this.ctx.destination);

        this.skidSource.start();
    }

    updateEngine(speedRatio, isAccelerating, isBraking) {
        if (!this.isInitialized || this.isMuted || !this.ctx) return;

        const now = this.ctx.currentTime;
        const clampedRatio = Math.max(0, Math.min(1, speedRatio));

        // Frequency scales from 45Hz idle to 240Hz top speed
        const targetFreq = 48 + clampedRatio * 180 + (isAccelerating ? 15 : 0);
        this.engineOsc1.frequency.setTargetAtTime(targetFreq, now, 0.08);
        this.engineOsc2.frequency.setTargetAtTime(targetFreq * 1.02, now, 0.08);

        // Filter cutoff opens up when accelerating
        const targetCutoff = 250 + clampedRatio * 850 + (isAccelerating ? 300 : 0);
        this.engineFilter.frequency.setTargetAtTime(targetCutoff, now, 0.08);

        // Engine volume: subtle idle, louder under load
        const targetVolume = 0.07 + clampedRatio * 0.12 + (isAccelerating ? 0.04 : 0);
        this.engineGain.gain.setTargetAtTime(targetVolume, now, 0.05);
    }

    updateSkid(intensity) {
        if (!this.isInitialized || this.isMuted || !this.skidGain) return;

        const now = this.ctx.currentTime;
        const clamped = Math.max(0, Math.min(1, intensity));
        const targetVol = clamped * 0.15;
        this.skidGain.gain.setTargetAtTime(targetVol, now, 0.05);

        if (this.skidFilter && clamped > 0.05) {
            const freq = 1100 + clamped * 700;
            this.skidFilter.frequency.setTargetAtTime(freq, now, 0.05);
        }
    }

    playCollision(intensity = 1) {
        if (!this.isInitialized || this.isMuted || !this.ctx) return;

        const now = this.ctx.currentTime;
        const volume = Math.min(0.35, 0.12 * intensity);

        // 1. Noise transient burst
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const noiseFilter = this.ctx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(450, now);
            noiseFilter.frequency.exponentialRampToValueAtTime(80, now + 0.18);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(volume, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);

            noise.start(now);
            noise.stop(now + 0.2);
        }

        // 2. Sub bass thud
        const thudOsc = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thudOsc.type = 'sine';
        thudOsc.frequency.setValueAtTime(140, now);
        thudOsc.frequency.exponentialRampToValueAtTime(30, now + 0.16);

        thudGain.gain.setValueAtTime(volume * 1.2, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        thudOsc.connect(thudGain);
        thudGain.connect(this.ctx.destination);

        thudOsc.start(now);
        thudOsc.stop(now + 0.18);
    }

    playCountdownBeep(isFinal = false) {
        if (!this.isInitialized || this.isMuted || !this.ctx) return;

        const now = this.ctx.currentTime;
        if (isFinal) {
            // GO! sound - bright triumphal major chord
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.02);

                gain.gain.setValueAtTime(0.12, now + idx * 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(now + idx * 0.02);
                osc.stop(now + 0.75);
            });
        } else {
            // 3, 2, 1 beep
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.16);
        }
    }

    playLapSound() {
        if (!this.isInitialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const freqs = [659.25, 880]; // E5, A5
        freqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);

            gain.gain.setValueAtTime(0.15, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.35);
        });
    }

    playFinishSound() {
        if (!this.isInitialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const arpeggio = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
        arpeggio.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);

            gain.gain.setValueAtTime(0.16, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.6);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.65);
        });
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.engineGain) {
            this.engineGain.gain.setValueAtTime(this.isMuted ? 0 : 0.08, this.ctx ? this.ctx.currentTime : 0);
        }
        if (this.skidGain) {
            this.skidGain.gain.setValueAtTime(0, this.ctx ? this.ctx.currentTime : 0);
        }
        return this.isMuted;
    }

    stopAll() {
        if (this.engineGain && this.ctx) {
            this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        if (this.skidGain && this.ctx) {
            this.skidGain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
    }
}

// Global audio instance
window.soundEngine = new SoundEngine();
