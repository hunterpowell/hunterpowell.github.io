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
        this.bg = '#ffffff';

        this.drawing = false;
        this.startX = 0;
        this.startY = 0;
        this.snapshot = null;     // canvas state for live shape previews

        this.clear();
        this.wireTools();
        this.wireCanvas();
        this.setupScrollbars();
    }

    /* ---- setup -------------------------------------------- */
    clear() {
        this.ctx.fillStyle = this.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
            this.snapshot = this.ctx.getImageData(0, 0, c.width, c.height);

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
                // live shape preview: restore, then draw current shape
                this.ctx.putImageData(this.snapshot, 0, 0);
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
    stroke(x0, y0, x1, y1) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.tool === 'eraser' ? this.bg : this.color;
        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    }

    shape(x0, y0, x1, y1) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        if (this.tool === 'line') {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
        } else if (this.tool === 'rect') {
            ctx.rect(Math.min(x0, x1), Math.min(y0, y1),
                Math.abs(x1 - x0), Math.abs(y1 - y0));
        } else if (this.tool === 'ellipse') {
            ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2,
                Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
        }
        ctx.stroke();
    }

    /* ---- flood fill (4-connected, typed-array fast path) -- */
    floodFill(x, y, hex) {
        const W = this.canvas.width, H = this.canvas.height;
        if (x < 0 || y < 0 || x >= W || y >= H) return;

        const img = this.ctx.getImageData(0, 0, W, H);
        const px = new Uint32Array(img.data.buffer);   // one int per pixel
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
        this.ctx.putImageData(img, 0, 0);
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
