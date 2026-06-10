// robots.js — Coverage Bot Evolution, a browser port of the C++ original
// (github.com/hunterpowell/GeneticAlg). Faithful to the real sim:
//   - cell states EMPTY / BATTERY / WALL / VISITED — sensing VISITED is what
//     lets sweep strategies emerge
//   - 32-rule genomes: 4 condition values (N/E/S/W neighbors) + a movement
//     action; the first matching rule fires, the last rule is the fallback
//   - WILDCARD condition values match any cell state and can only enter the
//     gene pool through mutation, never at initialization
//   - 5% elitism, tournament selection (size 10), uniform crossover, 0.07%
//     per-value mutation applied to children
// Scaled down for the browser: the original runs 500 robots × 2000
// generations on a 50×50 interior, parallelized with OpenMP.

const CONFIG = {
    // cell states (Config.h)
    EMPTY: 0, BATTERY: 1, WALL: 2, VISITED: 3, WILDCARD: 4, THE_GUY: 7,

    MAP_SIZE: 26,            // C++: 52 (both counts include the wall ring)
    GENE_COUNT: 32,
    VALS_PER_GENE: 4,

    GENERATIONS: 250,        // C++: 2000
    ROBOTS_PER_GEN: 100,     // C++: 500
    TOP_PERCENT: 0.05,
    TOURNAMENT_SIZE: 10,
    MUTATION_RATE: 0.0007,   // 0.07% per gene value — the only door for wildcards

    BATTERY_FRACTION: 0.4,
    START_ENERGY: 5,
    BATTERY_BOOST: 5,        // batteries give +5 energy and +5 fitness
};
const INTERIOR = (CONFIG.MAP_SIZE - 2) * (CONFIG.MAP_SIZE - 2);
const MAX_FITNESS = Math.floor(INTERIOR * CONFIG.BATTERY_FRACTION) * CONFIG.BATTERY_BOOST;

const DY = [-1, 0, 1, 0];    // n e s w
const DX = [0, 1, 0, -1];

function randInt(n) { return Math.floor(Math.random() * n); }

// walled grid, interior shuffled, first 40% of cells get batteries
// (MapGenerator.cpp). Named CoverageMap to avoid shadowing the Map global.
class CoverageMap {
    constructor() {
        const n = CONFIG.MAP_SIZE;
        this.grid = Array.from({ length: n }, () => new Array(n).fill(CONFIG.EMPTY));
        for (let i = 0; i < n; i++) {
            this.grid[0][i] = this.grid[n - 1][i] = CONFIG.WALL;
            this.grid[i][0] = this.grid[i][n - 1] = CONFIG.WALL;
        }
        const cells = [];
        for (let r = 1; r < n - 1; r++) {
            for (let c = 1; c < n - 1; c++) cells.push([r, c]);
        }
        for (let i = cells.length - 1; i > 0; i--) {       // Fisher–Yates
            const j = randInt(i + 1);
            [cells[i], cells[j]] = [cells[j], cells[i]];
        }
        const batteries = Math.floor(cells.length * CONFIG.BATTERY_FRACTION);
        for (let i = 0; i < batteries; i++) {
            this.grid[cells[i][0]][cells[i][1]] = CONFIG.BATTERY;
        }
    }
}

class Robot {
    constructor(copyFrom = null) {
        this.row = 0;
        this.col = 0;
        this.energy = CONFIG.START_ENERGY;
        this.fitness = 0;
        this.turnsAlive = 0;
        this.surroundings = [0, 0, 0, 0];

        if (copyFrom) {
            this.genes = copyFrom.genes.map((g) => g.slice());
            this.movementGene = copyFrom.movementGene.slice();
        } else {
            // condition values 0–3 (EMPTY/BATTERY/WALL/VISITED): wildcards are
            // deliberately NOT a valid initial state. movement is 0–4 (nesw + random)
            this.genes = Array.from({ length: CONFIG.GENE_COUNT }, () =>
                Array.from({ length: CONFIG.VALS_PER_GENE }, () => randInt(4)));
            this.movementGene = Array.from({ length: CONFIG.GENE_COUNT }, () => randInt(5));
        }
    }

    reset() {
        this.energy = CONFIG.START_ENERGY;
        this.fitness = 0;
        this.turnsAlive = 0;
        this.row = 1 + randInt(CONFIG.MAP_SIZE - 2);   // anywhere in the interior
        this.col = 1 + randInt(CONFIG.MAP_SIZE - 2);
    }

    look(map) {
        const g = map.grid;
        for (let i = 0; i < 4; i++) {
            this.surroundings[i] = g[this.row + DY[i]][this.col + DX[i]];
        }
    }

    // a gene matches when every condition value equals the neighbor — or is a wildcard
    geneMatch(i) {
        for (let j = 0; j < CONFIG.VALS_PER_GENE; j++) {
            const v = this.genes[i][j];
            if (v !== this.surroundings[j] && v !== CONFIG.WILDCARD) return false;
        }
        return true;
    }

    movement(map) {
        this.look(map);
        for (let i = 0; i < CONFIG.GENE_COUNT - 1; i++) {
            if (this.geneMatch(i)) { this.move(map, this.movementGene[i]); return; }
        }
        this.move(map, this.movementGene[CONFIG.GENE_COUNT - 1]);   // default fallback
    }

    move(map, mgene) {
        this.energy--;          // every turn costs energy, even a wall bump
        this.turnsAlive++;
        const dir = mgene !== 4 ? mgene : randInt(4);
        if (this.surroundings[dir] === CONFIG.WALL) return;

        map.grid[this.row][this.col] = CONFIG.VISITED;   // leave a trail
        this.row += DY[dir];
        this.col += DX[dir];
        if (map.grid[this.row][this.col] === CONFIG.BATTERY) {
            this.energy += CONFIG.BATTERY_BOOST;
            this.fitness += CONFIG.BATTERY_BOOST;
        }
        map.grid[this.row][this.col] = CONFIG.THE_GUY;
    }

    // per-value chance, values 0–4: mutation is the only way WILDCARD gets
    // into a condition slot. The movement gene mutates too.
    mutate() {
        for (let i = 0; i < CONFIG.GENE_COUNT; i++) {
            for (let j = 0; j < CONFIG.VALS_PER_GENE; j++) {
                if (Math.random() < CONFIG.MUTATION_RATE) this.genes[i][j] = randInt(5);
            }
            if (Math.random() < CONFIG.MUTATION_RATE) this.movementGene[i] = randInt(5);
        }
    }
}

// final-map-state palette (site pastels) — the rose VISITED trail is the
// whole show: a good bot's trail reads as a lawnmower sweep
const CELL_COLORS = {
    [CONFIG.EMPTY]:   '#c7ccd2',   // pale blue-grey floor
    [CONFIG.BATTERY]: '#7faf93',   // muted sage
    [CONFIG.WALL]:    '#8a6f7d',   // dusty plum
    [CONFIG.VISITED]: '#dcb2c4',   // rose — ground covered
    [CONFIG.THE_GUY]: '#d39b53',   // gold — where it ran out of energy
};

class RobotSimulation {
    constructor(gen1Canvas, finalCanvas, statsCallback) {
        this.gen1Canvas = gen1Canvas;
        this.finalCanvas = finalCanvas;
        this.gen1Ctx = gen1Canvas.getContext('2d');
        this.finalCtx = finalCanvas.getContext('2d');
        this.statsCallback = statsCallback;
        this.running = false;
        this.paused = false;
        this.initializeRobots();
    }

    initializeRobots() {
        this.robots = Array.from({ length: CONFIG.ROBOTS_PER_GEN }, () => new Robot());
        this.currentGen = 0;
        this.avgFitness = [];
        this.bestEverFitness = 0;
        this.bestEverGen = 0;
        this.bestGrid = null;    // final map state of the best run so far
        this.gen1Grid = null;    // final map state of a random gen-1 bot
        this.gen1Ctx.clearRect(0, 0, this.gen1Canvas.width, this.gen1Canvas.height);
        this.finalCtx.clearRect(0, 0, this.finalCanvas.width, this.finalCanvas.height);
    }

    // run one bot on a fresh map until its energy dies (the eval loop body
    // in Simulator.cpp); the mutated map is the display artifact
    evaluate(robot) {
        const map = new CoverageMap();
        robot.reset();
        map.grid[robot.row][robot.col] = CONFIG.THE_GUY;
        while (robot.energy > 0) robot.movement(map);
        return map;
    }

    // One full generation is ~7ms of compute — a single frame's worth —
    // so it runs synchronously and start() yields a frame between gens.
    runGeneration() {
        const N = CONFIG.ROBOTS_PER_GEN;
        const grids = new Array(N);
        let totalFitness = 0;

        for (let i = 0; i < N; i++) {
            grids[i] = this.evaluate(this.robots[i]).grid;
            totalFitness += this.robots[i].fitness;
        }

        this.avgFitness.push(Math.floor(totalFitness / N));

        // sort robots by fitness (desc), keeping each one's map aligned
        const order = this.robots.map((_, i) => i)
            .sort((a, b) => this.robots[b].fitness - this.robots[a].fitness);
        this.robots = order.map((i) => this.robots[i]);
        const sorted = order.map((i) => grids[i]);

        // snapshot a random gen-1 bot for the left canvas (genOneRando)
        if (this.currentGen === 0) {
            this.gen1Grid = sorted[randInt(N)];
            this.drawGrid(this.gen1Ctx, this.gen1Canvas, this.gen1Grid);
        }

        // >= so later generations win ties, like the C++ best-bot tracking
        if (this.robots[0].fitness >= this.bestEverFitness) {
            this.bestEverFitness = this.robots[0].fitness;
            this.bestEverGen = this.currentGen + 1;
            this.bestGrid = sorted[0];
        }
        // redraw every generation — you watch the sweep strategy take shape
        this.drawGrid(this.finalCtx, this.finalCanvas, this.bestGrid);

        this.updateStats();
        this.currentGen++;

        if (this.currentGen < CONFIG.GENERATIONS) {
            this.evolveNextGen();
        } else {
            this.running = false;
            this.updateStats();
        }
    }

    evolveNextGen() {
        const eliteCount = Math.floor(CONFIG.ROBOTS_PER_GEN * CONFIG.TOP_PERCENT);
        const nextGen = this.robots.slice(0, eliteCount).map((r) => new Robot(r));
        // each slot breeds its own pair and keeps one child (repopulate())
        for (let i = eliteCount; i < CONFIG.ROBOTS_PER_GEN; i++) {
            const children = this.crossover(this.tournament(), this.tournament());
            const child = children[i % 2];
            child.mutate();
            nextGen.push(child);
        }
        this.robots = nextGen;
    }

    // sample TOURNAMENT_SIZE robots, keep the fittest. The baseline is a fresh
    // random robot (fitness 0), faithfully copying the C++: if every sampled
    // bot scored 0, a brand-new genome wins the tournament — a quiet little
    // diversity injector in dead generations.
    tournament() {
        let best = new Robot();
        for (let i = 0; i < CONFIG.TOURNAMENT_SIZE; i++) {
            const r = this.robots[randInt(this.robots.length)];
            if (r.fitness > best.fitness) best = r;
        }
        return best;
    }

    // uniform crossover: each rule (condition row + its movement action)
    // is inherited whole from one parent, 50/50
    crossover(p1, p2) {
        const c1 = new Robot();
        const c2 = new Robot();
        for (let i = 0; i < CONFIG.GENE_COUNT; i++) {
            const [a, b] = Math.random() < 0.5 ? [p1, p2] : [p2, p1];
            c1.genes[i] = a.genes[i].slice();
            c1.movementGene[i] = a.movementGene[i];
            c2.genes[i] = b.genes[i].slice();
            c2.movementGene[i] = b.movementGene[i];
        }
        return [c1, c2];
    }

    // render a final map state, graph.py-style: trail, leftover batteries,
    // walls, and the cell where the bot powered down
    drawGrid(ctx, canvas, grid) {
        if (!grid) return;
        const n = CONFIG.MAP_SIZE;
        const cell = canvas.width / n;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                ctx.fillStyle = CELL_COLORS[grid[r][c]] || CELL_COLORS[CONFIG.EMPTY];
                ctx.fillRect(c * cell, r * cell, cell + 0.5, cell + 0.5);
            }
        }
    }

    updateStats() {
        if (!this.statsCallback) return;
        this.statsCallback({
            generation: this.currentGen,
            totalGenerations: CONFIG.GENERATIONS,
            avgFitness: this.avgFitness[this.avgFitness.length - 1] || 0,
            bestFitness: this.bestEverFitness,
            bestGen: this.bestEverGen,
            coverage: Math.round((this.bestEverFitness / MAX_FITNESS) * 1000) / 10,
            running: this.running,
        });
    }

    async start() {
        this.running = true;
        this.paused = false;
        // Run generations inside a per-frame time budget, then yield a frame
        // so the canvas paints. A generation costs ~5-10ms (more in late gens,
        // when bots live longer), so this packs 2-3 early gens into a frame
        // and self-throttles to 1/frame later — the full 250 gens take ~2.5s
        // instead of the 4.2s that strict one-gen-per-frame would.
        const FRAME_BUDGET_MS = 12;
        const nextFrame = () => new Promise((resolve) =>
            typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame(resolve)
                : setTimeout(resolve, 0));
        try {
            while (this.running && this.currentGen < CONFIG.GENERATIONS) {
                if (!this.paused) {
                    const t = performance.now();
                    do {
                        this.runGeneration();
                    } while (this.running && !this.paused &&
                             this.currentGen < CONFIG.GENERATIONS &&
                             performance.now() - t < FRAME_BUDGET_MS);
                    await nextFrame();
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
        } catch (error) {
            console.error('Simulation error:', error);
            this.running = false;
            this.updateStats();
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
