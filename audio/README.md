# audio/

Tracks for the **brain_defrag** media player live here.

## Adding songs

1. Drop an audio file in this folder, e.g. `audio/midnight.mp3`.
   - MP3 is safest for browser support. ~112kbps is plenty for mellow tracks
     and keeps the repo lean.
2. Add an entry to the `DEFRAG_TRACKS` array at the top of [`../defrag.js`](../defrag.js):

   ```js
   const DEFRAG_TRACKS = [
       { title: 'Midnight',
         artist: 'Some Artist',
         src: 'audio/midnight.mp3',
         link: 'https://open.spotify.com/track/...' },  // optional ↗ to full track
   ];
   ```

`title` and `artist` show in the player; `src` is the path relative to the
site root; `link` is optional and renders a small ↗ that opens the full track
in a new tab.

## Notes

- The player uses `preload="none"`, so audio only downloads when someone hits
  play — opening the window costs nothing.
- The block visualizer reads the audio via the Web Audio API. Because these
  files are same-origin (served from this repo), no CORS setup is needed.
- If this ever grows or the repo gets heavy, the files can be moved to object
  storage (e.g. Cloudflare R2) and `src` swapped to absolute URLs — no other
  code changes required.
