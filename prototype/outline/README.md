# OUTLINE prototype

Playtest build of OUTLINE: draw today's place from memory, see how close you got, then see everyone's drawings and the crowd's combined shape.

This is a throwaway prototype for testing whether the game is fun. It runs as a claude.ai page with a shared store for the crowd. The real game will be rebuilt on Devvit Web.

- `src/outline.html`: the page (vanilla JS, canvas)
- `tools/build-shapes.mjs`: turns Natural Earth GeoJSON into normalized outlines
- `tools/build-page.mjs`: inlines the shapes into `build/outline.html`

```bash
cd prototype/outline
node tools/build-shapes.mjs data-src build/shapes.json
node tools/build-page.mjs
```

`data-src/` (the raw Natural Earth files) is not committed. Download `ne_50m_admin_0_countries.geojson` and `ne_50m_lakes.geojson` from github.com/nvkelso/natural-earth-vector into it.

Scoring: your line is closed into a shape, resized and moved to its best fit (size and position don't matter), then compared with the real outline by area overlap (intersection over union). Peeking multiplies the score by 0.85.
