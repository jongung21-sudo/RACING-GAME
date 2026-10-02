/**
 * Track and Circuit System
 * Handles circuit geometry, spline interpolation, curbs, barriers, checkpoints, and surface detection.
 */

class Track {
    constructor() {
        this.roadWidth = 144;
        this.curbWidth = 16;
        this.barrierOffset = 34; // distance from road edge to outer barrier
        this.totalLength = 0;

        // Base control points for an exciting Grand Prix style circuit
        this.controlPoints = [
            { x: 500,  y: 420 },   // 0: Main straight start
            { x: 900,  y: 420 },   // 1: Start / Finish Line
            { x: 1400, y: 420 },   // 2: Main straight speed zone
            { x: 1900, y: 440 },   // 3: Turn 1 entry
            { x: 2400, y: 650 },   // 4: Turn 1 sweeper right
            { x: 2600, y: 1050 },  // 5: Turn 1 exit
            { x: 2450, y: 1350 },  // 6: Chicane entry
            { x: 2150, y: 1250 },  // 7: Chicane apex left
            { x: 1850, y: 1420 },  // 8: Chicane exit right
            { x: 1550, y: 1750 },  // 9: Back straight entry
            { x: 1100, y: 1880 },  // 10: Back straight fast zone
            { x: 650,  y: 1880 },  // 11: Approach to hairpin
            { x: 360,  y: 1680 },  // 12: Hairpin braking point
            { x: 280,  y: 1300 },  // 13: Hairpin apex
            { x: 420,  y: 980 },   // 14: Hairpin exit
            { x: 740,  y: 840 },   // 15: Infield S-bend
            { x: 820,  y: 640 },   // 16: Final turn entry
            { x: 540,  y: 460 }    // 17: Final turn exit onto straight
        ];

        // Dense equidistant samples along track centerline
        this.samples = [];
        this.checkpoints = [];
        this.sceneryProps = [];

        this.generateTrack();
        this.generateCheckpoints();
        this.generateScenery();
    }

    // Catmull-Rom spline interpolation between p1 and p2 with p0, p3 neighbors
    catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;

        const v0 = (p2.x - p0.x) * 0.5;
        const v1 = (p3.x - p1.x) * 0.5;
        const x = (2 * p1.x - 2 * p2.x + v0 + v1) * t3 +
                  (-3 * p1.x + 3 * p2.x - 2 * v0 - v1) * t2 +
                  v0 * t + p1.x;

        const vy0 = (p2.y - p0.y) * 0.5;
        const vy1 = (p3.y - p1.y) * 0.5;
        const y = (2 * p1.y - 2 * p2.y + vy0 + vy1) * t3 +
                  (-3 * p1.y + 3 * p2.y - 2 * vy0 - vy1) * t2 +
                  vy0 * t + p1.y;

        return { x, y };
    }

    generateTrack() {
        const rawPoints = [];
        const n = this.controlPoints.length;
        const subdivisions = 40;

        for (let i = 0; i < n; i++) {
            const p0 = this.controlPoints[(i - 1 + n) % n];
            const p1 = this.controlPoints[i];
            const p2 = this.controlPoints[(i + 1) % n];
            const p3 = this.controlPoints[(i + 2) % n];

            for (let step = 0; step < subdivisions; step++) {
                const t = step / subdivisions;
                rawPoints.push(this.catmullRom(p0, p1, p2, p3, t));
            }
        }

        // Resample with even spacing (~15px) for consistent physics and AI
        let currentDist = 0;
        this.samples = [];
        const totalRaw = rawPoints.length;

        for (let i = 0; i < totalRaw; i++) {
            const pt = rawPoints[i];
            const nextPt = rawPoints[(i + 1) % totalRaw];
            const prevPt = rawPoints[(i - 1 + totalRaw) % totalRaw];

            const dx = nextPt.x - prevPt.x;
            const dy = nextPt.y - prevPt.y;
            const len = Math.hypot(dx, dy) || 1;

            const tangent = { x: dx / len, y: dy / len };
            const normal = { x: -tangent.y, y: tangent.x };
            const angle = Math.atan2(tangent.y, tangent.x);

            const segLen = Math.hypot(nextPt.x - pt.x, nextPt.y - pt.y);

            // Curvature estimation for AI braking
            const dAngle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x) - Math.atan2(pt.y - prevPt.y, pt.x - prevPt.x);
            let normalizedDAngle = Math.atan2(Math.sin(dAngle), Math.cos(dAngle));
            const curvature = Math.abs(normalizedDAngle);

            this.samples.push({
                x: pt.x,
                y: pt.y,
                tangent,
                normal,
                angle,
                curvature,
                dist: currentDist
            });

            currentDist += segLen;
        }

        this.totalLength = currentDist;

        // Locate start/finish line sample index
        this.startSampleIdx = this.getClosestSample(900, 420).index;
    }

    generateCheckpoints() {
        // Create 24 checkpoints starting precisely from the Start/Finish line
        const count = 24;
        this.checkpoints = [];
        const step = Math.floor(this.samples.length / count);

        for (let i = 0; i < count; i++) {
            const sampleIdx = (this.startSampleIdx + i * step) % this.samples.length;
            const sample = this.samples[sampleIdx];

            // Gate line segment across the track
            const p1 = {
                x: sample.x + sample.normal.x * (this.roadWidth * 0.9),
                y: sample.y + sample.normal.y * (this.roadWidth * 0.9)
            };
            const p2 = {
                x: sample.x - sample.normal.x * (this.roadWidth * 0.9),
                y: sample.y - sample.normal.y * (this.roadWidth * 0.9)
            };

            this.checkpoints.push({
                index: i,
                sampleIdx,
                x: sample.x,
                y: sample.y,
                normal: sample.normal,
                tangent: sample.tangent,
                p1,
                p2
            });
        }
    }

    generateScenery() {
        this.sceneryProps = [];

        // Add grandstands along the start/finish straight
        this.sceneryProps.push({
            type: 'grandstand',
            x: 950,
            y: 280,
            width: 240,
            height: 50,
            angle: 0
        });

        // Add pit building / garages
        this.sceneryProps.push({
            type: 'pitlane',
            x: 700,
            y: 290,
            width: 200,
            height: 40,
            angle: 0
        });

        // Add decorative trees outside the track perimeter
        const treeLocations = [
            { x: 300, y: 300 }, { x: 400, y: 240 }, { x: 1250, y: 250 }, { x: 1450, y: 240 },
            { x: 2150, y: 300 }, { x: 2750, y: 800 }, { x: 2800, y: 1200 }, { x: 2650, y: 1600 },
            { x: 1950, y: 1750 }, { x: 1350, y: 2050 }, { x: 850, y: 2050 }, { x: 450, y: 2050 },
            { x: 150, y: 1800 }, { x: 120, y: 1400 }, { x: 150, y: 1000 }, { x: 200, y: 700 },
            // Infield trees
            { x: 1100, y: 750 }, { x: 1250, y: 850 }, { x: 1450, y: 800 }, { x: 1700, y: 950 },
            { x: 950, y: 1150 }, { x: 1100, y: 1350 }, { x: 800, y: 1450 }, { x: 650, y: 1250 }
        ];

        treeLocations.forEach(loc => {
            this.sceneryProps.push({
                type: 'tree',
                x: loc.x,
                y: loc.y,
                radius: 20 + Math.random() * 14
            });
        });

        // Distance signs (100m, 50m) before Turn 1 and Hairpin
        this.sceneryProps.push({ type: 'sign', x: 1700, y: 320, text: '100m' });
        this.sceneryProps.push({ type: 'sign', x: 1820, y: 320, text: '50m' });
        this.sceneryProps.push({ type: 'sign', x: 850, y: 1980, text: '100m' });
        this.sceneryProps.push({ type: 'sign', x: 720, y: 1980, text: '50m' });
    }

    // Get closest track sample to point (x, y)
    getClosestSample(x, y, hintIdx = -1) {
        let bestDistSq = Infinity;
        let bestIdx = 0;

        // If hint is provided, search localized window first for speed
        if (hintIdx >= 0) {
            const windowSize = 40;
            const total = this.samples.length;
            for (let offset = -windowSize; offset <= windowSize; offset++) {
                const idx = (hintIdx + offset + total) % total;
                const sample = this.samples[idx];
                const dx = x - sample.x;
                const dy = y - sample.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    bestIdx = idx;
                }
            }
            if (bestDistSq < 150 * 150) {
                return { sample: this.samples[bestIdx], index: bestIdx, dist: Math.sqrt(bestDistSq) };
            }
        }

        // Full search if not close to hint
        for (let i = 0; i < this.samples.length; i++) {
            const sample = this.samples[i];
            const dx = x - sample.x;
            const dy = y - sample.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestIdx = i;
            }
        }

        return { sample: this.samples[bestIdx], index: bestIdx, dist: Math.sqrt(bestDistSq) };
    }

    // Determine surface type and distance offset from centerline
    getSurfaceInfo(x, y, hintIdx = -1) {
        const { sample, index, dist } = this.getClosestSample(x, y, hintIdx);

        // Vector from centerline to car
        const toCarX = x - sample.x;
        const toCarY = y - sample.y;
        // Dot product with normal to find signed lateral offset
        const lateralOffset = toCarX * sample.normal.x + toCarY * sample.normal.y;
        const absOffset = Math.abs(lateralOffset);

        const halfRoad = this.roadWidth * 0.5;
        const halfCurb = halfRoad + this.curbWidth;
        const barrierDist = halfRoad + this.barrierOffset;

        let surface = 'asphalt';
        let isOffRoad = false;
        let isCurb = false;
        let hitsBarrier = false;
        let barrierNormal = null;

        if (absOffset <= halfRoad) {
            surface = 'asphalt';
        } else if (absOffset <= halfCurb) {
            surface = 'curb';
            isCurb = true;
        } else {
            surface = 'grass';
            isOffRoad = true;
        }

        // Barrier collision check
        if (absOffset >= barrierDist) {
            hitsBarrier = true;
            // Normal points back towards road center
            const sign = lateralOffset > 0 ? -1 : 1;
            barrierNormal = {
                x: sample.normal.x * sign,
                y: sample.normal.y * sign
            };
        }

        return {
            surface,
            isOffRoad,
            isCurb,
            hitsBarrier,
            barrierNormal,
            closestSample: sample,
            closestIdx: index,
            lateralOffset,
            absOffset,
            dist
        };
    }

    // Get starting grid positions for 6 cars
    getStartingPositions() {
        // Start line is around sample with x ~ 900, y ~ 420
        const startIdx = this.getClosestSample(900, 420).index;
        const positions = [];

        // Grid rows spaced behind the start line
        // 2 cars per row, slightly staggered
        const rowSpacing = 65; // pixels behind
        const colOffset = 36;  // pixels left/right of centerline

        for (let i = 0; i < 6; i++) {
            const row = Math.floor(i / 2);
            const isLeft = (i % 2 === 0);

            // Step backward along samples
            const sampleOffset = Math.floor((row * rowSpacing + 40) / 15);
            const sIdx = (startIdx - sampleOffset + this.samples.length) % this.samples.length;
            const sample = this.samples[sIdx];

            const lateralSign = isLeft ? -1 : 1;
            const x = sample.x + sample.normal.x * (colOffset * lateralSign);
            const y = sample.y + sample.normal.y * (colOffset * lateralSign);

            positions.push({
                x,
                y,
                angle: sample.angle,
                gridRank: i + 1
            });
        }

        return positions;
    }

    // Render the track, grass terrain, curbs, markings, and barriers
    render(ctx) {
        const samples = this.samples;
        const count = samples.length;
        const halfRoad = this.roadWidth * 0.5;
        const halfCurb = halfRoad + this.curbWidth;

        // 1. Grass background is cleared by game renderer, but we draw subtle grass mowing stripes
        ctx.fillStyle = '#2d5a27';
        ctx.fillRect(-500, -500, 4000, 3200);

        // Subtle large lawn stripes
        ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
        for (let y = -500; y < 3200; y += 160) {
            ctx.fillRect(-500, y, 4000, 80);
        }

        // 2. Curbs (Rumble strips) along outer edges
        for (let i = 0; i < count; i++) {
            const s1 = samples[i];
            const s2 = samples[(i + 1) % count];

            const isRed = Math.floor(s1.dist / 22) % 2 === 0;
            ctx.fillStyle = isRed ? '#d32f2f' : '#f5f5f5';

            // Left curb
            ctx.beginPath();
            ctx.moveTo(s1.x + s1.normal.x * halfRoad, s1.y + s1.normal.y * halfRoad);
            ctx.lineTo(s1.x + s1.normal.x * halfCurb, s1.y + s1.normal.y * halfCurb);
            ctx.lineTo(s2.x + s2.normal.x * halfCurb, s2.y + s2.normal.y * halfCurb);
            ctx.lineTo(s2.x + s2.normal.x * halfRoad, s2.y + s2.normal.y * halfRoad);
            ctx.closePath();
            ctx.fill();

            // Right curb
            ctx.beginPath();
            ctx.moveTo(s1.x - s1.normal.x * halfRoad, s1.y - s1.normal.y * halfRoad);
            ctx.lineTo(s1.x - s1.normal.x * halfCurb, s1.y - s1.normal.y * halfCurb);
            ctx.lineTo(s2.x - s2.normal.x * halfCurb, s2.y - s2.normal.y * halfCurb);
            ctx.lineTo(s2.x - s2.normal.x * halfRoad, s2.y - s2.normal.y * halfRoad);
            ctx.closePath();
            ctx.fill();
        }

        // 3. Dark Asphalt road surface
        ctx.fillStyle = '#1e2124';
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const s = samples[i];
            const px = s.x + s.normal.x * halfRoad;
            const py = s.y + s.normal.y * halfRoad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        for (let i = 0; i < count; i++) {
            const s1 = samples[i];
            const s2 = samples[(i + 1) % count];

            ctx.beginPath();
            ctx.moveTo(s1.x + s1.normal.x * halfRoad, s1.y + s1.normal.y * halfRoad);
            ctx.lineTo(s1.x - s1.normal.x * halfRoad, s1.y - s1.normal.y * halfRoad);
            ctx.lineTo(s2.x - s2.normal.x * halfRoad, s2.y - s2.normal.y * halfRoad);
            ctx.lineTo(s2.x + s2.normal.x * halfRoad, s2.y + s2.normal.y * halfRoad);
            ctx.closePath();
            ctx.fill();
        }

        // 4. White road edge lines
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        // Left edge line
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
            const s = samples[i % count];
            const px = s.x + s.normal.x * (halfRoad - 2);
            const py = s.y + s.normal.y * (halfRoad - 2);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Right edge line
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
            const s = samples[i % count];
            const px = s.x - s.normal.x * (halfRoad - 2);
            const py = s.y - s.normal.y * (halfRoad - 2);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // 5. Centerline dashed markings
        ctx.strokeStyle = '#f1c40f'; // Electric yellow dashes
        ctx.lineWidth = 3;
        ctx.setLineDash([25, 20]);
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
            const s = samples[i % count];
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash

        // 6. Start / Finish Line (Checkered Pattern)
        this.renderStartFinishLine(ctx);

        // 7. Starting grid boxes
        this.renderStartingGrid(ctx);

        // 8. Outer barriers
        this.renderBarriers(ctx);

        // 9. Scenery props (Grandstands, signs, trees)
        this.renderScenery(ctx);
    }

    renderStartFinishLine(ctx) {
        // Start line at sample near x: 900, y: 420
        const startSample = this.samples[this.getClosestSample(900, 420).index];
        const halfRoad = this.roadWidth * 0.5;

        ctx.save();
        ctx.translate(startSample.x, startSample.y);
        ctx.rotate(startSample.angle + Math.PI / 2);

        const lineLen = this.roadWidth;
        const lineThickness = 24;
        const checkSize = 12;
        const rows = Math.floor(lineThickness / checkSize);
        const cols = Math.floor(lineLen / checkSize);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
                ctx.fillRect(-lineLen / 2 + c * checkSize, -lineThickness / 2 + r * checkSize, checkSize, checkSize);
            }
        }

        // Red border rails
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(-lineLen / 2, -lineThickness / 2 - 3, lineLen, 3);
        ctx.fillRect(-lineLen / 2, lineThickness / 2, lineLen, 3);

        ctx.restore();
    }

    renderStartingGrid(ctx) {
        const gridPositions = this.getStartingPositions();

        gridPositions.forEach((pos, idx) => {
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(pos.angle);

            // Grid box outline
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 2;
            ctx.strokeRect(-25, -16, 50, 32);

            // Starting slot number
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((idx + 1).toString(), -14, 0);

            ctx.restore();
        });
    }

    renderBarriers(ctx) {
        const samples = this.samples;
        const count = samples.length;
        const halfBarrier = this.roadWidth * 0.5 + this.barrierOffset;

        // Render continuous barrier rails with red & white segments
        for (let i = 0; i < count; i += 2) {
            const s1 = samples[i];
            const s2 = samples[(i + 2) % count];
            const isRed = Math.floor(s1.dist / 32) % 2 === 0;

            ctx.strokeStyle = isRed ? '#d32f2f' : '#ffffff';
            ctx.lineWidth = 7;
            ctx.lineCap = 'round';

            // Left barrier
            ctx.beginPath();
            ctx.moveTo(s1.x + s1.normal.x * halfBarrier, s1.y + s1.normal.y * halfBarrier);
            ctx.lineTo(s2.x + s2.normal.x * halfBarrier, s2.y + s2.normal.y * halfBarrier);
            ctx.stroke();

            // Right barrier
            ctx.beginPath();
            ctx.moveTo(s1.x - s1.normal.x * halfBarrier, s1.y - s1.normal.y * halfBarrier);
            ctx.lineTo(s2.x - s2.normal.x * halfBarrier, s2.y - s2.normal.y * halfBarrier);
            ctx.stroke();
        }

        // Barrier posts
        ctx.fillStyle = '#424242';
        for (let i = 0; i < count; i += 8) {
            const s = samples[i];
            // Left post
            ctx.beginPath();
            ctx.arc(s.x + s.normal.x * halfBarrier, s.y + s.normal.y * halfBarrier, 4.5, 0, Math.PI * 2);
            ctx.fill();
            // Right post
            ctx.beginPath();
            ctx.arc(s.x - s.normal.x * halfBarrier, s.y - s.normal.y * halfBarrier, 4.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    renderScenery(ctx) {
        this.sceneryProps.forEach(prop => {
            if (prop.type === 'grandstand') {
                ctx.save();
                ctx.translate(prop.x, prop.y);
                // Roof
                ctx.fillStyle = '#37474f';
                ctx.fillRect(-prop.width / 2, -prop.height / 2, prop.width, prop.height);
                // Bleacher stripes
                for (let r = 0; r < 5; r++) {
                    ctx.fillStyle = r % 2 === 0 ? '#00b0ff' : '#ffffff';
                    ctx.fillRect(-prop.width / 2 + 10, -prop.height / 2 + 8 + r * 7, prop.width - 20, 5);
                }
                // Shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
                ctx.fillRect(-prop.width / 2, prop.height / 2, prop.width, 8);
                ctx.restore();
            } else if (prop.type === 'pitlane') {
                ctx.save();
                ctx.translate(prop.x, prop.y);
                ctx.fillStyle = '#263238';
                ctx.fillRect(-prop.width / 2, -prop.height / 2, prop.width, prop.height);
                ctx.fillStyle = '#eceff1';
                ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('PIT LANE - NEON CIRCUIT', 0, 0);
                ctx.restore();
            } else if (prop.type === 'sign') {
                ctx.save();
                ctx.translate(prop.x, prop.y);
                // Post
                ctx.fillStyle = '#616161';
                ctx.fillRect(-2, 0, 4, 18);
                // Board
                ctx.fillStyle = '#212121';
                ctx.fillRect(-24, -14, 48, 16);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(-24, -14, 48, 16);
                ctx.fillStyle = '#ffeb3b';
                ctx.font = 'bold 11px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(prop.text, 0, -6);
                ctx.restore();
            } else if (prop.type === 'tree') {
                // Drop shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.beginPath();
                ctx.arc(prop.x + 6, prop.y + 6, prop.radius, 0, Math.PI * 2);
                ctx.fill();

                // Tree canopy (layered green circles)
                ctx.fillStyle = '#1b5e20';
                ctx.beginPath();
                ctx.arc(prop.x, prop.y, prop.radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#2e7d32';
                ctx.beginPath();
                ctx.arc(prop.x - 3, prop.y - 3, prop.radius * 0.75, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#43a047';
                ctx.beginPath();
                ctx.arc(prop.x - 5, prop.y - 5, prop.radius * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }
}

window.Track = Track;
