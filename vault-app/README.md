# VAULT

**Crack tonight’s vaults. Then build one that catches everyone else.**

VAULT is a daily stealth puzzle game for Reddit, built on Devvit Web. Every night the subreddit gets a new post. You sneak through vaults one tile at a time, past patrolling guards, pulsing lasers and turning cameras, to reach the gem. Then you build your own vault from the same box of parts everyone else got tonight, and the rest of the subreddit tries to crack it.

## How to play

**Cracking**

- Swipe, or tap a tile next to you, to move one step. Tap yourself to wait a turn.
- After every move of yours, everything else moves: guards walk their routes, lasers switch on and off, cameras turn.
- Red corners show the tiles that will be watched after your next move. Getting caught is always fair.
- Sneak into a guard **from behind** to knock them out. Walk into their face and you’re caught.
- You carry one **pebble**. Throw it and every guard within 3 tiles turns to look at the noise for two turns.
- Every vault shows the best possible number of moves. Beat it, or match it for a perfect run.

**Tonight’s job:** six house vaults, each teaching one trick, ending in The Core.

**Building**

- Everyone gets the same box of parts tonight (for example 8 walls, 2 guards, 1 camera).
- Place walls, draw guard routes, set laser rhythms and camera sweeps.
- A checker solves your vault as you build. You can’t publish a vault nobody could crack, and it tells you when yours is “a straight walk” or “nasty”.
- Stuck on a blank page? **Surprise me** builds a random vault from tonight’s parts that the checker has already proven crackable.
- Lock it in. Your vault card then shows how many thieves it caught and how many cracked it.

## What makes it Reddit

- The community makes the daily content: every player’s vault is a puzzle for everyone else.
- Red marks on the floor show where other people were caught.
- Deadliest vaults rise to the top of tonight’s list.
- A new post goes up every night automatically.
- Night streaks: crack at least one vault every night to keep yours going (your own vault doesn’t count).
- After a crack or a bust, one tap posts the run to the comments as a GIF, with a caption written by the server from its own replay.

## First time playing

A new player skips the menu and starts in the first vault. Short tips appear on the board at the moment they matter (how to move, what red corners mean, how to knock out a guard, when to throw the pebble), each shown once.

## Fair play

The client sends only its moves. The server replays them with the same rules engine to decide whether you cracked a vault or got caught, so nobody can fake a crack or pad a vault’s numbers. Player vaults are validated against tonight’s parts and re-solved on the server before they go live.

## Development

Requires Node 22+ and the Devvit CLI (`npx devvit login`).

```bash
npm install
npm test               # types, lint, unit tests, build
npm run build
npx devvit playtest    # run it in your test subreddit
npx devvit upload      # upload a new version
```

To try the client in a normal browser with the real server code and an in-memory Redis:

```bash
npm run build && node --experimental-strip-types src/test/devserver.ts 5178
```

- `src/shared/engine.ts`: the rules and a breadth-first solver (shared by client and server)
- `src/shared/vault.ts`: nights, the parts box, house vaults, player vault checks
- `src/server/`: routes (`api/init`, `api/attempt`, `api/publish`), Redis storage, the nightly post
- `src/client/game.js`: the game (canvas), the builder and the job sheet; `music.js` is the adaptive score
- `public/`: page shells and bundled fonts (OFL)

Fonts: Chakra Petch, Inter and DM Mono, under the SIL Open Font License (`public/fonts/OFL.txt`).
