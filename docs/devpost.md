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

**Crack.** You move one tile at a time through a vault to reach the gem. After every move of yours, everything else moves: guards walk their routes with torches, lasers switch on and off, cameras turn. Red corners mark the tiles that will be watched after your next move, so getting caught always feels fair. Walk into a guard from behind or from the side to knock them out. You carry one pebble: throw it and nearby guards turn to look at the noise for two turns. Every vault shows the best possible number of moves, so a perfect run is something to chase.

**The Daily Vault.** Every night there's one official vault, the same for everyone. It's built from that night's parts and proven crackable by the solver. It leads the post's feed card and the home screen, ranks the fastest cracks on a leaderboard, and shares as a spoiler-free line like “VAULT Daily #12: cracked in 14 (perfect 12) 🟥🟥🟩”.

**The morning after.** Each new nightly post opens with a recap comment, for example “Last night (Night 8): 14 vaults built, 63 thieves caught. Deadliest: The Pawnshop by u/night_owl, stumped 9 of 11. Daily Vault #8: cracked by 20 of 31; fastest u/quickhands in 12 moves (perfect 12).” Your home screen opens with *Last night*: what your vault did and where you placed.

**Training heist.** Six jobs, each with a one-line brief, teach one idea each (timing, lasers, the pebble, long sight lines, cameras) and end in The Core, which uses all of them.

**Build.** Everyone gets the same box of parts tonight, for example 8 walls, 2 guards and a camera, and twice a week the box has a theme (Laser Night, Double Patrol, All Eyes, Lockdown). You place walls, draw guard routes, set laser rhythms and camera sweeps, and name your vault. A solver checks it live as you build: it won’t let you publish a vault nobody could crack, and it tells you when yours is “a straight walk” or “nasty”. Stuck on a blank page? **Surprise me** builds a random vault from tonight’s parts that the solver has already proven crackable, ready to tweak. One vault per player per night.

**Then the subreddit plays it.** Your vault card shows how many thieves it caught and how many cracked it. Tonight’s list puts the deadliest vaults first (counted in people stumped, not attempts, so nobody can inflate it), and the deadliest of all is featured as **Deadliest tonight**, on the home screen and on the post’s feed card, for example “Stumped 9 of 12 thieves so far.” When you crack someone’s vault you see how you did against everyone else who cracked it, for example “Fewer moves than 70% of the 12 other thieves who cracked it.” Red marks on the floor show where other people were caught, so every vault carries the history of everyone who tried it.

**Share the moment.** After a crack or a bust, one tap posts the run to the comments as a looping GIF, captioned by the server, for example: “VAULT, Night 2: I cracked The Core in 12 moves (a perfect run).”

## How it’s Reddit-y
- The daily content is made by the community: every player’s vault is a puzzle for everyone else.
- Shared traces: red marks show where people were caught, and the deadliest vaults rise to the top.
- The comments become a highlight reel of cracks and busts, and a place to argue about whose vault is meanest.
- Moderators can remove any player vault in two taps.
- A new post every night, automatically, and a night streak for cracking at least one vault every night.

## Built for a first-time player
A new player never sees a menu first: they land in the first vault, playing. One-line tips appear just above the board at the moment they matter (how to move, what red corners mean, how to knock out a guard, when to throw the pebble), each shown once. The six house vaults then teach the rest.

## How we built it
- **Devvit Web**, from Reddit’s bare template: a TypeScript server on Devvit’s Node runtime and a canvas client with no framework.
- **One rules engine shared by client and server.** It is pure and deterministic, with a breadth-first solver that finds the fewest-moves crack (and proves a vault can be cracked at all).
- **Fair play by design.** The client sends only its moves. The server replays them with the same engine to decide whether you cracked a vault or got caught, so nobody can fake a crack or pad a vault’s numbers. Player vaults are validated against tonight’s parts and re-solved on the server before they go live.
- **Redis** stores progress, night streaks, each vault’s caught and cracked counts, catch marks per tile, and a live deadliness ranking, so tonight’s list stays short and fast however many vaults get built.
- **Scheduler** creates the nightly post (named after the theme on themed nights); an install trigger creates the first one, and the two never double up.
- **Media upload and rich-text comments** post the GIF of your run.
- **Kind to phones.** The audio clock stops when the post is scrolled away or muted, the feed card’s animation pauses off screen, and the board’s light layer is drawn at quarter resolution.
- **Art and sound made in code.** Oak floors, brick walls and torchlight are drawn procedurally; the night layer is cut by pools of light around each guard’s torch. The adaptive score (a D-minor creep that tightens when danger is next to you, with stings for cracked and caught) and the GIF encoder are written for the game, with no audio or image files. Fonts are bundled (SIL Open Font License).
- **Tests:** unit tests for the engine and the vault rules, and server tests that run the real routes against an in-memory Redis.

## Challenges we ran into
- **Making stealth fair in turns.** Real-time stealth feels unfair on a phone. Turn-based stealth only works if you can read what happens next, so we added next-turn red corners, a guard’s next step, and a flickering beam for a laser about to fire.
- **Guaranteeing player vaults are beatable.** A level editor is only fun if levels can be finished. The solver had to handle guard routes, laser rhythms, camera sweeps, knockouts and pebble distractions, and still answer instantly while you build.
- **Trust.** Leaderboards and “caught 37 thieves” only mean something if they can’t be faked, which is why the server replays every run instead of trusting the client. It also caps how much one player can move a vault’s public numbers (atomically, so flooding the server doesn’t help), checks every published vault against the builder’s own placement rules, and posts shared runs as rich text so a vault name can’t smuggle in a link.

## Accomplishments we’re proud of
- A level editor where an impossible level simply can’t be published.
- Every number in the game comes from a replay the server ran itself.
- The pebble: one small tool that changes how both crackers and builders think.

## What we learned
Players forgive a hard puzzle and never forgive an unfair one. Most of our design time went into making the next turn readable.

## What’s next
- More themed nights for the parts box (a single-guard night, a camera maze).
- Flair for the builders of the deadliest vaults.
- A season leaderboard for perfect runs.

## Built with
devvit, devvit-web, typescript, javascript, node.js, redis, canvas, web-audio, esbuild

---

## Links to fill in on the form
- App listing: `https://developers.reddit.com/apps/vault-heist` (or the final app name)
- Demo post: link to tonight’s VAULT post in the demo subreddit
- Repository: link to the public repo. **The game lives on the `dev/eager-albattani-c9atvp` branch; `main` is still empty.** Merge it into `main` before submitting (or link the branch directly), so judges who open the repo see the code.
- Video: link to the demo video
