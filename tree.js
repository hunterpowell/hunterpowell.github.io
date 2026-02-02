// Tree Generator - Canvas port of hunterpowell/tree-gen
// Procedural tree generation using recursive branching

class TreeSimulation {
    constructor(canvas, statsCallback) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.statsCallback = statsCallback;
        this.running = false;
        this.animationId = null;

        // Tree parameters (matching the Python CLI defaults)
        this.startingLength = 125;
        this.minBranchLength = 10;
        this.petalOdds = 0.6;
        this.extraBranchOdds = 0.15;
        this.deathChance = 0.1;
        this.maxDepth = 10;
        this.minAngle = 15;
        this.maxAngle = 30;
        this.minBranchRatio = 0.70;
        this.maxBranchRatio = 0.77;

        // Drawing state
        this.branches = 0;
        this.petals = 0;
        this.drawQueue = [];
        this.queueIndex = 0;

        this.drawInitial();
    }

    drawInitial() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Sky background
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, w, h);

        // Ground
        ctx.fillStyle = '#79C05A';
        ctx.fillRect(0, h * 0.82, w, h * 0.18);

        this.updateStats();
    }

    random(min, max) {
        return Math.random() * (max - min) + min;
    }

    degToRad(deg) {
        return deg * Math.PI / 180;
    }

    // Pre-compute the full tree into a draw queue for animated rendering
    generate() {
        this.drawQueue = [];
        this.branches = 0;
        this.petals = 0;

        const baseX = this.canvas.width / 2;
        const baseY = this.canvas.height * 0.82;

        // Draw stump (the flared base)
        this.generateStump(baseX, baseY);

        // 4 main trunk directions, like the Python version
        const trunkTop = baseY - 40;
        const startAngles = [-50, -10, 10, 50];

        for (const angle of startAngles) {
            this.generateBranch(baseX, trunkTop, -90 + angle, this.startingLength, 0);
        }
    }

    generateStump(cx, groundY) {
        // Flared stump using x^7 curves (matching Python's draw_stump)
        const points = [];
        const steps = 75;
        const stepSize = 0.02;
        const stumpHeight = 40;
        const stumpWidth = 25;

        // Right side curve
        const rightPoints = [];
        for (let i = 0; i <= steps; i++) {
            const t = i * stepSize;
            const x = t;
            const y = Math.pow(t, 7);
            rightPoints.push({
                x: cx + x * stumpWidth,
                y: groundY - stumpHeight + y * stumpHeight
            });
        }

        // Left side curve (mirrored)
        const leftPoints = [];
        for (let i = 0; i <= steps; i++) {
            const t = i * stepSize;
            const x = t;
            const y = Math.pow(t, 7);
            leftPoints.push({
                x: cx - x * stumpWidth,
                y: groundY - stumpHeight + y * stumpHeight
            });
        }

        this.drawQueue.push({
            type: 'stump',
            rightPoints: rightPoints,
            leftPoints: leftPoints,
            cx: cx,
            groundY: groundY,
            stumpWidth: stumpWidth
        });
    }

    generateBranch(x, y, angle, length, depth) {
        // Kill conditions
        if (depth > this.maxDepth) return;
        if (length < this.minBranchLength) {
            this.addPetal(x, y);
            return;
        }
        if (depth > 1 && Math.random() < this.deathChance) {
            this.addPetal(x, y);
            return;
        }

        // Shorten early branches for natural trunk look
        let drawLength = length;
        if (depth < 2) {
            drawLength = length / this.random(1.5, 2.5);
        }

        // Calculate end point
        const rad = this.degToRad(angle);
        const endX = x + Math.cos(rad) * drawLength;
        const endY = y + Math.sin(rad) * drawLength;

        // Pen thickness based on depth
        let thickness;
        if (depth <= 1) thickness = 8;
        else if (depth <= 2) thickness = 6;
        else if (depth <= 3) thickness = 4;
        else if (depth <= 4) thickness = 3;
        else if (depth <= 5) thickness = 2;
        else thickness = 1;

        // Color: darker brown at trunk, lighter at tips
        const brownShade = Math.min(depth * 8, 60);
        const color = `rgb(${101 + brownShade}, ${67 + brownShade}, ${33 + brownShade / 2})`;

        this.drawQueue.push({
            type: 'branch',
            x1: x, y1: y,
            x2: endX, y2: endY,
            thickness: thickness,
            color: color,
            depth: depth
        });

        this.branches++;

        // Calculate child branch length
        const newLength = length * this.random(this.minBranchRatio, this.maxBranchRatio);

        // Branch angles
        const rightAngle = angle + this.random(this.minAngle, this.maxAngle);
        const leftAngle = angle - this.random(this.minAngle, this.maxAngle);

        // Extra branch probability increases with depth
        const branchOdds = this.extraBranchOdds + (depth * 0.02);

        // Always: right and left branches
        this.generateBranch(endX, endY, rightAngle, newLength, depth + 1);
        this.generateBranch(endX, endY, leftAngle, newLength, depth + 1);

        // Sometimes: extra branches
        if (Math.random() < branchOdds) {
            const extraRight = angle + this.random(this.minAngle * 0.5, this.maxAngle * 1.3);
            this.generateBranch(endX, endY, extraRight, newLength * 0.9, depth + 1);
        }
        if (Math.random() < branchOdds) {
            const extraLeft = angle - this.random(this.minAngle * 0.5, this.maxAngle * 1.3);
            this.generateBranch(endX, endY, extraLeft, newLength * 0.9, depth + 1);
        }
    }

    addPetal(x, y) {
        if (Math.random() < this.petalOdds) {
            this.drawQueue.push({
                type: 'petal',
                x: x,
                y: y
            });
            this.petals++;
        }
    }

    // Draw a single petal (5-petal flower like the Python version)
    drawPetal(ctx, x, y) {
        ctx.save();
        ctx.translate(x, y);

        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `hsl(${330 + Math.random() * 30}, ${70 + Math.random() * 20}%, ${70 + Math.random() * 15}%)`;
            ctx.beginPath();
            ctx.ellipse(0, -3, 2.5, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.rotate(Math.PI * 2 / 5);
        }

        // Center
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawStump(ctx, item) {
        ctx.fillStyle = '#654321';
        ctx.beginPath();

        // Right side
        ctx.moveTo(item.cx, item.groundY - 40);
        for (const p of item.rightPoints) {
            ctx.lineTo(p.x, p.y);
        }

        // Bottom
        ctx.lineTo(item.cx + item.stumpWidth, item.groundY);
        ctx.lineTo(item.cx - item.stumpWidth, item.groundY);

        // Left side (reversed)
        for (let i = item.leftPoints.length - 1; i >= 0; i--) {
            ctx.lineTo(item.leftPoints[i].x, item.leftPoints[i].y);
        }

        ctx.closePath();
        ctx.fill();
    }

    start() {
        if (this.running) return;
        this.running = true;

        // Regenerate tree
        this.drawInitial();
        this.generate();
        this.queueIndex = 0;

        this.updateStats();
        this.animate();
    }

    animate() {
        if (!this.running) return;

        const batchSize = 12;
        const ctx = this.ctx;

        for (let i = 0; i < batchSize && this.queueIndex < this.drawQueue.length; i++) {
            const item = this.drawQueue[this.queueIndex];

            if (item.type === 'stump') {
                this.drawStump(ctx, item);
            } else if (item.type === 'branch') {
                ctx.strokeStyle = item.color;
                ctx.lineWidth = item.thickness;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(item.x1, item.y1);
                ctx.lineTo(item.x2, item.y2);
                ctx.stroke();
            } else if (item.type === 'petal') {
                this.drawPetal(ctx, item.x, item.y);
            }

            this.queueIndex++;
        }

        this.updateStats();

        if (this.queueIndex < this.drawQueue.length) {
            this.animationId = requestAnimationFrame(() => this.animate());
        } else {
            this.running = false;
            this.updateStats();
        }
    }

    pause() {
        if (this.running) {
            this.running = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        } else if (this.queueIndex < this.drawQueue.length) {
            this.running = true;
            this.animate();
        }
    }

    reset() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.drawQueue = [];
        this.queueIndex = 0;
        this.branches = 0;
        this.petals = 0;
        this.drawInitial();
        this.updateStats();
    }

    updateStats() {
        if (this.statsCallback) {
            const progress = this.drawQueue.length > 0
                ? Math.floor((this.queueIndex / this.drawQueue.length) * 100)
                : 0;
            this.statsCallback({
                branches: this.branches,
                petals: this.petals,
                progress: progress,
                running: this.running
            });
        }
    }
}
