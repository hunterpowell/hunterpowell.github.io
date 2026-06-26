// paint.js — MS Paint clone for paint.exe, with optional multiplayer via WebSocket.
// Tools: pencil, eraser, line, rectangle, ellipse, flood fill.
// Mirrors the demo/sim class style used by tree.js / robots.js.

// Deployed Cloudflare Worker endpoint. Swap this after `wrangler deploy`.
const PAINT_WS_URL = 'https://hunterpowell-paint.hunterpowell99.workers.dev';

class PaintApp {
    constructor(root) {
        this.root = root;
        this.canvas = root.querySelector('.paint-canvas');
        this.viewport = root.querySelector('.paint-stage');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.tool = 'pencil';
        this.color = '#46343e';
        this.size = 4;
        // In solo mode, bg matches the site theme. In multiplayer it is fixed
        // to white so eraser strokes are consistent across all clients.
        this.bg = document.body.classList.contains('dark') ? '#15191e' : '#ffffff';

        this.drawing = false;
        this.startX = 0;
        this.startY = 0;
        this.lastP = null;        // end-point for shape tools (set in pointermove)
        this.currentPoints = [];  // accumulated points for pencil/eraser strokes

        this.W = this.canvas.width;
        this.H = this.canvas.height;
        this.img = this.ctx.createImageData(this.W, this.H);
        this.buf = new Uint32Array(this.img.data.buffer);
        this.base = null;

        // WebSocket — null until connect() succeeds
        this.ws = null;
        this._statusEl = root.querySelector('.paint-status-text');

        this.clear();
        this.wireTools();
        this.wireCanvas();
        this.setupScrollbars();
        this.connect();
    }

    /* ---- setup -------------------------------------------- */
    clear() {
        this.buf.fill(this.packColor(this.bg));
        this.blit();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'clear' }));
        }
    }

    blit() {
        this.ctx.putImageData(this.img, 0, 0);
    }

    filter(kind) {
        const W = this.W, H = this.H, px = this.buf;
        if (kind === 'invert') {
            const d = this.img.data;
            for (let i = 0; i < d.length; i += 4) {
                d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
            }
        } else if (kind === 'flip') {
            for (let y = 0; y < H; y++) {
                const row = y * W;
                for (let x = 0, n = W >> 1; x < n; x++) {
                    const l = row + x, r = row + W - 1 - x;
                    const t = px[l]; px[l] = px[r]; px[r] = t;
                }
            }
        }
        this.blit();
    }

    wireTools() {
        this.root.querySelectorAll('[data-tool]').forEach((b) => {
            b.addEventListener('click', () => {
                this.tool = b.dataset.tool;
                this.root.querySelectorAll('[data-tool]')
                    .forEach((x) => x.classList.toggle('active', x === b));
            });
        });

        const swatch = this.root.querySelector('.paint-current');
        this.root.querySelectorAll('[data-color]').forEach((s) => {
            s.style.background = s.dataset.color;
            s.addEventListener('click', () => {
                this.color = s.dataset.color;
                if (swatch) swatch.style.background = this.color;
                this.root.querySelectorAll('[data-color]')
                    .forEach((x) => x.classList.toggle('active', x === s));
            });
        });
        if (swatch) swatch.style.background = this.color;

        const picker = this.root.querySelector('.paint-picker');
        if (picker) {
            picker.value = this.color;
            picker.addEventListener('input', () => {
                this.color = picker.value;
                if (swatch) swatch.style.background = this.color;
                this.root.querySelectorAll('[data-color]')
                    .forEach((x) => x.classList.remove('active'));
            });
        }

        const sizeInput = this.root.querySelector('.paint-size');
        const sizeLabel = this.root.querySelector('[data-size-label]');
        if (sizeInput) {
            sizeInput.value = this.size;
            if (sizeLabel) sizeLabel.textContent = this.size + 'px';
            sizeInput.addEventListener('input', () => {
                this.size = parseInt(sizeInput.value, 10);
                if (sizeLabel) sizeLabel.textContent = this.size + 'px';
            });
        }
    }

    save() {
        const a = document.createElement('a');
        a.download = 'untitled.png';
        a.href = this.canvas.toDataURL('image/png');
        a.click();
    }

    /* ---- working scrollbars ------------------------------- */
    setupScrollbars() {
        const vp = this.viewport;
        if (!vp || typeof window.winScroll === 'undefined') return;
        this.scrollY = window.winScroll(vp, { axis: 'y', bar: this.root.querySelector('.paint-scroll--y') });
        this.scrollX = window.winScroll(vp, { axis: 'x', bar: this.root.querySelector('.paint-scroll--x') });
    }

    destroy() {
        if (this.scrollY) this.scrollY.destroy();
        if (this.scrollX) this.scrollX.destroy();
        if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    }

    /* ---- multiplayer -------------------------------------- */
    connect() {
        let ws;
        try {
            ws = new WebSocket(PAINT_WS_URL);
        } catch (_) {
            return; // Non-fatal: stay in local-only mode
        }

        ws.addEventListener('open', () => {
            this.ws = ws;
        });

        ws.addEventListener('message', (evt) => {
            let msg;
            try { msg = JSON.parse(evt.data); } catch (_) { return; }

            if (msg.type === 'init') {
                // Fix bg to white for the shared session before replaying history.
                this.bg = '#ffffff';
                this.buf.fill(this.packColor(this.bg));
                for (const stroke of msg.strokes) this.replayStroke(stroke);
                this.blit();
                this._setStatus(1); // updated below when 'users' arrives
            } else if (msg.type === 'stroke') {
                this.replayStroke(msg.stroke);
            } else if (msg.type === 'clear') {
                this.buf.fill(this.packColor(this.bg));
                this.blit();
            } else if (msg.type === 'users') {
                this._setStatus(msg.count);
            }
        });

        ws.addEventListener('close', () => {
            this.ws = null;
            this._setStatus(0);
        });

        ws.addEventListener('error', () => {
            // Error fires before close; let close handler clean up.
        });
    }

    _setStatus(count) {
        if (!this._statusEl) return;
        const bar = this._statusEl.closest('.paint-status');
        if (count === 0) {
            this._statusEl.textContent = 'not connected';
            if (bar) bar.classList.remove('connected');
            return;
        }
        if (bar) bar.classList.add('connected');
        const label = count === 1 ? 'user' : 'users';
        this._statusEl.textContent = `${count} ${label} connected  —  canvas clears when all disconnect`;
    }

    // Emit a completed stroke to the room.
    _emitStroke(stroke) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: 'stroke', stroke }));
    }

    // Replay a stroke received from another client (or from init history).
    replayStroke(stroke) {
        const saved = { tool: this.tool, color: this.color, size: this.size, bg: this.bg };

        this.size = stroke.size;
        this.color = stroke.color;

        if (stroke.tool === 'fill') {
            this.floodFill(stroke.x, stroke.y, stroke.color);
        } else if (stroke.tool === 'pencil' || stroke.tool === 'eraser') {
            this.tool = stroke.tool;
            if (stroke.tool === 'eraser') this.bg = stroke.color;
            const pts = stroke.points;
            if (pts.length === 1) {
                this.stroke(pts[0][0], pts[0][1], pts[0][0], pts[0][1]);
            } else {
                for (let i = 1; i < pts.length; i++) {
                    this.stroke(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
                }
            }
        } else if (stroke.tool === 'line' || stroke.tool === 'rect' || stroke.tool === 'ellipse') {
            this.tool = stroke.tool;
            this.shape(stroke.x0, stroke.y0, stroke.x1, stroke.y1);
        }

        this.tool = saved.tool;
        this.color = saved.color;
        this.size = saved.size;
        this.bg = saved.bg;
    }

    /* ---- pointer → canvas coords -------------------------- */
    pos(e) {
        const r = this.canvas.getBoundingClientRect();
        return {
            x: Math.round((e.clientX - r.left) * (this.canvas.width / r.width)),
            y: Math.round((e.clientY - r.top) * (this.canvas.height / r.height)),
        };
    }

    wireCanvas() {
        const c = this.canvas;

        c.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const p = this.pos(e);
            this.startX = p.x;
            this.startY = p.y;

            if (this.tool === 'fill') {
                this.floodFill(p.x, p.y, this.color);
                this._emitStroke({ tool: 'fill', color: this.color, size: this.size, x: p.x, y: p.y });
                return;
            }

            this.drawing = true;
            this.lastP = null;
            this.currentPoints = [[p.x, p.y]];
            c.setPointerCapture(e.pointerId);
            this.base = this.buf.slice();

            if (this.tool === 'pencil' || this.tool === 'eraser') {
                this.stroke(p.x, p.y, p.x, p.y);
            }
        });

        c.addEventListener('pointermove', (e) => {
            if (!this.drawing) return;
            const p = this.pos(e);

            if (this.tool === 'pencil' || this.tool === 'eraser') {
                this.stroke(this.startX, this.startY, p.x, p.y);
                this.startX = p.x;
                this.startY = p.y;
                this.currentPoints.push([p.x, p.y]);
            } else {
                this.lastP = p;
                this.buf.set(this.base);
                this.shape(this.startX, this.startY, p.x, p.y);
            }
        });

        const end = (e) => {
            if (!this.drawing) return;
            this.drawing = false;
            try { c.releasePointerCapture(e.pointerId); } catch (_) {}

            if (this.tool === 'pencil' || this.tool === 'eraser') {
                this._emitStroke({
                    tool: this.tool,
                    // For eraser, send the actual bg color so remote clients
                    // erase to the same background regardless of their theme.
                    color: this.tool === 'eraser' ? this.bg : this.color,
                    size: this.size,
                    points: this.currentPoints,
                });
            } else if (this.lastP) {
                this._emitStroke({
                    tool: this.tool,
                    color: this.color,
                    size: this.size,
                    x0: this.startX,
                    y0: this.startY,
                    x1: this.lastP.x,
                    y1: this.lastP.y,
                });
            }
        };
        c.addEventListener('pointerup', end);
        c.addEventListener('pointercancel', end);
    }

    /* ---- drawing primitives ------------------------------- */
    stroke(x0, y0, x1, y1) {
        const color = this.packColor(this.tool === 'eraser' ? this.bg : this.color);
        this.line(x0, y0, x1, y1, color);
        this.blit();
    }

    shape(x0, y0, x1, y1) {
        const color = this.packColor(this.color);
        if (this.tool === 'line') {
            this.line(x0, y0, x1, y1, color);
        } else if (this.tool === 'rect') {
            const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
            const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
            this.line(xa, ya, xb, ya, color);
            this.line(xa, yb, xb, yb, color);
            this.line(xa, ya, xa, yb, color);
            this.line(xb, ya, xb, yb, color);
        } else if (this.tool === 'ellipse') {
            this.ellipseOutline(x0, y0, x1, y1, color);
        }
        this.blit();
    }

    set(x, y, color) {
        if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
        this.buf[y * this.W + x] = color;
    }

    brush(cx, cy, color) {
        const r = this.size / 2;
        if (r <= 0.5) { this.set(cx, cy, color); return; }
        const rad = Math.floor(r), r2 = r * r;
        for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
                if (dx * dx + dy * dy <= r2) this.set(cx + dx, cy + dy, color);
            }
        }
    }

    line(x0, y0, x1, y1, color) {
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        for (;;) {
            this.brush(x0, y0, color);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    ellipseOutline(x0, y0, x1, y1, color) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const a = Math.abs(x1 - x0) / 2, b = Math.abs(y1 - y0) / 2;
        if (a < 0.5 || b < 0.5) { this.line(x0, y0, x1, y1, color); return; }
        const a2 = a * a, b2 = b * b;
        let x = 0, y = b, dx = 0, dy = 2 * a2 * b;
        const plot = () => {
            this.brush(Math.round(cx + x), Math.round(cy + y), color);
            this.brush(Math.round(cx - x), Math.round(cy + y), color);
            this.brush(Math.round(cx + x), Math.round(cy - y), color);
            this.brush(Math.round(cx - x), Math.round(cy - y), color);
        };
        let d1 = b2 - a2 * b + 0.25 * a2;
        while (dx < dy) {
            plot();
            x++; dx += 2 * b2;
            if (d1 < 0) { d1 += dx + b2; }
            else { y--; dy -= 2 * a2; d1 += dx - dy + b2; }
        }
        let d2 = b2 * (x + 0.5) * (x + 0.5) + a2 * (y - 1) * (y - 1) - a2 * b2;
        while (y >= 0) {
            plot();
            y--; dy -= 2 * a2;
            if (d2 > 0) { d2 += a2 - dy; }
            else { x++; dx += 2 * b2; d2 += dx - dy + a2; }
        }
    }

    /* ---- flood fill --------------------------------------- */
    floodFill(x, y, hex) {
        const W = this.W, H = this.H;
        if (x < 0 || y < 0 || x >= W || y >= H) return;

        const px = this.buf;
        const start = y * W + x;
        const target = px[start];
        const fill = this.packColor(hex);
        if (target === fill) return;

        const stack = [start];
        while (stack.length) {
            const i = stack.pop();
            if (px[i] !== target) continue;
            px[i] = fill;
            const col = i % W;
            if (col > 0) stack.push(i - 1);
            if (col < W - 1) stack.push(i + 1);
            if (i - W >= 0) stack.push(i - W);
            if (i + W < W * H) stack.push(i + W);
        }
        this.blit();
    }

    packColor(hex) {
        const n = parseInt(hex.slice(1), 16);
        const probe = new Uint8Array(4);
        probe[0] = (n >> 16) & 255;
        probe[1] = (n >> 8) & 255;
        probe[2] = n & 255;
        probe[3] = 255;
        return new Uint32Array(probe.buffer)[0];
    }
}
