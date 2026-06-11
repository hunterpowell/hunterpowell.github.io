// minesweeper.js — a pastel, lofi take on the Windows classic.
// DOM-grid (not canvas) so every cell is a real <button>: keyboard- and
// screen-reader-reachable, and easy to bevel with the site's Win9x CSS.
//   - the first click is always safe: mines are placed AFTER it, avoiding
//     the clicked cell and its 8 neighbours, so you never open onto a mine
//     and always get a little pocket to start from
//   - zero-neighbour cells flood open (iterative, no recursion limit)
//   - right-click OR long-press flags a cell (the long-press is for touch)
//   - the smiley reacts: 🙂 idle · 😮 mid-press · 😎 win · 😵 loss
// Kept deliberately framework-free to match paint.js / robots.js.

(function () {
    'use strict';

    const LEVELS = {
        beginner:     { rows: 9,  cols: 9,  mines: 10 },
        intermediate: { rows: 16, cols: 16, mines: 40 },
        expert:       { rows: 16, cols: 30, mines: 99 },
    };

    const NEIGHBORS = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1],
    ];

    const FACES = { happy: '🙂', o: '😮', cool: '😎', dead: '😵' };

    // classic 3-digit LED readout; clamps to [-99, 999] like the original
    function pad3(n) {
        if (n < 0) return '-' + String(Math.min(99, -n)).padStart(2, '0');
        return String(Math.min(999, n)).padStart(3, '0');
    }

    class MinesweeperGame {
        constructor(root, level = 'beginner') {
            this.root = root;
            this.gridEl = root.querySelector('[data-mines-grid]');
            this.counterEl = root.querySelector('[data-mines-count]');
            this.timerEl = root.querySelector('[data-mines-time]');
            this.faceEl = root.querySelector('[data-mines-face]');

            // bound handlers kept so destroy() can detach the document-level one
            this._onFace = () => this.newGame();
            this._onUp = () => this.onPointerUp();
            this.faceEl.addEventListener('click', this._onFace);
            document.addEventListener('pointerup', this._onUp);

            this.timer = null;
            this.newGame(level);
        }

        /* ---- lifecycle ------------------------------------- */
        newGame(level) {
            if (level && LEVELS[level]) this.level = level;
            const { rows, cols, mines } = LEVELS[this.level || 'beginner'];
            this.rows = rows; this.cols = cols; this.mines = mines;

            this.alive = true;
            this.won = false;
            this.started = false;        // first click not yet made
            this.revealedCount = 0;
            this.flags = 0;
            this.elapsed = 0;
            this.stopTimer();
            this.setFace('happy');
            this.updateCounter();
            this.updateTimer();

            this.cells = Array.from({ length: rows }, () =>
                Array.from({ length: cols }, () => ({
                    mine: false, adj: 0, revealed: false, flagged: false,
                })));

            this.buildGrid();
        }

        buildGrid() {
            const g = this.gridEl;
            g.style.setProperty('--cols', this.cols);
            g.replaceChildren();
            this.btns = [];
            for (let r = 0; r < this.rows; r++) {
                const row = [];
                for (let c = 0; c < this.cols; c++) {
                    const b = document.createElement('button');
                    b.className = 'mine-cell';
                    b.type = 'button';
                    b.dataset.r = r;
                    b.dataset.c = c;
                    b.setAttribute('aria-label', `row ${r + 1} column ${c + 1}`);
                    row.push(b);
                    g.appendChild(b);
                }
                this.btns.push(row);
            }
            // delegate, rather than wiring rows*cols listeners
            g.onclick = (e) => this.onClick(e);
            g.oncontextmenu = (e) => this.onRightClick(e);
            g.onpointerdown = (e) => this.onPointerDown(e);
            g.onpointermove = () => this.clearLongPress();
            g.onpointercancel = () => this.clearLongPress();
        }

        /* ---- input ----------------------------------------- */
        onPointerDown(e) {
            if (!this.alive || this.won || e.button === 2) return;
            this.setFace('o');                 // suspense while a cell is held
            const cell = e.target.closest('.mine-cell');
            if (!cell) return;
            // long-press → flag, so touch users can flag without a right-click
            this._suppressClick = false;
            this.clearLongPress();
            this._lpTimer = setTimeout(() => {
                this._suppressClick = true;    // swallow the click that follows
                this.setFace('happy');
                this.toggleFlag(+cell.dataset.r, +cell.dataset.c);
            }, 450);
        }

        clearLongPress() {
            if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
        }

        onPointerUp() {
            this.clearLongPress();
            if (this.alive && !this.won) this.setFace('happy');
        }

        onClick(e) {
            if (this._suppressClick) { this._suppressClick = false; return; }
            const cell = e.target.closest('.mine-cell');
            if (!cell || !this.alive || this.won) return;
            const r = +cell.dataset.r, c = +cell.dataset.c;
            if (this.cells[r][c].flagged) return;   // a flagged cell is protected
            this.reveal(r, c);
        }

        onRightClick(e) {
            e.preventDefault();
            const cell = e.target.closest('.mine-cell');
            if (!cell || !this.alive || this.won) return;
            this.toggleFlag(+cell.dataset.r, +cell.dataset.c);
        }

        /* ---- moves ----------------------------------------- */
        toggleFlag(r, c) {
            const cell = this.cells[r][c];
            if (cell.revealed) return;
            cell.flagged = !cell.flagged;
            this.flags += cell.flagged ? 1 : -1;
            const b = this.btns[r][c];
            b.classList.toggle('flagged', cell.flagged);
            b.textContent = cell.flagged ? '⚑' : '';
            this.updateCounter();
        }

        reveal(r, c) {
            const cell = this.cells[r][c];
            if (cell.revealed || cell.flagged) return;
            if (!this.started) this.firstClick(r, c);   // lay mines, start clock

            if (cell.mine) { this.loseGame(r, c); return; }

            // iterative flood fill: open the cell, and if it has no adjacent
            // mines spill into its neighbours
            const stack = [[r, c]];
            while (stack.length) {
                const [cr, cc] = stack.pop();
                const cl = this.cells[cr][cc];
                if (cl.revealed || cl.flagged || cl.mine) continue;
                cl.revealed = true;
                this.revealedCount++;
                this.paintRevealed(cr, cc);
                if (cl.adj === 0) {
                    for (const [dr, dc] of NEIGHBORS) {
                        const nr = cr + dr, nc = cc + dc;
                        if (this.inBounds(nr, nc) && !this.cells[nr][nc].revealed) {
                            stack.push([nr, nc]);
                        }
                    }
                }
            }

            if (this.revealedCount === this.rows * this.cols - this.mines) this.winGame();
        }

        // mines are seeded on the first reveal so it (and its ring) stay clear
        firstClick(r, c) {
            const safe = new Set([key(r, c)]);
            for (const [dr, dc] of NEIGHBORS) {
                const nr = r + dr, nc = c + dc;
                if (this.inBounds(nr, nc)) safe.add(key(nr, nc));
            }

            const open = [];
            for (let i = 0; i < this.rows; i++) {
                for (let j = 0; j < this.cols; j++) {
                    if (!safe.has(key(i, j))) open.push([i, j]);
                }
            }
            // Fisher–Yates, then take the first `mines` (same trick as robots.js)
            for (let i = open.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [open[i], open[j]] = [open[j], open[i]];
            }
            for (let i = 0; i < this.mines; i++) {
                const [mr, mc] = open[i];
                this.cells[mr][mc].mine = true;
            }
            // precompute adjacency counts once
            for (let i = 0; i < this.rows; i++) {
                for (let j = 0; j < this.cols; j++) {
                    if (this.cells[i][j].mine) continue;
                    let n = 0;
                    for (const [dr, dc] of NEIGHBORS) {
                        const nr = i + dr, nc = j + dc;
                        if (this.inBounds(nr, nc) && this.cells[nr][nc].mine) n++;
                    }
                    this.cells[i][j].adj = n;
                }
            }

            this.started = true;
            this.startTimer();
        }

        /* ---- endgame --------------------------------------- */
        loseGame(r, c) {
            this.alive = false;
            this.stopTimer();
            this.setFace('dead');
            this.btns[r][c].classList.add('boom');   // the mine you hit
            for (let i = 0; i < this.rows; i++) {
                for (let j = 0; j < this.cols; j++) {
                    const cell = this.cells[i][j];
                    const b = this.btns[i][j];
                    if (cell.mine && !cell.flagged) {
                        b.classList.add('open', 'mine');
                        b.textContent = '✸';
                    } else if (cell.flagged && !cell.mine) {
                        b.classList.add('wrong');     // a flag that guessed wrong
                        b.textContent = '✗';
                    }
                }
            }
        }

        winGame() {
            this.won = true;
            this.stopTimer();
            this.setFace('cool');
            // auto-flag every remaining mine, classic flourish
            for (let i = 0; i < this.rows; i++) {
                for (let j = 0; j < this.cols; j++) {
                    const cell = this.cells[i][j];
                    if (cell.mine && !cell.flagged) {
                        cell.flagged = true;
                        this.flags++;
                        this.btns[i][j].classList.add('flagged');
                        this.btns[i][j].textContent = '⚑';
                    }
                }
            }
            this.updateCounter();
        }

        /* ---- rendering ------------------------------------- */
        paintRevealed(r, c) {
            const b = this.btns[r][c];
            const adj = this.cells[r][c].adj;
            b.classList.add('open');
            b.classList.remove('flagged');
            if (adj > 0) { b.textContent = adj; b.classList.add('n' + adj); }
            else b.textContent = '';
        }

        setFace(name) { this.faceEl.textContent = FACES[name]; }
        updateCounter() { this.counterEl.textContent = pad3(this.mines - this.flags); }
        updateTimer() { this.timerEl.textContent = pad3(this.elapsed); }

        /* ---- timer ----------------------------------------- */
        startTimer() {
            this.stopTimer();
            this.timer = setInterval(() => {
                this.elapsed++;
                this.updateTimer();
                if (this.elapsed >= 999) this.stopTimer();
            }, 1000);
        }
        stopTimer() {
            if (this.timer) { clearInterval(this.timer); this.timer = null; }
        }

        /* ---- helpers --------------------------------------- */
        inBounds(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }

        destroy() {
            this.stopTimer();
            this.clearLongPress();
            document.removeEventListener('pointerup', this._onUp);
        }
    }

    function key(r, c) { return r + ',' + c; }

    window.MinesweeperGame = MinesweeperGame;
    window.MINES_LEVELS = LEVELS;
})();
