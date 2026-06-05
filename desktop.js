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
        const cleanup = initDemo(win) || initTerminal(win, id);   // null for plain windows
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

    /* ---- terminal (cmd.exe) ------------------------------- */
    const FILES = [
        ['about_me.txt',    'about'],
        ['projects',        'projects'],
        ['contact',         'contact'],
        ['cherry_tree.exe', 'tree'],
        ['maze_solver.exe', 'robots'],
        ['cmd.exe',         'terminal'],
    ];
    const JOKES = [
        'Why do programmers prefer dark mode? Because light attracts bugs.',
        'There are 10 kinds of people: those who read binary and those who don\'t.',
        'A SQL query walks into a bar, sidles up to two tables and asks: "may I JOIN you?"',
        '!false — it\'s funny because it\'s true.',
        'I would tell you a UDP joke, but you might not get it.',
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
                print('  tree | maze         launch a demo .exe');
                print('  github              open my GitHub');
                print('  echo <text>         repeat after me');
                print('  date | time         current date / time');
                print('  clear | cls         wipe the screen');
                print('  exit                close this window');
                print('(a few commands are hidden — go poke around)', 'muted');
            },
            whoami() {
                print('Hunter Powell — CS student @ Sacramento State (graduating May 2026).');
                print('Backend & systems. Python, C++, Java, a little Rust.');
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
                print('     `-----\'    brewing . . . ☕');
            },
        };

        function sudo(arg) {
            const a = (arg || '').toLowerCase().trim();
            if (a === 'hire-me' || a === 'hire me') {
                print('[sudo] access granted. ✓');
                print('Hunter is open to new-grad & internship roles starting May 2026.');
                printHTML('reach him at <a href="mailto:hunterpowell99@gmail.com">hunterpowell99@gmail.com</a>');
                openWindow('contact');
                return;
            }
            print('[sudo] nice try — you are not in the sudoers file.');
            print('       This incident will be reported. 😏', 'muted');
        }

        function run(raw) {
            const line = raw.trim();
            print('C:\\hunter> ' + line, 'cmd');
            if (!line) return;
            const parts = line.split(/\s+/);
            const key = parts[0].toLowerCase();
            const arg = line.slice(parts[0].length).trim();

            if (key === 'sudo') return sudo(arg);
            if (key === 'rm') return print('Nope. I worked hard on these files. 🙂');
            if (key === 'vim' || key === 'vi' || key === 'nano' || key === 'emacs') {
                return print('You\'re in ' + key + ' now. Good luck exiting. (kidding — try closing the window)');
            }
            if (key === 'fortune' || key === 'joke') {
                return print(JOKES[Math.floor(Math.random() * JOKES.length)]);
            }
            if (['hi', 'hello', 'hey', 'yo'].includes(key)) {
                return print('hey! type `help` to see what i can do.');
            }
            const fn = commands[key];
            if (fn) return fn(arg);
            print('\'' + parts[0] + '\' is not recognized as a command. type `help`.', 'muted');
        }

        // banner
        print('HunterOS [Version 4.8]');
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
