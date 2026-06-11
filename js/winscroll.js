// winscroll.js — one reusable Win9x scrollbar.
// Drives a natively-scrolling element through a custom beveled bar built
// from the .ps-btn / .ps-track / .ps-thumb parts. Two entry points:
//   winScroll(viewport, { axis, bar })  — wire an *existing* bar (paint / defrag markup)
//   autoWinScroll(viewport, axis)       — build a bar, wrap the viewport, hide its native bar
// Returns a controller { update(), destroy() }.
(function (global) {
    const STEP = 40;   // px per arrow click

    // Per-axis property map so one body of logic covers vertical + horizontal.
    const AX = {
        y: { size: 'clientHeight', scrollSize: 'scrollHeight', scrollPos: 'scrollTop',
             tSize: 'height', tPos: 'top', edge: 'top', client: 'clientY',
             ext: 'offsetHeight', by: (d) => ({ top: d }) },
        x: { size: 'clientWidth', scrollSize: 'scrollWidth', scrollPos: 'scrollLeft',
             tSize: 'width', tPos: 'left', edge: 'left', client: 'clientX',
             ext: 'offsetWidth', by: (d) => ({ left: d }) },
    };

    function buildBar(axis) {
        const bar = document.createElement('div');
        bar.className = 'wb-bar wb-bar--' + axis;
        bar.setAttribute('aria-hidden', 'true');
        const dec = document.createElement('span'); dec.className = 'ps-btn';
        const inc = document.createElement('span'); inc.className = 'ps-btn';
        dec.textContent = axis === 'y' ? '▲' : '◀';
        inc.textContent = axis === 'y' ? '▼' : '▶';
        const track = document.createElement('span'); track.className = 'ps-track';
        const thumb = document.createElement('span'); thumb.className = 'ps-thumb';
        track.appendChild(thumb);
        bar.append(dec, track, inc);
        return bar;
    }

    function winScroll(vp, opts) {
        opts = opts || {};
        const axis = opts.axis === 'x' ? 'x' : 'y';
        const a = AX[axis];
        const bar = opts.bar;
        if (!vp || !bar) return { update() {}, destroy() {} };

        const track = bar.querySelector('.ps-track');
        const thumb = bar.querySelector('.ps-thumb');
        const btns = bar.querySelectorAll('.ps-btn');   // [decrement, increment]
        if (!track || !thumb) return { update() {}, destroy() {} };

        let raf = 0;
        const update = () => {
            raf = 0;
            const view = vp[a.size], content = vp[a.scrollSize], tlen = track[a.size];
            if (content <= view) {
                thumb.style[a.tSize] = '100%';
                thumb.style[a.tPos] = '0';
            } else {
                const len = Math.max(16, tlen * view / content);
                thumb.style[a.tSize] = len + 'px';
                thumb.style[a.tPos] = (vp[a.scrollPos] / (content - view)) * (tlen - len) + 'px';
            }
        };
        const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

        vp.addEventListener('scroll', update, { passive: true });
        const ro = global.ResizeObserver ? new ResizeObserver(schedule) : null;
        if (ro) ro.observe(vp);
        const mo = global.MutationObserver ? new MutationObserver(schedule) : null;
        if (mo) mo.observe(vp, { childList: true, subtree: true, characterData: true });

        const dec = () => vp.scrollBy(a.by(-STEP));
        const inc = () => vp.scrollBy(a.by(STEP));
        if (btns[0]) btns[0].addEventListener('click', dec);
        if (btns[1]) btns[1].addEventListener('click', inc);

        // click the empty track = page toward the pointer
        const onTrack = (e) => {
            if (e.target === thumb) return;
            const before = e[a.client] < thumb.getBoundingClientRect()[a.edge];
            vp.scrollBy(a.by((before ? -1 : 1) * vp[a.size]));
        };
        track.addEventListener('pointerdown', onTrack);

        // drag the thumb
        let active = false, start = 0, startScroll = 0;
        const onDown = (e) => {
            e.preventDefault();
            e.stopPropagation();   // don't trigger track paging
            active = true;
            start = e[a.client];
            startScroll = vp[a.scrollPos];
            thumb.setPointerCapture(e.pointerId);
        };
        const onMove = (e) => {
            if (!active) return;
            const room = track[a.size] - thumb[a.ext];
            const scroll = vp[a.scrollSize] - vp[a.size];
            vp[a.scrollPos] = startScroll + (e[a.client] - start) / (room || 1) * scroll;
        };
        const onUp = (e) => {
            if (!active) return;
            active = false;
            try { thumb.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        thumb.addEventListener('pointerdown', onDown);
        thumb.addEventListener('pointermove', onMove);
        thumb.addEventListener('pointerup', onUp);
        thumb.addEventListener('pointercancel', onUp);

        requestAnimationFrame(update);   // size the thumb once laid out

        return {
            update,
            destroy() {
                if (raf) cancelAnimationFrame(raf);
                vp.removeEventListener('scroll', update);
                if (ro) ro.disconnect();
                if (mo) mo.disconnect();
            },
        };
    }

    // Wrap a scroll element in a flex frame beside a freshly-built bar, hide
    // its native scrollbar, and wire it up. The element keeps its identity
    // (children untouched), so existing references stay valid.
    function autoWinScroll(vp, axis) {
        axis = axis === 'x' ? 'x' : 'y';
        if (!vp || !vp.parentNode) return { update() {}, destroy() {} };
        const frame = document.createElement('div');
        frame.className = 'wb-frame';
        vp.parentNode.insertBefore(frame, vp);
        frame.appendChild(vp);
        const bar = buildBar(axis);
        frame.appendChild(bar);
        vp.classList.add('wb-clipped');
        return winScroll(vp, { axis, bar });
    }

    // Two-axis sibling of autoWinScroll: wraps the viewport in a 2×2 grid
    // (content | y-bar / x-bar | corner) so both bars ride the element's
    // edges. Used by windows whose content can outgrow them on either axis
    // (minesweeper's wide boards), where a single bottom bar should just
    // sit there by default and come alive when the content overflows.
    function autoWinScrollXY(vp) {
        if (!vp || !vp.parentNode) return { update() {}, destroy() {} };
        const frame = document.createElement('div');
        frame.className = 'wb-frame-xy';
        vp.parentNode.insertBefore(frame, vp);
        frame.appendChild(vp);
        const ybar = buildBar('y');
        const xbar = buildBar('x');
        const corner = document.createElement('div');
        corner.className = 'wb-corner';
        corner.setAttribute('aria-hidden', 'true');
        frame.append(ybar, xbar, corner);
        vp.classList.add('wb-clipped');
        const sy = winScroll(vp, { axis: 'y', bar: ybar });
        const sx = winScroll(vp, { axis: 'x', bar: xbar });
        return {
            update() { sy.update(); sx.update(); },
            destroy() { sy.destroy(); sx.destroy(); },
        };
    }

    global.winScroll = winScroll;
    global.autoWinScroll = autoWinScroll;
    global.autoWinScrollXY = autoWinScrollXY;
})(window);
