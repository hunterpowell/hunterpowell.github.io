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
    let activeId = null;          // id of the focused window (for Alt-accelerators)
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
        const cleanup = initDemo(win) || initTerminal(win, id) || initPaint(win);   // null for plain windows
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
        wireMenuBar(win, id);

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
        activeId = id;
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
            win.style.height = win.dataset.ph || '';   // restore pre-maximize height
        } else {
            win.dataset.px = win.style.left; win.dataset.py = win.style.top;
            win.dataset.pw = win.style.width;
            win.dataset.ph = win.style.height;         // remember it (terminal/resized windows)
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
        if (activeId === id) activeId = null;
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

    /* ---- paint (paint.exe) -------------------------------- */
    function initPaint(win) {
        const root = win.querySelector('.paint');
        if (!root || typeof PaintApp === 'undefined') return null;
        win._paint = new PaintApp(root);   // kept so the menus can drive it
        return null;   // listeners live on canvas; removed when the window does
    }

    /* ---- terminal (cmd.exe) ------------------------------- */
    const FILES = [
        ['about_me.txt',    'about'],
        ['projects',        'projects'],
        ['contact',         'contact'],
        ['cherry_tree.exe', 'tree'],
        ['maze_solver.exe', 'robots'],
        ['cmd.exe',         'terminal'],
        ['paint.exe',       'paint'],
    ];
    const JOKES = [
        'Why do programmers prefer dark mode? Because light attracts bugs.',
        'There are 10 kinds of people: those who read binary and those who don\'t.',
        'A SQL query walks into a bar, sidles up to two tables and asks: "may I JOIN you?"',
        '!false — it\'s funny because it\'s true.',
        'I would tell you a UDP joke, but you might not get it.',
        'Why don\'t jokes work in octal? Because 7 10 11.',
        'There are only two difficult problems in computer science: naming things, cache invalidation, and off-by-one errors.',
    ];

    // Undocumented terminal commands — revealed by `sudo help` (in-terminal)
    // and the Konami code (themed dialog). Single source of truth for both.
    const SECRET_COMMANDS = [
        { cmd: 'sudo hire-me', desc: "grant access - I'm open to roles (opens connect.exe)" },
        { cmd: 'coffee',       desc: 'brew a fresh cup' },
        { cmd: 'fortune',      desc: 'a random (bad) programmer joke (alias: joke)' },
        { cmd: 'vim',          desc: 'enter the editor war (alias: nano, emacs)' },
        { cmd: 'rm',           desc: 'try to delete my files… good luck' },
        { cmd: 'hi',           desc: 'say hello (alias: hey, yo)' },
    ];

    function initTerminal(win, id) {
        const body = win.querySelector('.term-body');
        if (!body) return null;
        const output = body.querySelector('[data-term-output]');
        const input = body.querySelector('[data-term-input]');
        const history = [];
        let histIdx = 0;

        function scroll() { output.scrollTop = output.scrollHeight; }
        function print(text, cls) {
            const div = document.createElement('div');
            if (cls) div.className = cls;
            div.textContent = text == null ? '' : text;
            output.appendChild(div);
            scroll();
        }
        function printHTML(html) {
            const div = document.createElement('div');
            div.innerHTML = html;   // only ever called with trusted, code-defined markup
            output.appendChild(div);
            scroll();
        }
        function launch(target, label) {
            openWindow(target);
            print('Opening ' + label + ' . . .', 'muted');
        }

        const commands = {
            help() {
                print('Available commands:', 'muted');
                print('  help                this list');
                print('  whoami              short bio');
                print('  ls / dir            list desktop files');
                print('  open <name>         open a window (try: open projects)');
                print('  about | projects | contact    jump to a window');
                print('  tree | maze | paint launch an .exe');
                print('  github              open my GitHub');
                print('  echo <text>         repeat after me');
                print('  date | time         current date / time');
                print('  clear | cls         wipe the screen');
                print('  exit                close this window');
                print('(a few commands are hidden — go poke around)', 'muted');
            },
            whoami() {
                print('Hunter Powell — CS student @ Sacramento State (graduating Dec 2026).');
                print('Simulation, systems, and ML. Python, C++, Java, a little Rust.');
            },
            ls() { FILES.forEach(([name]) => print('  ' + name)); },
            open(arg) {
                if (!arg) { print('usage: open <name>   (try `ls`)', 'muted'); return; }
                const a = arg.toLowerCase().replace(/\.(exe|txt)$/, '');
                const hit = FILES.find(([name, wid]) =>
                    wid === a || name.toLowerCase().replace(/\.(exe|txt)$/, '') === a);
                if (hit) launch(hit[1], hit[0]);
                else print('open: cannot find "' + arg + '". try `ls`.', 'muted');
            },
            about() { launch('about', 'about_me.txt'); },
            projects() { launch('projects', 'projects'); },
            contact() { launch('contact', 'contact'); },
            tree() { launch('tree', 'cherry_tree.exe'); },
            paint() { launch('paint', 'paint.exe'); },
            maze() { launch('robots', 'maze_solver.exe'); },
            robots() { launch('robots', 'maze_solver.exe'); },
            github() { window.open('https://github.com/hunterpowell', '_blank'); print('Opening GitHub . . .', 'muted'); },
            echo(arg) { print(arg || ''); },
            date() { print(new Date().toDateString()); },
            time() { print(new Date().toLocaleTimeString()); },
            clear() { output.innerHTML = ''; },
            cls() { output.innerHTML = ''; },
            exit() { closeWindow(id); },
            coffee() {
                print('      ( (');
                print('       ) )');
                print('    .........');
                print('    |       |]');
                print('    \\       /');
                print('     `-----\'    brewing . . . ');
            },
        };

        function sudo(arg) {
            const a = (arg || '').toLowerCase().trim();
            if (a === 'help') {
                print('[sudo] access granted — secret commands:', 'muted');
                SECRET_COMMANDS.forEach((c) => print('  ' + c.cmd.padEnd(16) + ' ' + c.desc));
                return;
            }
            if (a === 'hire-me' || a === 'hire me') {
                print('[sudo] access granted. ✓');
                print('Hunter is open to new-grad & internship roles');
                printHTML('reach him at <a href="mailto:hunterpowell99@gmail.com">hunterpowell99@gmail.com</a>');
                openWindow('contact');
                return;
            }
            print('[sudo] nice try — you are not in the sudoers file.');
            print('       This incident will be reported. ;)', 'muted');
        }

        function run(raw) {
            const line = raw.trim();
            print('C:\\hunter> ' + line, 'cmd');
            if (!line) return;
            const parts = line.split(/\s+/);
            const key = parts[0].toLowerCase();
            const arg = line.slice(parts[0].length).trim();

            if (key === 'sudo') return sudo(arg);
            if (key === 'rm') return print('Nope. I worked hard on these files. :)');
            if (key === 'vim' || key === 'vi' || key === 'nano' || key === 'emacs') {
                return print('You\'re in my world (' + key + ') now. Good luck exiting. ');
            }
            if (key === 'fortune' || key === 'joke') {
                return print(JOKES[Math.floor(Math.random() * JOKES.length)]);
            }
            if (['hi', 'hello', 'hey', 'yo'].includes(key)) {
                return print('hey nerd. type `help` to see what i can do.');
            }
            const fn = commands[key];
            if (fn) return fn(arg);
            print('\'' + parts[0] + '\' is not recognized as a command. type `help`.', 'muted');
        }

        // banner
        print('HunterOS [Version 4.2]');
        print('(c) 2026 Hunter Powell. All rights reserved.', 'muted');
        print('Type `help` to get started.');
        print('');

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const v = input.value;
                if (v.trim()) { history.push(v); }
                histIdx = history.length;
                input.value = '';
                run(v);
            } else if (e.key === 'ArrowUp') {
                if (histIdx > 0) { histIdx--; input.value = history[histIdx]; }
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx]; }
                else { histIdx = history.length; input.value = ''; }
                e.preventDefault();
            }
        });

        // clicking anywhere in the terminal focuses the prompt
        body.addEventListener('mousedown', (e) => {
            if (e.target !== input) setTimeout(() => input.focus(), 0);
        });
        setTimeout(() => input.focus(), 0);

        return null;   // nothing to tear down
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

    /* ---- desktop icons (draggable, persisted) ------------- */
    const ICONS = Array.from(document.querySelectorAll('.desktop-icon'));
    const ICON_W = 84, ICON_H = 78;
    const ICON_STORE = 'hp-icons-v1';

    function clampX(x) { return Math.max(0, Math.min(x, desktop.clientWidth - ICON_W)); }
    function clampY(y) { return Math.max(0, Math.min(y, desktop.clientHeight - ICON_H)); }

    function placeIcon(icon, x, y) {
        icon.style.left = x + 'px';
        icon.style.top = y + 'px';
    }

    function selectIcon(icon) {
        ICONS.forEach((i) => i.classList.toggle('selected', i === icon));
    }
    function clearSelection() {
        ICONS.forEach((i) => i.classList.remove('selected'));
    }

    // default arrangement: a column at top-left, wrapping into new columns
    function defaultLayout() {
        const top0 = 18, left0 = 18, stepY = 92, stepX = 96;
        const rows = Math.max(1, Math.floor((desktop.clientHeight - top0) / stepY));
        ICONS.forEach((icon, i) => {
            placeIcon(icon, left0 + Math.floor(i / rows) * stepX, top0 + (i % rows) * stepY);
        });
    }

    function saveIcons() {
        const data = {};
        ICONS.forEach((icon) => {
            data[icon.dataset.window] = {
                x: parseInt(icon.style.left, 10) || 0,
                y: parseInt(icon.style.top, 10) || 0,
            };
        });
        try { localStorage.setItem(ICON_STORE, JSON.stringify(data)); } catch (_) {}
    }

    function loadIcons() {
        defaultLayout();   // baseline for every icon (incl. any newly added ones)
        let data = null;
        try { data = JSON.parse(localStorage.getItem(ICON_STORE) || 'null'); } catch (_) {}
        if (!data) return;
        ICONS.forEach((icon) => {
            const p = data[icon.dataset.window];
            if (p) placeIcon(icon, clampX(p.x), clampY(p.y));
        });
    }

    ICONS.forEach((icon) => {
        let sx, sy, ox, oy, pid = null, down = false, moved = false;

        icon.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;        // left button only
            down = true; moved = false;
            sx = e.clientX; sy = e.clientY;
            ox = icon.offsetLeft; oy = icon.offsetTop;
            pid = e.pointerId;
            selectIcon(icon);
        });

        icon.addEventListener('pointermove', (e) => {
            if (!down) return;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (!moved && Math.hypot(dx, dy) < 4) return;   // drag threshold
            if (!moved) { moved = true; icon.classList.add('dragging'); icon.setPointerCapture(pid); }
            placeIcon(icon, clampX(ox + dx), clampY(oy + dy));
        });

        const endDrag = () => {
            if (!down) return;
            down = false;
            if (moved) {
                icon.classList.remove('dragging');
                try { icon.releasePointerCapture(pid); } catch (_) {}
                saveIcons();
            }
        };
        icon.addEventListener('pointerup', endDrag);
        icon.addEventListener('pointercancel', endDrag);

        icon.addEventListener('dblclick', () => openWindow(icon.dataset.window));
        icon.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') openWindow(icon.dataset.window);
        });
    });

    loadIcons();
    // keep icons on-screen (and restore saved spots) when the desktop resizes
    let resizeT;
    window.addEventListener('resize', () => {
        clearTimeout(resizeT);
        resizeT = setTimeout(loadIcons, 150);
    });

    // click empty desktop clears icon selection
    desktop.addEventListener('pointerdown', (e) => {
        if (e.target === desktop) clearSelection();
    });

    /* ---- right-click context menu ------------------------- */
    let activeMenu = null;
    let menuBarOpen = null;   // the <span> whose menu-bar dropdown is showing

    function closeContextMenu() {
        if (activeMenu) { activeMenu.remove(); activeMenu = null; }
        if (menuBarOpen) { menuBarOpen.classList.remove('open'); menuBarOpen = null; }
    }

    function showContextMenu(x, y, items) {
        closeContextMenu();
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        items.forEach((it) => {
            if (it.sep) {
                const s = document.createElement('div');
                s.className = 'cm-sep';
                menu.appendChild(s);
                return;
            }
            const b = document.createElement('button');
            b.textContent = it.label;
            b.addEventListener('click', () => { closeContextMenu(); if (it.action) it.action(); });
            menu.appendChild(b);
        });
        document.body.appendChild(menu);
        const r = menu.getBoundingClientRect();
        menu.style.left = Math.max(2, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
        menu.style.top = Math.max(2, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
        activeMenu = menu;
    }

    document.addEventListener('contextmenu', (e) => {
        if (document.getElementById('boot')) return;   // still booting
        // leave native menus intact inside windows / taskbar / start menu
        if (e.target.closest('.window, .taskbar, .start-menu, .context-menu')) return;
        e.preventDefault();
        const icon = e.target.closest('.desktop-icon');
        if (icon) {
            selectIcon(icon);
            showContextMenu(e.clientX, e.clientY, [
                { label: 'Open', action: () => openWindow(icon.dataset.window) },
                { sep: true },
                { label: 'Reset icons', action: () => { defaultLayout(); saveIcons(); } },
            ]);
        } else {
            clearSelection();
            showContextMenu(e.clientX, e.clientY, [
                { label: 'Open Terminal', action: () => openWindow('terminal') },
                { label: 'Reset icons', action: () => { defaultLayout(); saveIcons(); } },
                crtItem(),
                { sep: true },
                { label: 'View Source', action: () => window.open('https://github.com/hunterpowell/hunterpowell.github.io', '_blank') },
                { label: 'Properties', action: () => openWindow('about') },
            ]);
        }
    });

    document.addEventListener('pointerdown', (e) => {
        // a click on a menu-bar label is handled by its own click listener
        if (activeMenu && !activeMenu.contains(e.target) && !e.target.closest('.menu-bar span')) {
            closeContextMenu();
        }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeContextMenu(); });
    window.addEventListener('blur', closeContextMenu);

    /* ---- window menu bar (File / Edit / View / ...) ------- */
    // The decorative menu labels become real dropdowns, reusing the
    // context-menu renderer. Click to open, hover to switch between
    // menus while one is open, Alt+<underlined letter> to open by key.
    function wireMenuBar(win, id) {
        const bar = win.querySelector('.menu-bar');
        if (!bar) return;
        bar.querySelectorAll('span').forEach((span) => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                if (menuBarOpen === span) { closeContextMenu(); return; }
                openMenuFor(span, win, id);
            });
            span.addEventListener('pointerenter', () => {
                if (menuBarOpen && menuBarOpen !== span) openMenuFor(span, win, id);
            });
        });
    }

    function openMenuFor(span, win, id) {
        const name = span.textContent.trim();          // "File", "Edit", ...
        const items = buildWindowMenu(name, win, id);
        if (!items.length) { closeContextMenu(); return; }
        const r = span.getBoundingClientRect();
        showContextMenu(r.left, r.bottom, items);      // resets menuBarOpen first
        menuBarOpen = span;
        span.classList.add('open');
    }

    // Alt + underlined letter opens the matching menu on the active window.
    document.addEventListener('keydown', (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey) return;
        const key = e.key.toLowerCase();
        if (!/^[a-z]$/.test(key)) return;
        const entry = activeId && open.get(activeId);
        if (!entry) return;
        const bar = entry.win.querySelector('.menu-bar');
        if (!bar) return;
        const span = Array.from(bar.querySelectorAll('span')).find((s) => {
            const u = s.querySelector('u');
            return u && u.textContent.toLowerCase() === key;
        });
        if (span) { e.preventDefault(); openMenuFor(span, entry.win, activeId); }
    });

    /* ---- menu contents (per label, per window) ------------ */
    function buildWindowMenu(name, win, id) {
        switch (name) {
            case 'File':  return fileMenu(win, id);
            case 'Edit':  return editMenu(win, id);
            case 'View':  return viewMenu(win);
            case 'Help':  return helpMenu();
            case 'Open':  return openMenu();          // projects
            case 'Run':   return runMenu(win);        // tree / robots demos
            case 'Image': return imageMenu(win);      // paint.exe
            default:      return [];
        }
    }

    function fileMenu(win, id) {
        const items = [];
        if (id === 'paint') items.push({ label: 'Save as PNG…', action: () => paintAct(win, 'save') });
        if (id === 'about') items.push({ label: 'Download résumé ↓', action: downloadResume });
        if (items.length) items.push({ sep: true });
        items.push({ label: 'Close', action: () => closeWindow(id) });
        return items;
    }

    function editMenu(win, id) {
        const items = [];
        if (id === 'contact') {
            items.push({ label: 'Copy email', action: () => copyText('hunterpowell99@gmail.com', 'Email copied') });
            items.push({ label: 'Copy GitHub URL', action: () => copyText('https://github.com/hunterpowell', 'GitHub URL copied') });
            items.push({ label: 'Copy LinkedIn URL', action: () => copyText('https://linkedin.com/in/hunterpowell-dev', 'LinkedIn URL copied') });
            items.push({ sep: true });
        }
        if (id === 'paint') {
            items.push({ label: 'Clear canvas', action: () => paintAct(win, 'clear') });
            return items;
        }
        items.push({ label: 'Select All', action: () => selectBody(win) });
        return items;
    }

    function viewMenu(win) {
        return [
            { label: 'Zoom In', action: () => zoomBody(win, 0.1) },
            { label: 'Zoom Out', action: () => zoomBody(win, -0.1) },
            { label: 'Actual Size', action: () => setZoom(win, 1) },
            { sep: true },
            crtItem(),
        ];
    }

    // CRT toggle, shared by the window View menu and the desktop menu.
    function crtItem() {
        return {
            label: (document.body.classList.contains('crt') ? '✓ ' : '   ') + 'CRT effect',
            action: () => document.body.classList.toggle('crt'),
        };
    }

    function helpMenu() {
        return [
            { label: 'About HunterOS…', action: showAboutDialog },
            { label: 'Keyboard shortcuts…', action: showShortcutsDialog },
            { sep: true },
            { label: 'View source on GitHub',
              action: () => window.open('https://github.com/hunterpowell/hunterpowell.github.io', '_blank') },
        ];
    }

    function openMenu() {
        return [
            { label: "Lydia's Law — NOTES.md", action: () => openWindow('notes-lydia') },
            { label: 'Coverage Robots — POSTMORTEM.md', action: () => openWindow('notes-robots') },
            { label: 'Heart Classifier — NOTES.md', action: () => openWindow('notes-heart') },
            { label: 'Cherry Tree — README.md', action: () => openWindow('notes-tree') },
        ];
    }

    function runMenu(win) {
        const click = (act) => { const b = win.querySelector('[data-act="' + act + '"]'); if (b) b.click(); };
        return [
            { label: 'Run', action: () => click('run') },
            { label: 'Pause', action: () => click('pause') },
            { label: 'Reset', action: () => click('reset') },
        ];
    }

    function imageMenu(win) {
        return [
            { label: 'Invert colours', action: () => paintFilter(win, 'invert') },
            { label: 'Flip horizontal', action: () => paintFilter(win, 'flip') },
            { sep: true },
            { label: 'Clear canvas', action: () => paintAct(win, 'clear') },
        ];
    }

    /* ---- menu action helpers ------------------------------ */
    function paintAct(win, act) {
        const app = win._paint;
        if (!app) return;
        if (act === 'clear') app.clear();
        else if (act === 'save') app.save();
    }

    // Direct bitmap ops on the paint canvas (PaintApp draws straight to it,
    // with no backing buffer to clobber, so putImageData persists).
    function paintFilter(win, kind) {
        const canvas = win.querySelector('.paint-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        if (kind === 'invert') {
            const img = ctx.getImageData(0, 0, W, H);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
                d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
            }
            ctx.putImageData(img, 0, 0);
        } else if (kind === 'flip') {
            const img = ctx.getImageData(0, 0, W, H);
            ctx.save();
            ctx.setTransform(-1, 0, 0, 1, W, 0);   // mirror across the vertical axis
            // putImageData ignores transforms, so paint via a temp canvas
            const tmp = document.createElement('canvas');
            tmp.width = W; tmp.height = H;
            tmp.getContext('2d').putImageData(img, 0, 0);
            ctx.drawImage(tmp, 0, 0);
            ctx.restore();
        }
    }

    function selectBody(win) {
        const body = win.querySelector('.window-body');
        if (!body) return;
        const range = document.createRange();
        range.selectNodeContents(body);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function zoomBody(win, delta) {
        const body = win.querySelector('.window-body');
        if (!body) return;
        setZoom(win, (parseFloat(body.dataset.zoom || '1') + delta));
    }

    function setZoom(win, z) {
        const body = win.querySelector('.window-body');
        if (!body) return;
        z = Math.min(2, Math.max(0.6, Math.round(z * 100) / 100));
        body.dataset.zoom = z;
        body.style.zoom = z;   // scales text + headings (rem) uniformly
    }

    function downloadResume() {
        const a = document.createElement('a');
        a.href = 'Hunter_Powell_Resume.pdf';
        a.download = 'Hunter_Powell_Resume.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function copyText(text, msg) {
        const done = () => showToast(msg || 'Copied');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (_) {}
        ta.remove();
    }

    let toastTimer = null;
    function showToast(msg) {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        requestAnimationFrame(() => toast.classList.add('show'));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 250);
        }, 1600);
    }

    /* ---- dialogs (Help menu) ------------------------------ */
    function showDialog(title, html) {
        closeContextMenu();
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.innerHTML =
            '<section class="window" role="dialog" aria-label="' + title + '">' +
                '<div class="title-bar">' +
                    '<span class="dot"></span>' +
                    '<span class="title">' + title + '</span>' +
                    '<div class="title-controls"><button aria-label="close">×</button></div>' +
                '</div>' +
                '<div class="window-body">' + html +
                    '<p class="card-actions" style="margin-top:1.1rem;text-align:right;">' +
                        '<a href="#" class="btn" data-dlg-ok>OK</a></p>' +
                '</div>' +
            '</section>';
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('[aria-label="close"], [data-dlg-ok]')) {
                e.preventDefault();
                close();
            }
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
    }

    function showAboutDialog() {
        showDialog('About HunterOS',
            '<h3>HunterOS <span class="dlg-version">v4.2</span></h3>' +
            '<p>A retro desktop portfolio by Hunter Powell.</p>' +
            '<p>Hand-built with vanilla HTML, CSS &amp; JavaScript — no frameworks, ' +
            'no dependencies. The windows, taskbar, terminal and paint app are all ' +
            'home-grown.</p>' +
            '<p style="margin-top:0.6rem;color:var(--ink-soft);">© 2026 Hunter Powell · ' +
            '640K of RAM ought to be enough for anybody.</p>');
    }

    function showShortcutsDialog() {
        showDialog('Keyboard shortcuts',
            '<dl>' +
            '<dt><kbd>Alt</kbd>+<kbd>letter</kbd></dt><dd>open the underlined menu</dd>' +
            '<dt><kbd>Esc</kbd></dt><dd>close a menu or dialog</dd>' +
            '<dt>Double-click</dt><dd>open a desktop icon</dd>' +
            '<dt>Right-click</dt><dd>desktop &amp; icon context menus</dd>' +
            '<dt>Drag title bar</dt><dd>move a window</dd>' +
            '<dt>Drag corner</dt><dd>resize a window</dd>' +
            '</dl>' +
            '<p style="color:var(--ink-soft);">Tip: open <b>cmd.exe</b> and type ' +
            '<b>help</b> for terminal commands.</p>');
    }

    function showSecretsDialog() {
        const rows = SECRET_COMMANDS.map((c) =>
            '<dt><kbd>' + c.cmd + '</kbd></dt><dd>' + c.desc + '</dd>').join('');
        showDialog('Secret commands',
            '<h3>🔓 Cheat codes unlocked</h3>' +
            '<p>Undocumented things to type into <b>cmd.exe</b>:</p>' +
            '<dl>' + rows + '</dl>' +
            '<p style="color:var(--ink-soft);">(or just run <b>sudo help</b> in the terminal)</p>');
    }

    /* ---- konami code: ↑↑↓↓←→←→ B A reveals the secrets ---- */
    const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown',
        'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    let konamiIdx = 0;
    document.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (k === KONAMI[konamiIdx]) konamiIdx++;
        else konamiIdx = (k === KONAMI[0]) ? 1 : 0;
        if (konamiIdx === KONAMI.length) { konamiIdx = 0; showSecretsDialog(); }
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
