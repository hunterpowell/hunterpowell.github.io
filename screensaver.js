/* ============================================================
   screensaver.js — idle "DVD logo" bouncing screensaver
   - activates after `idleMs` of no input; any input dismisses it
   - the logo is an inline SVG coloured via CSS `color`
     (its path uses fill="currentColor"), so a single shape can
     be any colour — it switches to the next palette colour on
     every wall bounce, just like the real thing
   - enable/disable and idle time are user prefs, persisted to
     localStorage and edited via Display Properties (desktop.js);
     exposed through window.Screensaver
   - skipped while booting, while the tab is hidden, and under
     prefers-reduced-motion
   ============================================================ */
(function () {
    'use strict';

    // A bouncing logo is exactly what this setting opts out of, so we never
    // run under it — but we still expose the API (reporting `reducedMotion`)
    // so Display Properties can explain why the controls are off.
    const reduce = !!(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const SPEED = 1;         // px per frame (~60px/s @ 60fps)
    const GRACE = 250;       // ignore stray mousemove right after activating (ms)
    const STORE = 'hp-screensaver-v1';   // persisted prefs (Display Properties)

    const COLORS = [
        '#DCA4AC', '#A8BBA2', '#8FA3B5',
        '#B6A6BC', '#EAD9D9', '#9F6278',
    ];

    // User prefs, restored from localStorage and editable via Display Properties.
    let enabled = true;
    let idleMs = 60000;      // time of no activity before the screensaver starts
    (function loadPrefs() {
        try {
            const s = JSON.parse(localStorage.getItem(STORE) || 'null');
            if (s) {
                if (typeof s.enabled === 'boolean') enabled = s.enabled;
                if (typeof s.idleMs === 'number' && s.idleMs >= 1000) idleMs = s.idleMs;
            }
        } catch (_) {}
    })();
    function savePrefs() {
        try { localStorage.setItem(STORE, JSON.stringify({ enabled, idleMs })); } catch (_) {}
    }

    // The visible DVD-logo path from images/DVD_logo.svg, inlined so it needs
    // no fetch and recolours via `currentColor`.
    const LOGO_SVG =
        '<svg viewBox="0 0 1058.4 465.84" xmlns="http://www.w3.org/2000/svg" ' +
        'fill="currentColor" aria-hidden="true"><path d="m91.053 0-13.719 ' +
        '57.707 102.28 0.039063h24c65.747 0 105.91 26.44 94.746 73.4-12.147 ' +
        '51.133-69.613 73.4-130.67 73.4h-22.947l29.787-125.45h-102.27l-43.521 ' +
        '183.2h145.05c109.07 0 212.76-57.573 231.01-131.15 3.3467-13.507 ' +
        '2.8806-47.253-5.3594-67.359-0.21299-0.787-0.42594-1.4-1.1855-3-0.293-' +
        '0.653-0.56012-3.6412 1.1465-4.2812 0.947-0.36 2.7069 1.4944 2.9336 ' +
        '2.041 0.853 2.24 1.5059 3.9062 1.5059 3.9062l92.293 260.6 234.97-' +
        '265.21 99.535-0.089844h24c65.76 0 106.25 26.44 95.092 73.4-12.147 ' +
        '51.133-69.947 73.4-131 73.4h-22.959l29.799-125.47h-102.27l-43.533 ' +
        '183.21h145.07c109.05 0 213.48-57.4 231-131.15 17.52-73.75-59.107-' +
        '131.15-168.69-131.15h-216.4s-57.319 67.88-67.959 80.693c-57.12 ' +
        '68.787-67.241 87.226-68.961 91.986 0.24-4.8-1.8138-23.412-26.174-' +
        '92.959-6.48-18.52-27.359-79.721-27.359-79.721h-389.25zm408.77 ' +
        '324.16c-276.04 0-499.83 31.72-499.83 70.84s223.79 70.84 499.83 ' +
        '70.84c276.04 0 499.83-31.72 499.83-70.84s-223.79-70.84-499.83-' +
        '70.84zm-18.094 48.627c63.04 0 114.13 10.573 114.13 23.613s-51.095 ' +
        '23.613-114.13 23.613c-63.027 0-114.13-10.573-114.13-23.613s51.106-' +
        '23.613 114.13-23.613z"/></svg>';

    let overlay = null, logo = null;          // DOM (built lazily)
    let active = false, activatedAt = 0;
    let idleTimer = null, rafId = 0;
    let x = 0, y = 0, vx = SPEED, vy = SPEED, colorIdx = 0, oldIdx = 0;

    function build() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.className = 'screensaver';
        logo = document.createElement('div');
        logo.className = 'screensaver-logo';
        logo.innerHTML = LOGO_SVG;
        overlay.appendChild(logo);
        document.body.appendChild(overlay);
    }

    function changeColor() {
        oldIdx = colorIdx;
        while (colorIdx == oldIdx) {
            colorIdx = Math.floor(Math.random() * COLORS.length);
        }
        logo.style.color = COLORS[colorIdx];
    }

    function loop() {
        if (!active) return;
        const maxX = Math.max(0, window.innerWidth - logo.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - logo.offsetHeight);

        x += vx;
        y += vy;

        let bounced = false;
        if (x <= 0)         { x = 0;    vx = Math.abs(vx);  bounced = true; }
        else if (x >= maxX) { x = maxX; vx = -Math.abs(vx); bounced = true; }
        if (y <= 0)         { y = 0;    vy = Math.abs(vy);  bounced = true; }
        else if (y >= maxY) { y = maxY; vy = -Math.abs(vy); bounced = true; }
        // if (bounced) setColor(colorIdx + 1);
        if (bounced) changeColor()

        logo.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        rafId = requestAnimationFrame(loop);
    }

    function activate() {
        if (active || document.hidden || !enabled || reduce) return;
        if (document.getElementById('boot')) { scheduleIdle(); return; }  // still booting
        build();

        const maxX = Math.max(0, window.innerWidth - logo.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - logo.offsetHeight);
        x = Math.random() * maxX;
        y = Math.random() * maxY;
        vx = SPEED * (Math.random() < 0.5 ? 1 : -1);
        vy = SPEED * (Math.random() < 0.5 ? 1 : -1);
        changeColor();

        active = true;
        activatedAt = performance.now();
        overlay.classList.add('on');
        rafId = requestAnimationFrame(loop);
    }

    function deactivate() {
        if (!active) return;
        active = false;
        overlay.classList.remove('on');
        cancelAnimationFrame(rafId);
        scheduleIdle();
    }

    function scheduleIdle() {
        clearTimeout(idleTimer);
        if (!enabled || reduce) return;             // disabled → never arm the timer
        idleTimer = setTimeout(activate, idleMs);
    }

    // One handler for every input event: bumps the idle timer when resting,
    // dismisses the screensaver (swallowing the event) when it's showing.
    function onActivity(e) {
        if (!active) { scheduleIdle(); return; }
        // ignore the spurious mousemove some browsers fire as the overlay appears
        if (e.type === 'mousemove' && performance.now() - activatedAt < GRACE) return;
        deactivate();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();   // don't let the waking click reach a window/icon
    }

    if (!reduce) {
        ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'wheel', 'touchstart']
            .forEach((type) => document.addEventListener(type, onActivity, { capture: true, passive: false }));

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) deactivate(); else scheduleIdle();
        });

        scheduleIdle();
    }

    // Public API for the Display Properties window (desktop.js).
    window.Screensaver = {
        reducedMotion: reduce,
        isEnabled: () => enabled,
        getIdleMs: () => idleMs,
        getLogoSVG: () => LOGO_SVG,
        setEnabled(on) {
            enabled = !!on;
            savePrefs();
            if (enabled) scheduleIdle();
            else { deactivate(); clearTimeout(idleTimer); }
        },
        setIdleMs(ms) {
            ms = Math.max(1000, ms | 0);
            idleMs = ms;
            savePrefs();
            scheduleIdle();
        },
    };
})();
