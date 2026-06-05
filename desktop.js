/* ============================================================
   desktop.js — minimal Win9x-style window manager
   - double-click a desktop icon (or click its taskbar/data-open
     button) to open a window from its <template>
   - windows are draggable by the title bar, focusable, minimisable
     and closeable; each open window gets a taskbar button
   ============================================================ */
(function () {
    'use strict';

    const desktop = document.getElementById('desktop');
    const taskItems = document.getElementById('task-items');

    let zCounter = 10;            // running z-index for focus order
    let cascade = 0;             // offset so new windows don't stack exactly
    const open = new Map();       // id -> { win, taskBtn }

    /* ---- open / focus ------------------------------------- */
    function openWindow(id) {
        if (open.has(id)) { focus(id); restore(id); return; }

        const tpl = document.getElementById('tpl-' + id);
        if (!tpl) return;

        const win = tpl.content.firstElementChild.cloneNode(true);
        win.dataset.id = id;

        // position: centred-ish with a cascading offset
        const w = win.offsetWidth || parseInt(win.style.width, 10) || 440;
        const baseX = Math.max(20, (desktop.clientWidth - w) / 2 - 40);
        const x = baseX + cascade;
        const y = 40 + cascade;
        win.style.left = x + 'px';
        win.style.top = y + 'px';
        cascade = (cascade + 28) % 140;

        desktop.appendChild(win);
        wireWindow(win, id);

        const taskBtn = makeTaskButton(win, id);
        const cleanup = initDemo(win);   // null for non-demo windows
        open.set(id, { win, taskBtn, cleanup });

        focus(id);
    }

    /* ---- chrome wiring ------------------------------------ */
    function wireWindow(win, id) {
        const bar = win.querySelector('.title-bar');
        const controls = win.querySelector('.title-controls');

        win.addEventListener('pointerdown', () => focus(id), true);

        // buttons (close / minimise / maximise) by aria-label
        controls.querySelectorAll('button').forEach((b) => {
            const kind = b.getAttribute('aria-label');
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                if (kind === 'close') closeWindow(id);
                else if (kind === 'minimize') minimize(id);
                else if (kind === 'maximize') toggleMax(win);
            });
        });

        // links inside a window that open other windows
        win.querySelectorAll('[data-open]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                openWindow(el.dataset.open);
            });
        });

        makeDraggable(win, bar, controls);

        // resize grip
        const grip = document.createElement('div');
        grip.className = 'resize-handle';
        win.appendChild(grip);
        makeResizable(win, grip);
    }

    /* ---- resizing ----------------------------------------- */
    function makeResizable(win, grip) {
        let startX, startY, startW, startH, active = false;

        grip.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (win.classList.contains('maxed')) return;
            active = true;
            focus(win.dataset.id);
            startX = e.clientX; startY = e.clientY;
            startW = win.offsetWidth; startH = win.offsetHeight;
            win.style.maxHeight = 'none';   // free the window from the 88vh cap
            grip.setPointerCapture(e.pointerId);
        });

        grip.addEventListener('pointermove', (e) => {
            if (!active) return;
            const w = startW + (e.clientX - startX);
            const h = startH + (e.clientY - startY);
            win.style.width = Math.max(240, w) + 'px';
            win.style.height = Math.max(120, h) + 'px';
        });

        const end = (e) => {
            if (!active) return;
            active = false;
            try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        grip.addEventListener('pointerup', end);
        grip.addEventListener('pointercancel', end);
    }

    /* ---- dragging ----------------------------------------- */
    function makeDraggable(win, handle, controls) {
        let startX, startY, originX, originY, active = false;

        handle.addEventListener('pointerdown', (e) => {
            if (controls.contains(e.target)) return;   // not on the buttons
            if (win.classList.contains('maxed')) return;
            active = true;
            win.classList.add('dragging');
            startX = e.clientX; startY = e.clientY;
            originX = win.offsetLeft; originY = win.offsetTop;
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', (e) => {
            if (!active) return;
            const nx = originX + (e.clientX - startX);
            const ny = originY + (e.clientY - startY);
            const maxX = desktop.clientWidth - 60;
            const maxY = desktop.clientHeight - 30;
            win.style.left = Math.min(Math.max(-win.offsetWidth + 80, nx), maxX) + 'px';
            win.style.top = Math.min(Math.max(0, ny), maxY) + 'px';
        });

        const end = (e) => {
            if (!active) return;
            active = false;
            win.classList.remove('dragging');
            try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    /* ---- focus / minimise / maximise / close -------------- */
    function focus(id) {
        const entry = open.get(id);
        if (!entry) return;
        entry.win.style.zIndex = ++zCounter;
        for (const [oid, o] of open) {
            o.win.classList.toggle('active', oid === id);
            o.taskBtn.classList.toggle('active', oid === id);
        }
    }

    function minimize(id) {
        const { win, taskBtn } = open.get(id) || {};
        if (!win) return;
        win.style.display = 'none';
        win.classList.remove('active');
        taskBtn.classList.remove('active');
    }

    function restore(id) {
        const { win } = open.get(id) || {};
        if (win) win.style.display = '';
    }

    function toggleMax(win) {
        if (win.classList.contains('maxed')) {
            win.classList.remove('maxed');
            win.style.left = win.dataset.px; win.style.top = win.dataset.py;
            win.style.width = win.dataset.pw || '';
            win.style.height = '';
        } else {
            win.dataset.px = win.style.left; win.dataset.py = win.style.top;
            win.dataset.pw = win.style.width;
            win.classList.add('maxed');
            win.style.left = '8px'; win.style.top = '8px';
            win.style.width = (desktop.clientWidth - 16) + 'px';
            win.style.height = (desktop.clientHeight - 16) + 'px';
        }
    }

    function closeWindow(id) {
        const entry = open.get(id);
        if (!entry) return;
        if (entry.cleanup) entry.cleanup();   // stop any running canvas demo
        entry.win.remove();
        entry.taskBtn.remove();
        open.delete(id);
    }

    /* ---- canvas demos (tree / robots) --------------------- */
    // Returns a cleanup fn (to stop animation on close), or null.
    function initDemo(win) {
        const demo = win.querySelector('.demo');
        if (!demo) return null;
        if (demo.dataset.demo === 'tree') return initTree(demo);
        if (demo.dataset.demo === 'robots') return initRobots(demo);
        return null;
    }

    function statSetter(demo) {
        const cache = {};
        return (name, val) => {
            const el = cache[name] || (cache[name] = demo.querySelector('[data-stat="' + name + '"]'));
            if (el) el.textContent = val;
        };
    }

    function wireDemoControls(demo, actions) {
        demo.querySelectorAll('[data-act]').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.preventDefault();
                const fn = actions[b.dataset.act];
                if (fn) fn();
            });
        });
    }

    function initTree(demo) {
        if (typeof TreeSimulation === 'undefined') return null;
        const canvas = demo.querySelector('canvas');
        const setStat = statSetter(demo);
        const sim = new TreeSimulation(canvas, (s) => {
            setStat('branches', s.branches);
            setStat('petals', s.petals);
            setStat('progress', s.progress);
        });
        wireDemoControls(demo, {
            run: () => sim.start(),
            pause: () => sim.pause(),
            reset: () => sim.reset(),
        });
        return () => sim.reset();   // cancels the animation frame
    }

    function initRobots(demo) {
        if (typeof RobotSimulation === 'undefined') return null;
        const gen1 = demo.querySelector('[data-canvas="gen1"]');
        const final = demo.querySelector('[data-canvas="final"]');
        const setStat = statSetter(demo);
        const sim = new RobotSimulation(gen1, final, (s) => {
            setStat('generation', s.generation);
            setStat('total', s.totalGenerations);
            setStat('avg', s.avgFitness);
            setStat('best', s.bestFitness);
            setStat('bestGen', s.bestGen);
        });
        wireDemoControls(demo, {
            run: () => {
                if (sim.running) return;            // already evolving (or paused)
                if (sim.currentGen > 0) sim.reset(); // finished a prior run → start fresh
                sim.start();
            },
            pause: () => sim.pause(),
            reset: () => sim.reset(),
        });
        return () => { sim.running = false; };   // break the generation loop
    }

    /* ---- taskbar ------------------------------------------ */
    function makeTaskButton(win, id) {
        const title = win.querySelector('.title').textContent;
        const btn = document.createElement('button');
        btn.className = 'task-btn';
        btn.textContent = title;
        btn.addEventListener('click', () => {
            const hidden = win.style.display === 'none';
            const isActive = win.classList.contains('active');
            if (hidden) { restore(id); focus(id); }
            else if (isActive) { minimize(id); }
            else { focus(id); }
        });
        taskItems.appendChild(btn);
        return btn;
    }

    /* ---- desktop icons ------------------------------------ */
    document.querySelectorAll('.desktop-icon').forEach((icon) => {
        icon.addEventListener('click', () => {
            document.querySelectorAll('.desktop-icon.selected')
                .forEach((i) => i.classList.remove('selected'));
            icon.classList.add('selected');
        });
        icon.addEventListener('dblclick', () => openWindow(icon.dataset.window));
        // keyboard: Enter opens a focused icon
        icon.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') openWindow(icon.dataset.window);
        });
    });
    // click empty desktop clears icon selection
    desktop.addEventListener('pointerdown', (e) => {
        if (e.target === desktop) {
            document.querySelectorAll('.desktop-icon.selected')
                .forEach((i) => i.classList.remove('selected'));
        }
    });

    /* ---- start menu --------------------------------------- */
    const startBtn = document.getElementById('start-btn');
    const startMenu = document.getElementById('start-menu');

    function setMenu(state) {
        startMenu.classList.toggle('open', state);
        startBtn.classList.toggle('active', state);
    }

    if (startBtn && startMenu) {
        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setMenu(!startMenu.classList.contains('open'));
        });

        startMenu.querySelectorAll('button').forEach((b) => {
            b.addEventListener('click', () => {
                if (b.dataset.window) openWindow(b.dataset.window);
                else if (b.dataset.link) window.open(b.dataset.link, '_blank');
                setMenu(false);
            });
        });

        // click anywhere else closes the menu
        document.addEventListener('pointerdown', (e) => {
            if (!startMenu.contains(e.target) && e.target !== startBtn) setMenu(false);
        });
    }

    /* ---- clock -------------------------------------------- */
    const clock = document.getElementById('clock');
    function tick() {
        const d = new Date();
        const h = d.getHours() % 12 || 12;
        const m = String(d.getMinutes()).padStart(2, '0');
        clock.textContent = `${h}:${m} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
    }
    tick(); setInterval(tick, 10000);

    /* ---- open the intro window on load -------------------- */
    window.addEventListener('load', () => openWindow('about'));
})();
