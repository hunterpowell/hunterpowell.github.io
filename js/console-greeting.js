/* ============================================================
   console-greeting.js — a little hello for anyone who opens
   the dev console. Pastel %c styling, one ASCII banner, and a
   genuinely useful pointer for the curious.
   ============================================================ */
(function () {
    'use strict';

    // Small retro CRT banner.
    const art = [
        '   .---------------------------.',
        '   |  > hunter.exe             |',
        '   |  > _                      |',
        "   |                           |",
        '   |___________________________|',
        '    \\=========================/',
    ].join('\n');

    const rose = 'color:#DCA4AC;font-weight:bold;';
    const plum = 'color:#8a6f7d;';
    const sage = 'color:#7faf93;';
    const gold = 'color:#d39b53;';

    console.log('%c' + art, plum);
    console.log(
        '%cOh, a code inspector. Welcome, grab a coffee, mind the bugs.',
        rose
    );
    console.log(
        '%cThe whole desktop is hand-rolled vanilla HTML/CSS/JS. No frameworks, no build step.',
        sage
    );
    console.log(
        '%cPeek at the source → %chttps://github.com/hunterpowell/hunterpowell.github.io',
        plum,
        gold
    );
})();
