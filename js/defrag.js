// defrag.js — "brain defrag", a tiny mellow media player.
// A compact player with a Windows-defrag-style block spectrum
// visualizer. Mirrors the class style used by paint.js / robots.js;
// wired up by initDefrag() in desktop.js.
//
// ── Playlist ────────────────────────────────────────────────
// Drop audio files in /audio and list them here. `link` is
// optional — when present, a small ↗ links out to the full track.
const DEFRAG_TRACKS = [
    {   title: 'blocks',
        artist: 'C418',
        src: 'audio/blocks.mp3',
        link: 'https://open.spotify.com/track/7MiAqHRKJRw9mYjIAcvOIe?si=7dd6e02b38c44196' },
    {   title: 'cat',
        artist: 'C418',
        src: 'audio/cat.mp3',
        link: 'https://open.spotify.com/track/23uNiVgsIgoHC7eLet3kCI?si=4d9aea4bbddb4593' },
    {   title: 'chirp',
        artist: 'C418',
        src: 'audio/chirp.mp3',
        link: 'https://open.spotify.com/track/1cjYtL6yMFDLyZYn9bDkGo?si=8027bfa300224867' },
    {   title: 'far',
        artist: 'C418',
        src: 'audio/far.mp3',
        link: 'https://open.spotify.com/track/7tL9xxvZY4C8rx5EKfHIVU?si=687507bb2d2447aa' },
    {   title: 'mall',
        artist: 'C418',
        src: 'audio/mall.mp3',
        link: 'https://open.spotify.com/track/5WmQhFA7VWlPDptFFtY32l?si=fe704480e5c94d15' },
    {   title: 'mellohi',
        artist: 'C418',
        src: 'audio/mellohi.mp3',
        link: 'https://open.spotify.com/track/4gJWOPtNwTZOZNbAMMAK4m?si=9896a904172f4caa' },
    {   title: 'stal',
        artist: 'C418',
        src: 'audio/stal.mp3',
        link: 'https://open.spotify.com/track/3YJtGYHVxcUa6EMSqHtIiW?si=7464d07d29ae4a52' },
    {   title: 'strad',
        artist: 'C418',
        src: 'audio/strad.mp3',
        link: 'https://open.spotify.com/track/6jdrVuAbbvcEbUXy1V2HxM?si=5eb6729ba5c6404f' },
    {   title: 'wait',
        artist: 'C418',
        src: 'audio/wait.mp3',
        link: 'https://open.spotify.com/track/5jETlbplk10X3x5n7mCPBL?si=a6d1598e0a034932' },
    {   title: 'ward',
        artist: 'C418',
        src: 'audio/ward.mp3',
        link: 'https://open.spotify.com/track/02qaPvngBKTnUrNOx3v7Mq?si=14259407b5e243e8' },
    {   title: 'otherside',
        artist: 'Lena Raine',
        src: 'audio/otherside.mp3',
        link: 'https://open.spotify.com/track/4PtJNlcpEGyNAkYy44m5fI?si=129a9162342942ff' },
];

class DefragPlayer {
    constructor(root, tracks) {
        this.root = root;
        this.tracks = tracks || [];
        this.index = 0;

        this.audio = new Audio();
        this.audio.preload = 'none';      // no bytes until the first play
        this.audio.volume = 0.1;          // these masters run hot — 10% is the comfy spot

        // Web Audio graph - built lazily on first play (needs a gesture)
        this.actx = null;
        this.analyser = null;
        this.freq = null;
        this.raf = null;

        // visualizer grid
        this.viz = root.querySelector('.defrag-viz');
        this.vctx = this.viz.getContext('2d');
        this.cols = 16;
        this.rows = 10;

        // DOM refs
        this.elTitle = root.querySelector('[data-df-title]');
        this.elArtist = root.querySelector('[data-df-artist]');
        this.elElapsed = root.querySelector('[data-df-elapsed]');
        this.elDuration = root.querySelector('[data-df-duration]');
        this.elFill = root.querySelector('[data-df-fill]');
        this.elBar = root.querySelector('[data-df-bar]');
        this.elPlay = root.querySelector('[data-df="play"]');
        this.elLink = root.querySelector('[data-df-link]');
        this.elList = root.querySelector('[data-df-list]');
        this.elScroll = root.querySelector('.wb-bar');

        this.wire();
        this.buildList();
        this.scroll = window.winScroll(this.elList, { axis: 'y', bar: this.elScroll });
        this.load(0, false);
        this.drawIdle();
    }

    /* ---- setup -------------------------------------------- */
    wire() {
        const act = {
            play: () => this.toggle(),
            next: () => this.skip(1),
            prev: () => this.skip(-1),
        };
        this.root.querySelectorAll('[data-df]').forEach((b) => {
            const fn = act[b.dataset.df];
            if (fn) b.addEventListener('click', fn);
        });

        // Perceptual volume: ear hears loudness ~logarithmically, so a linear
        // slider crams the useful range into the bottom. Square the position
        // (volume = pos²) to spread the quiet end out — pos 0.32 ≈ 10% volume.
        const vol = this.root.querySelector('.defrag-vol');
        if (vol) {
            vol.value = String(Math.sqrt(this.audio.volume));
            vol.addEventListener('input', () => { this.audio.volume = parseFloat(vol.value) ** 2; });
        }

        // click the seek bar to scrub
        if (this.elBar) {
            this.elBar.addEventListener('click', (e) => {
                if (!this.audio.duration) return;
                const r = this.elBar.getBoundingClientRect();
                this.audio.currentTime = ((e.clientX - r.left) / r.width) * this.audio.duration;
            });
        }

        this.audio.addEventListener('play', () => this.onPlay());
        this.audio.addEventListener('pause', () => this.onPause());
        this.audio.addEventListener('ended', () => this.skip(1));
        this.audio.addEventListener('timeupdate', () => this.onTime());
        this.audio.addEventListener('loadedmetadata', () => this.onTime());
        this.audio.addEventListener('error', () => this.onError());
    }

    ensureGraph() {
        if (this.actx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;                 // no Web Audio → player still plays, just no viz
        this.actx = new AC();
        const srcNode = this.actx.createMediaElementSource(this.audio);
        this.analyser = this.actx.createAnalyser();
        this.analyser.fftSize = 64;      // few bins → chunky blocks
        srcNode.connect(this.analyser);
        this.analyser.connect(this.actx.destination);
        this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    }

    /* ---- playlist ----------------------------------------- */
    get current() { return this.tracks[this.index] || null; }

    // Render one clickable row per track, straight from the array
    // (single source of truth — edit DEFRAG_TRACKS and this follows).
    buildList() {
        if (!this.elList) return;
        this.elList.textContent = '';
        this.tracks.forEach((t, i) => {
            const li = document.createElement('li');
            li.className = 'defrag-row';
            li.dataset.idx = String(i);

            const num = document.createElement('span');
            num.className = 'defrag-row-num';
            num.textContent = String(i + 1).padStart(2, '0');

            const title = document.createElement('span');
            title.className = 'defrag-row-title';
            title.textContent = t.title || 'untitled';

            li.append(num, title);
            li.addEventListener('click', () => this.load(i, true));
            this.elList.append(li);
        });
    }

    // Mark the playing row and keep it scrolled into view.
    highlight() {
        if (!this.elList) return;
        this.elList.querySelectorAll('.defrag-row').forEach((li) => {
            const on = Number(li.dataset.idx) === this.index;
            li.classList.toggle('is-active', on);
            if (on) li.scrollIntoView({ block: 'nearest' });
        });
    }


    load(i, autoplay) {
        if (!this.tracks.length) {
            this.elTitle.textContent = 'no tracks loaded';
            this.elArtist.textContent = 'drop MP3s in /audio, then edit defrag.js';
            if (this.elLink) this.elLink.hidden = true;
            return;
        }
        this.index = (i + this.tracks.length) % this.tracks.length;
        const t = this.current;
        this.audio.src = t.src;
        this.elTitle.textContent = t.title || 'untitled';
        this.elArtist.textContent = t.artist || '';
        if (this.elLink) {
            this.elLink.hidden = !t.link;
            if (t.link) this.elLink.href = t.link;
        }
        this.setTimes(0, 0);
        this.highlight();
        if (autoplay) this.play();
    }

    skip(dir) {
        if (!this.tracks.length) return;
        const wasPlaying = !this.audio.paused;
        this.load(this.index + dir, wasPlaying);
    }

    /* ---- transport ---------------------------------------- */
    toggle() {
        if (!this.tracks.length) return;
        if (this.audio.paused) this.play(); else this.audio.pause();
    }

    play() {
        this.ensureGraph();
        if (this.actx && this.actx.state === 'suspended') this.actx.resume();
        const p = this.audio.play();
        if (p && p.catch) p.catch(() => {});   // ignore autoplay/abort rejections
    }

    /* ---- events ------------------------------------------- */
    onPlay() {
        if (this.elPlay) this.elPlay.textContent = '⏸';
        this.loop();
    }
    onPause() {
        if (this.elPlay) this.elPlay.textContent = '▶';
        cancelAnimationFrame(this.raf);
        this.drawIdle();
    }
    onTime() {
        const d = this.audio.duration || 0;
        const c = this.audio.currentTime || 0;
        this.setTimes(c, d);
    }
    onError() {
        if (!this.tracks.length) return;
        this.elArtist.textContent = "couldn't load this track";
    }

    setTimes(cur, dur) {
        if (this.elElapsed) this.elElapsed.textContent = fmtTime(cur);
        if (this.elDuration) this.elDuration.textContent = fmtTime(dur);
        if (this.elFill) this.elFill.style.width = dur ? (cur / dur * 100) + '%' : '0%';
    }

    /* ---- visualizer --------------------------------------- */
    loop() {
        this.raf = requestAnimationFrame(() => this.loop());
        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.freq);
            this.draw();
        }
    }

    draw() {
        const { vctx, viz, cols, rows, freq } = this;
        const W = viz.width, H = viz.height, gap = 2;
        const cw = (W - gap * (cols + 1)) / cols;
        const ch = (H - gap * (rows + 1)) / rows;
        vctx.clearRect(0, 0, W, H);

        for (let c = 0; c < cols; c++) {
            const bin = Math.floor((c / cols) * freq.length);
            const level = Math.round((freq[bin] / 255) * rows);
            for (let r = 0; r < rows; r++) {
                const fromBottom = rows - 1 - r;
                const on = freq && fromBottom < level;
                vctx.fillStyle = on ? blockColor(fromBottom, rows) : EMPTY_CELL;
                vctx.fillRect(
                    gap + c * (cw + gap),
                    gap + r * (ch + gap),
                    cw, ch
                );
            }
        }
    }

    drawIdle() {
        const { vctx, viz, cols, rows } = this;
        const W = viz.width, H = viz.height, gap = 2;
        const cw = (W - gap * (cols + 1)) / cols;
        const ch = (H - gap * (rows + 1)) / rows;
        vctx.clearRect(0, 0, W, H);
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                vctx.fillStyle = EMPTY_CELL;
                vctx.fillRect(gap + c * (cw + gap), gap + r * (ch + gap), cw, ch);
            }
        }
    }

    /* ---- teardown ----------------------------------------- */
    destroy() {
        cancelAnimationFrame(this.raf);
        if (this.scroll) this.scroll.destroy();
        try { this.audio.pause(); } catch (_) {}
        this.audio.src = '';
        if (this.actx) { try { this.actx.close(); } catch (_) {} }
    }
}

/* ---- visualizer palette (site pastels, defrag-block style) ---- */
const EMPTY_CELL = 'rgba(138, 111, 125, 0.22)';   // faint plum
function blockColor(fromBottom, rows) {
    const t = fromBottom / (rows - 1);
    if (t < 0.45) return '#7faf93';   // sage near the base
    if (t < 0.8)  return '#c98fa6';   // rose in the middle
    return '#d39b53';                 // gold at the peaks
}

function fmtTime(s) {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
}
