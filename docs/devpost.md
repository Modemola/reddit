# VAULT: Devpost submission text

Paste-ready text for the Devpost form. Every claim below matches what the app does today; update it if anything changes before submitting.

---

## Project name
VAULT

## Tagline (short)
Crack tonight’s vaults. Then build one that catches everyone else.

## Elevator pitch (one or two sentences)
VAULT is a daily stealth puzzle where the community makes the content. Every night you sneak past guards, lasers and cameras to crack a set of vaults, then build your own from the same box of parts everyone got, and the subreddit tries to break in.

---

## Inspiration
Most daily games are one puzzle for everyone, solved alone. We wanted a daily game where the other players *are* the puzzle. The feeling we were after is the one you get from a level editor: you made something, it’s out in the world while you’re away, and you can’t wait to see how many people it caught. Reddit is the perfect place for that, because a subreddit already plays together every day and loves to argue about how something should have been done.

## What it does
**Every night, a new VAULT post goes up in the subreddit.**

**Crack.** You move one tile at a time through a vault to reach the gem. After every move of yours, everything else moves: guards walk their routes with torches, lasers switch on and off, cameras turn. Red corners mark the tiles that will be watched after your next move, so getting caught always feels fair. Sneak into a guard from behind to knock him out. You carry one pebble: throw it and nearby guards turn to look at the noise for two turns. Every vault shows the best possible number of moves, so a perfect run is something to chase.

**Tonight’s job.** Six house vaults each teach one idea (timing, lasers, the pebble, long sight lines, cameras) and end in The Core, which uses all of them.

**Build.** Everyone gets the same box of parts tonight, for example 8 walls, 2 guards and a camera. You place walls, draw guard routes, set laser rhythms and camera sweeps, and name your vault. A solver checks it live as you build: it won’t let you publish a vault nobody could crack, and it tells you when yours is “a straight walk” or “nasty”. Stuck on a blank page? **Surprise me** builds a random vault from tonight’s parts that the solver has already proven crackable, ready to tweak. One vault per player per night.

**Then the subreddit plays it.** Your vault card shows how many thieves it caught and how many cracked it. Tonight’s list puts the deadliest vaults first. Red marks on the floor show where other people were caught, so every vault carries the history of everyone who tried it.

**Share the moment.** After a crack or a bust, one tap posts the run to the comments as a looping GIF, captioned by the server, for example: “VAULT, Night 2: I cracked The Core in 12 moves (a perfect run).”

## How it’s Reddit-y
- The daily content is made by the community: every player’s vault is a puzzle for everyone else.
- Shared traces: red marks show where people were caught, and the deadliest vaults rise to the top.
- The comments become a highlight reel of cracks and busts, and a place to argue about whose vault is meanest.
- A new post every night, automatically, and a night streak for cracking at least one vault every night.

## Built for a first-time player
A new player never sees a menu first: they land in the first vault, playing. One-line tips appear on the board at the moment they matter (how to move, what red corners mean, how to knock out a guard, when to throw the pebble), each shown once. The six house vaults then teach the rest.

## How we built it
- **Devvit Web**, from Reddit’s bare template: a TypeScript server on Devvit’s Node runtime and a canvas client with no framework.
- **One rules engine shared by client and server.** It is pure and deterministic, with a breadth-first solver that finds the fewest-moves crack (and proves a vault can be cracked at all).
- **Fair play by design.** The client sends only its moves. The server replays them with the same engine to decide whether you cracked a vault or got caught, so nobody can fake a crack or pad a vault’s numbers. Player vaults are validated against tonight’s parts and re-solved on the server before they go live.
- **Redis** stores progress, night streaks, each vault’s caught and cracked counts, and catch marks per tile.
- **Scheduler** creates the nightly post; an install trigger creates the first one.
- **Media upload and rich-text comments** post the GIF of your run.
- **Art and sound made in code.** Oak floors, brick walls and torchlight are drawn procedurally; the night layer is cut by pools of light around each guard’s torch. The adaptive score (a D-minor creep that tightens when danger is next to you, with stings for cracked and caught) and the GIF encoder are written for the game, with no audio or image files. Fonts are bundled (SIL Open Font License).
- **Tests:** unit tests for the engine and the vault rules, and server tests that run the real routes against an in-memory Redis.

## Challenges we ran into
- **Making stealth fair in turns.** Real-time stealth feels unfair on a phone. Turn-based stealth only works if you can read what happens next, so we added next-turn red corners, a guard’s next step, and a flickering beam for a laser about to fire.
- **Guaranteeing player vaults are beatable.** A level editor is only fun if levels can be finished. The solver had to handle guard routes, laser rhythms, camera sweeps, knockouts and pebble distractions, and still answer instantly while you build.
- **Trust.** Leaderboards and “caught 37 thieves” only mean something if they can’t be faked, which is why the server replays every run instead of trusting the client.

## Accomplishments we’re proud of
- A level editor where an impossible level simply can’t be published.
- Every number in the game comes from a replay the server ran itself.
- The pebble: one small tool that changes how both crackers and builders think.

## What we learned
Players forgive a hard puzzle and never forgive an unfair one. Most of our design time went into making the next turn readable.

## What’s next
- Weekly themes for the parts box (an all-laser night, a single-guard night).
- Flair for the builders of the deadliest vaults.
- A season leaderboard for perfect runs.

## Built with
devvit, devvit-web, typescript, javascript, node.js, redis, canvas, web-audio, esbuild

---

## Links to fill in on the form
- App listing: `https://developers.reddit.com/apps/vault-heist` (or the final app name)
- Demo post: link to tonight’s VAULT post in the demo subreddit
- Repository: link to the public repo
- Video: link to the demo video
