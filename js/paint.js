// paint.js — a cute, barebones MS Paint clone for paint.exe
// Tools: pencil, eraser, line, rectangle, ellipse, flood fill.
// Mirrors the demo/sim class style used by tree.js / robots.js.

class PaintApp {
    constructor(root) {
        this.root = root;
        this.canvas = root.querySelector('.paint-canvas');
        this.viewport = root.querySelector('.paint-stage');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.tool = 'pencil';
        this.color = '#46343e';   // dark plum to match the site ink
        this.size = 4;
        // Canvas background: dark in dark mode, white otherwise. Sampled once
        // per open and frozen — a mid-session theme toggle must NOT recolor
        // it, since the pixels already drawn keep the old background; eraser
        // and clear stay consistent with the canvas, and reopening resamples.
        this.bg = document.body.classList.contains('dark') ? '#2a2f34' : '#ffffff';

        this.drawing = false;
        this.startX = 0;
        this.startY = 0;

        // Persistent pixel buffer is the source of truth: every tool plots
        // into it and we blit to the canvas. Keeps all rendering aliased
        // (no antialiased fringe) so the flood fill reaches clean edges.
        this.W = this.canvas.width;
        this.H = this.canvas.height;
        this.img = this.ctx.createImageData(this.W, this.H);
        this.buf = new Uint32Array(this.img.data.buffer);
        this.base = null;         // buffer copy for live shape previews

        this.clear();
        this.wireTools();
        this.wireCanvas();
        this.setupScrollbars();
    }

    /* ---- setup -------------------------------------------- */
    clear() {
        this.buf.fill(this.packColor(this.bg));
        this.blit();
    }

    // push the pixel buffer to the visible canvas
    blit() {
        this.ctx.putImageData(this.img, 0, 0);
    }

    // menu-driven bitmap ops — applied to the buffer so they persist
    // through subsequent strokes/fills (which blit the buffer back out).
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
        // tool buttons
        this.root.querySelectorAll('[data-tool]').forEach((b) => {
            b.addEventListener('click', () => {
                this.tool = b.dataset.tool;
                this.root.querySelectorAll('[data-tool]')
                    .forEach((x) => x.classList.toggle('active', x === b));
            });
        });

        // colour swatches
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

        // custom colour picker
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

        // brush size
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

    // Clear / save now live in the window's File & Image menus (see
    // desktop.js), so there are no dedicated buttons to wire here.
    save() {
        const a = document.createElement('a');
        a.download = 'untitled.png';
        a.href = this.canvas.toDataURL('image/png');
        a.click();
    }

    /* ---- working scrollbars ------------------------------- */
    // The canvas is a fixed size; the stage is a smaller viewport.
    // Both axes are driven by the shared Win9x scrollbar module.
    setupScrollbars() {
        const vp = this.viewport;
        if (!vp || typeof window.winScroll === 'undefined') return;
        this.scrollY = window.winScroll(vp, { axis: 'y', bar: this.root.querySelector('.paint-scroll--y') });
        this.scrollX = window.winScroll(vp, { axis: 'x', bar: this.root.querySelector('.paint-scroll--x') });
    }

    destroy() {
        if (this.scrollY) this.scrollY.destroy();
        if (this.scrollX) this.scrollX.destroy();
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
                return;
            }

            this.drawing = true;
            c.setPointerCapture(e.pointerId);
            this.base = this.buf.slice();   // frozen base for shape previews

            if (this.tool === 'pencil' || this.tool === 'eraser') {
                // a single click should leave a dot
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
            } else {
                // live shape preview: restore the frozen base, redraw shape
                this.buf.set(this.base);
                this.shape(this.startX, this.startY, p.x, p.y);
            }
        });

        const end = (e) => {
            if (!this.drawing) return;
            this.drawing = false;
            try { c.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        c.addEventListener('pointerup', end);
        c.addEventListener('pointercancel', end);
    }

    /* ---- drawing primitives ------------------------------- */
    // Everything plots straight into the pixel buffer with NO antialiasing,
    // the way MS Paint does. A stroke is a Bresenham line with a round brush
    // stamped at each step; the eraser is the same thing painted in bg.
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
            this.line(xa, ya, xb, ya, color);   // top
            this.line(xa, yb, xb, yb, color);   // bottom
            this.line(xa, ya, xa, yb, color);   // left
            this.line(xb, ya, xb, yb, color);   // right
        } else if (this.tool === 'ellipse') {
            this.ellipseOutline(x0, y0, x1, y1, color);
        }
        this.blit();
    }

    // ---- pixel-level helpers ------------------------------
    // set one pixel (bounds-checked)
    set(x, y, color) {
        if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
        this.buf[y * this.W + x] = color;
    }

    // round brush: a filled disc of diameter `size` centred on (cx, cy)
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

    // Bresenham line, stamping the brush at every step
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

    // Midpoint-ellipse outline within the bounding box, brush-stamped
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
        // region 1: slope > -1
        let d1 = b2 - a2 * b + 0.25 * a2;
        while (dx < dy) {
            plot();
            x++; dx += 2 * b2;
            if (d1 < 0) { d1 += dx + b2; }
            else { y--; dy -= 2 * a2; d1 += dx - dy + b2; }
        }
        // region 2: slope < -1
        let d2 = b2 * (x + 0.5) * (x + 0.5) + a2 * (y - 1) * (y - 1) - a2 * b2;
        while (y >= 0) {
            plot();
            y--; dy -= 2 * a2;
            if (d2 > 0) { d2 += a2 - dy; }
            else { x++; dx += 2 * b2; d2 += dx - dy + a2; }
        }
    }

    /* ---- flood fill (4-connected, typed-array fast path) -- */
    // Operates directly on the live buffer. Exact-match is correct now that
    // every edge is hard — there are no antialiased fringe pixels to leak past.
    floodFill(x, y, hex) {
        const W = this.W, H = this.H;
        if (x < 0 || y < 0 || x >= W || y >= H) return;

        const px = this.buf;
        const start = y * W + x;
        const target = px[start];
        const fill = this.packColor(hex);
        if (target === fill) return;

        const stack = [start];   // flat numeric stack of pixel indices
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

    // pack #rrggbb into a 32-bit pixel in the platform's byte order
    packColor(hex) {
        const n = parseInt(hex.slice(1), 16);
        const probe = new Uint8Array(4);
        probe[0] = (n >> 16) & 255;  // r
        probe[1] = (n >> 8) & 255;   // g
        probe[2] = n & 255;          // b
        probe[3] = 255;              // a
        return new Uint32Array(probe.buffer)[0];
    }
}
