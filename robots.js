// Vector2D class
class Vector2D {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    getX() { return this.x; }
    getY() { return this.y; }
    setX(newX) { this.x = newX; }
    setY(newY) { this.y = newY; }
    adjustX(adjustment) { this.x += adjustment; }
    adjustY(adjustment) { this.y += adjustment; }
}

// Map class
class Map {
    constructor() {
        this.size = 22;
        this.EMPTY = 0;
        this.BATTERY = 1;
        this.WALL = 2;
        this.ROBOT = 9;
        this.map = Array(this.size).fill(null).map(() => Array(this.size).fill(0));

        // Create walls
        for (let i = 0; i < this.size; i++) {
            this.map[0][i] = this.WALL;
            this.map[this.size - 1][i] = this.WALL;
            this.map[i][0] = this.WALL;
            this.map[i][this.size - 1] = this.WALL;
        }

        // Place batteries (40% of inner cells)
        const innerCells = Math.pow(this.size - 2, 2);
        const batteryCount = Math.floor(innerCells * 0.4);

        let batteriesPlaced = 0;
        while (batteriesPlaced < batteryCount) {
            const y = 1 + Math.floor(Math.random() * (this.size - 2));
            const x = 1 + Math.floor(Math.random() * (this.size - 2));

            if (this.map[y][x] === this.EMPTY) {
                this.map[y][x] = this.BATTERY;
                batteriesPlaced++;
            }
        }
    }

    clone() {
        const newMap = new Map();
        newMap.map = this.map.map(row => [...row]);
        return newMap;
    }
}

// Robot class
class Robot {
    constructor(copyFrom = null) {
        this.direction = [0, 0, 0, 0];
        this.coords = null;
        this.energy = 5;
        this.fitness = 0;
        this.turnsAlive = 0;
        this.totalGenes = 16;
        this.genesPerBot = 4;
        this.genes = Array(this.totalGenes).fill(null).map(() => Array(this.genesPerBot).fill(0));
        this.movementGene = Array(this.totalGenes).fill(0);
        this.path = []; // Track path for visualization

        if (copyFrom) {
            // Deep copy from another robot
            for (let i = 0; i < this.totalGenes; i++) {
                for (let j = 0; j < this.genesPerBot; j++) {
                    this.genes[i][j] = copyFrom.genes[i][j];
                }
                this.movementGene[i] = copyFrom.movementGene[i];
            }
        } else {
            // Random genes
            for (let i = 0; i < this.totalGenes; i++) {
                for (let j = 0; j < this.genesPerBot; j++) {
                    this.genes[i][j] = Math.floor(Math.random() * 4);
                }
                this.movementGene[i] = Math.floor(Math.random() * 5);
            }
        }
    }

    randomStart(map) {
        const x = 1 + Math.floor(Math.random() * 10);
        const y = 1 + Math.floor(Math.random() * 10);
        this.coords = new Vector2D(x, y);
        this.path = [{x, y}];
        map.map[y][x] = map.ROBOT;
    }

    look(map) {
        const y = this.coords.getY();
        const x = this.coords.getX();
        this.direction[0] = map.map[y - 1][x];     // north
        this.direction[1] = map.map[y][x + 1];     // east
        this.direction[2] = map.map[y + 1][x];     // south
        this.direction[3] = map.map[y][x - 1];     // west
    }

    movement(map) {
        let dir = this.movementGene[this.checkGenes()];

        // Random direction if movement gene is 4
        if (dir === 4) {
            dir = Math.floor(Math.random() * 4);
        }

        this.move(map, dir);
    }

    move(map, dir) {
        this.energy -= 1;
        this.turnsAlive += 1;

        if (this.direction[dir] !== 2) { // Not a wall
            // If battery, collect it
            if (this.direction[dir] === 1) {
                this.energy += 5;
                this.fitness += 5;
            }

            // Reset current square
            map.map[this.coords.getY()][this.coords.getX()] = 0;

            // Move in direction
            switch (dir) {
                case 0: this.coords.adjustY(-1); break;
                case 1: this.coords.adjustX(1); break;
                case 2: this.coords.adjustY(1); break;
                case 3: this.coords.adjustX(-1); break;
            }

            // Update path
            this.path.push({x: this.coords.getX(), y: this.coords.getY()});

            // Set new position
            map.map[this.coords.getY()][this.coords.getX()] = map.ROBOT;
            this.look(map);
        } else {
            this.look(map);
        }
    }

    reset() {
        this.energy = 5;
        this.fitness = 0;
        this.turnsAlive = 0;
        this.path = [];
    }

    checkGenes() {
        for (let i = 0; i < this.totalGenes; i++) {
            if (this.direction[0] === this.genes[i][0] &&
                this.direction[1] === this.genes[i][1] &&
                this.direction[2] === this.genes[i][2] &&
                this.direction[3] === this.genes[i][3]) {
                return i;
            }
        }
        return this.totalGenes - 1;
    }
}

// Simulation Configuration
const CONFIG = {
    ROBOTS_PER_GEN: 200,  // Reduced for browser performance
    GENERATIONS: 100,      // Reduced for demo purposes
    TOP_PERCENT: 0.5,
    TOURNAMENT_SIZE: 10,
    MUTATION_RATE: 0.03
};

// Main Simulation Class
class RobotSimulation {
    constructor(gen1Canvas, finalCanvas, statsCallback) {
        this.gen1Canvas = gen1Canvas;
        this.finalCanvas = finalCanvas;
        this.gen1Ctx = gen1Canvas.getContext('2d');
        this.finalCtx = finalCanvas.getContext('2d');
        this.statsCallback = statsCallback;
        this.running = false;
        this.paused = false;
        this.currentGen = 0;
        this.robots = [];
        this.maps = [];
        this.avgFitness = [];
        this.bestEverBot = null;
        this.bestEverMap = null;
        this.bestEverGen = 0;
        this.bestEverFitness = 0;
        this.gen1Bot = null;
        this.gen1Map = null;

        this.initializeRobots();
    }

    initializeRobots() {
        this.robots = [];
        for (let i = 0; i < CONFIG.ROBOTS_PER_GEN; i++) {
            this.robots.push(new Robot());
        }
        this.currentGen = 0;
        this.avgFitness = [];
        this.bestEverBot = null;
        this.bestEverMap = null;
        this.bestEverFitness = 0;
        this.gen1Bot = null;
        this.gen1Map = null;

        // Clear both canvases
        this.gen1Ctx.clearRect(0, 0, this.gen1Canvas.width, this.gen1Canvas.height);
        this.finalCtx.clearRect(0, 0, this.finalCanvas.width, this.finalCanvas.height);
    }

    async runGeneration() {
        this.maps = [];
        let totalFitness = 0;

        // Run each robot through the maze
        for (let i = 0; i < CONFIG.ROBOTS_PER_GEN; i++) {
            const map = new Map();
            this.maps.push(map);
            this.robots[i].reset();
            this.robots[i].randomStart(map);
            this.robots[i].look(map);

            while (this.robots[i].energy > 0) {
                this.robots[i].movement(map);
            }

            totalFitness += this.robots[i].fitness;
        }

        const avgFit = Math.floor(totalFitness / CONFIG.ROBOTS_PER_GEN);
        this.avgFitness.push(avgFit);

        // Sort by fitness
        this.sortByFitness();

        // Save a random robot from generation 1
        if (this.currentGen === 0) {
            const randomIdx = Math.floor(Math.random() * CONFIG.ROBOTS_PER_GEN);
            this.gen1Bot = new Robot(this.robots[randomIdx]);
            this.gen1Bot.path = [...this.robots[randomIdx].path];
            this.gen1Map = this.maps[randomIdx].clone();
        }

        // Track best ever
        if (this.robots[0].fitness > this.bestEverFitness) {
            this.bestEverFitness = this.robots[0].fitness;
            this.bestEverBot = new Robot(this.robots[0]);
            this.bestEverBot.path = [...this.robots[0].path];
            this.bestEverMap = this.maps[0].clone();
            this.bestEverGen = this.currentGen;
        }

        // Update stats
        this.updateStats();

        this.currentGen++;

        // Evolve next generation or finish
        if (this.currentGen < CONFIG.GENERATIONS) {
            this.evolveNextGen();
        } else {
            this.running = false;
            this.updateStats();
            // Display final comparison
            await this.displayComparison();
        }
    }

    sortByFitness() {
        for (let i = 0; i < this.robots.length - 1; i++) {
            for (let j = i + 1; j < this.robots.length; j++) {
                if (this.robots[j].fitness > this.robots[i].fitness) {
                    [this.robots[i], this.robots[j]] = [this.robots[j], this.robots[i]];
                    [this.maps[i], this.maps[j]] = [this.maps[j], this.maps[i]];
                }
            }
        }
    }

    evolveNextGen() {
        const nextGen = [];

        // Preserve top performers
        const eliteCount = Math.floor(CONFIG.ROBOTS_PER_GEN * CONFIG.TOP_PERCENT);
        for (let i = 0; i < eliteCount; i++) {
            nextGen.push(new Robot(this.robots[i]));
        }

        // Create offspring through crossover
        while (nextGen.length < CONFIG.ROBOTS_PER_GEN) {
            const parent1 = this.tournament();
            const parent2 = this.tournament();
            const children = this.crossover(parent1, parent2);
            nextGen.push(children[0]);
            if (nextGen.length < CONFIG.ROBOTS_PER_GEN) {
                nextGen.push(children[1]);
            }
        }

        this.robots = nextGen;
    }

    tournament() {
        let best = null;
        for (let i = 0; i < CONFIG.TOURNAMENT_SIZE; i++) {
            const idx = Math.floor(Math.random() * this.robots.length);
            if (!best || this.robots[idx].fitness > best.fitness) {
                best = this.robots[idx];
            }
        }
        return best;
    }

    crossover(p1, p2) {
        const child1 = new Robot();
        const child2 = new Robot();

        for (let y = 0; y < 16; y++) {
            if (Math.random() < 0.5) {
                for (let z = 0; z < 4; z++) {
                    child1.genes[y][z] = p1.genes[y][z];
                    child2.genes[y][z] = p2.genes[y][z];
                    if (Math.random() < CONFIG.MUTATION_RATE) {
                        child1.genes[y][z] = Math.floor(Math.random() * 3);
                        child2.genes[y][z] = Math.floor(Math.random() * 3);
                    }
                }
                child1.movementGene[y] = p1.movementGene[y];
                child2.movementGene[y] = p2.movementGene[y];
            } else {
                for (let z = 0; z < 4; z++) {
                    child1.genes[y][z] = p2.genes[y][z];
                    child2.genes[y][z] = p1.genes[y][z];
                    if (Math.random() < CONFIG.MUTATION_RATE) {
                        child1.genes[y][z] = Math.floor(Math.random() * 3);
                        child2.genes[y][z] = Math.floor(Math.random() * 3);
                    }
                }
                child1.movementGene[y] = p2.movementGene[y];
                child2.movementGene[y] = p1.movementGene[y];
            }
        }

        return [child1, child2];
    }

    drawRobotOnCanvas(ctx, canvas, robot, map) {
        if (!robot || !map) return;

        const cellSize = canvas.width / map.size;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw map
        for (let y = 0; y < map.size; y++) {
            for (let x = 0; x < map.size; x++) {
                const cell = map.map[y][x];

                if (cell === map.WALL) {
                    ctx.fillStyle = '#475569';
                } else if (cell === map.BATTERY) {
                    ctx.fillStyle = '#22c55e';
                } else {
                    ctx.fillStyle = '#1e293b';
                }

                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                ctx.strokeStyle = '#0f172a';
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }

        // Draw path
        if (robot.path && robot.path.length > 0) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.beginPath();

            const firstPoint = robot.path[0];
            ctx.moveTo(firstPoint.x * cellSize + cellSize/2, firstPoint.y * cellSize + cellSize/2);

            for (let i = 1; i < robot.path.length; i++) {
                const point = robot.path[i];
                ctx.lineTo(point.x * cellSize + cellSize/2, point.y * cellSize + cellSize/2);
            }
            ctx.stroke();

            // Draw robot at end position
            const lastPoint = robot.path[robot.path.length - 1];
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(lastPoint.x * cellSize + cellSize/2, lastPoint.y * cellSize + cellSize/2, cellSize/3, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    async displayComparison() {
        // Draw gen 1 robot on left canvas
        this.drawRobotOnCanvas(this.gen1Ctx, this.gen1Canvas, this.gen1Bot, this.gen1Map);

        // Draw best ever robot on right canvas
        this.drawRobotOnCanvas(this.finalCtx, this.finalCanvas, this.bestEverBot, this.bestEverMap);
    }

    updateStats() {
        if (this.statsCallback) {
            this.statsCallback({
                generation: this.currentGen,
                totalGenerations: CONFIG.GENERATIONS,
                avgFitness: this.avgFitness[this.currentGen - 1] || 0,
                bestFitness: this.bestEverFitness,
                bestGen: this.bestEverGen + 1,
                turnsAlive: this.bestEverBot ? this.bestEverBot.turnsAlive : 0,
                running: this.running,
                maxPossible: Math.pow(20, 2) * 2
            });
        }
    }

    async start() {
        this.running = true;
        this.paused = false;

        while (this.running && this.currentGen < CONFIG.GENERATIONS) {
            if (!this.paused) {
                await this.runGeneration();
                // Small delay to allow UI updates
                await new Promise(resolve => setTimeout(resolve, 10));
            } else {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    pause() {
        this.paused = !this.paused;
    }

    reset() {
        this.running = false;
        this.paused = false;
        this.initializeRobots();
        this.updateStats();
    }
}
