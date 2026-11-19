# VAULT prototype (cracking side)

Playtest build of VAULT's cracking side: sneak through a vault to the gem without being seen. It's turn-based on a small grid. You move one tile, then every guard, laser and camera takes its turn.

This is a throwaway prototype for testing whether cracking is fun. It runs as a claude.ai page with a shared store, so players see where others got caught. The real game will be rebuilt on Devvit Web, with the builder side added.

- `src/engine.js`: the rules and a breadth-first solver. The solver proves a vault can be beaten and finds the fewest moves. The builder will use it to reject impossible vaults.
- `src/levels.js`: five house vaults, all solver-verified
- `src/vault.html`: the page (vanilla JS, canvas, Web Audio)
- `tools/check.js`: solves every vault (`node tools/check.js 4` prints vault 5 turn by turn)
- `tools/build-page.mjs`: inlines the engine and vaults into `build/vault.html`

## Rules
- Swipe or tap a neighbouring tile to move; tap yourself to wait. Arrow keys and space work on desktop.
- **Guards** walk a route back and forth and see 2–3 tiles ahead. Walking into a guard from behind or the side knocks them out; from the front, you're caught.
- **Lasers** switch on and off on a fixed rhythm. A dashed beam means it fires next turn.
- **Cameras** turn every move.
- Red corners mark the tiles that will be watched after your next move.
