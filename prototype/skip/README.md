# SKIP prototype

Playtest build of SKIP: skip a stone across today's lake. Press and hold to pick up the stone, watch its angle rock back and forth, and flick up to throw. Three throws a day. Every skip anyone makes today stays on the lake as a faint ring.

This is a throwaway prototype for testing whether the game is fun. It runs as a claude.ai page with a shared store for the crowd. The real game will be rebuilt on Devvit Web.

- `src/physics.js`: deterministic stone physics (same throw on the same lake gives the same result)
- `src/skip.html`: the page (vanilla JS, canvas, Web Audio)
- `tools/build-page.mjs`: inlines the physics into `build/skip.html`

```bash
cd prototype/skip
node tools/build-page.mjs
```

## How the physics plays
- **Angle of attack** is the main skill. The best is about 20° (Clanet et al., Nature 2004). A few degrees off costs skips; under about 4° or over 45° the stone sinks at once.
- **Flick speed** sets power. A very hard throw lifts the stone's front edge, so full power wants a flatter angle (about 10–13°). That's the hidden skill.
- **Each day** brings its own wind (head or tail, plus crosswind) and water chop, which nudges the stone's angle on each bounce. More spin (a harder throw) keeps it steadier.
- With the current tuning, sloppy throws get 0–8 skips, decent ones 12–16, and a perfect one about 20–24 out to roughly 50 m.
