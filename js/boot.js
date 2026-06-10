/* ============================================================
   boot.js — fake POST / boot sequence shown on load, then it
   fades out to reveal the desktop. Click or press any key to skip.
   Respects prefers-reduced-motion (skips straight to the desktop).
   ============================================================ */
(function () {
    'use strict';

    const boot = document.getElementById('boot');
    if (!boot) return;
    const screen = boot.querySelector('[data-boot-screen]');

    const lines = [
        'HunterOS BIOS v4.2',
        'Copyright (C) 2026 Hunter Powell',
        '',
        'Detecting hardware . . .',
        '  CPU . . . . . . . OK',
        '  Memory  . . . . . 640K OK',
        '  Display . . . . . OK',
        '  Coffee  . . . . . LOW',
        '',
        'Mounting C:\\hunter . . . OK',
        'Loading HunterOS . . .',
        'Starting desktop . . .',
    ];

    let done = false;

    function finish() {
        if (done) return;
        done = true;
        boot.removeEventListener('click', finish);
        document.removeEventListener('keydown', finish);
        boot.classList.add('done');
        setTimeout(() => boot.remove(), 600);
    }

    // Reduced motion (or no screen element): skip the whole thing.
    const reduce = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !screen) { boot.remove(); return; }

    boot.addEventListener('click', finish);
    document.addEventListener('keydown', finish);

    let i = 0;
    (function step() {
        if (done) return;
        if (i < lines.length) {
            screen.textContent += (i ? '\n' : '') + lines[i];
            i++;
            setTimeout(step, 120 + Math.random() * 110);
        } else {
            setTimeout(finish, 650);
        }
    })();
})();
