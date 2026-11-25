# Idea research: Reddit Game of the Day 2026

## 1. Lessons from KEPT (Identity_md)
KEPT didn't lose on craft. It has 221 tests, live contracts, a raw-WebGL swarm scene, view transitions and a share-card API. It lost on legibility:
- **You couldn't get it in 10 seconds.** Vault, oracle, EIP-712, v4 hook, Referee Fund: a judge needed crypto background and a wallet before anything felt good.
- **The scope sprawled.** V2 vault, bonds, markets, a testnet kit, outreach. Effort went wide instead of into one perfect moment.
- **There was no emotional peak.** Nothing made a judge laugh, gasp, or want to show someone.

**Rule for this hackathon:** a judge opens one Reddit post on their phone. In the first 10 seconds they must know what to do, and within 60 seconds they must hit a "whoa" moment. Everything else is secondary.

## 2. The competition baseline
Public 2026 entries (e.g. GaiaSG94's Tournee, Dispatch, Boustrophedon, Faucille) follow one template: a solo puzzle, the same for everyone, a UTC seed, a per-user streak in Redis, React + Hono. They're competent, but the crowd plays no part. Most of the field will look like this.
**To stand out, the community has to be part of the game,** not just a leaderboard bolted on.

## 3. What Reddit has that no other platform has
Millions of strangers answering the same thing on the same day, then arguing in the comments. Past Reddit hits (r/place, r/hotandcold) work because the crowd is part of the mechanic.

## 4. Finalists

### A. THE JAR (recommended)
> Guess how many are in today's jar. Then find out if you're smarter than all of Reddit combined.

- **The science hook:** In 1906 Francis Galton found the median of 787 fairgoers' guesses of an ox's weight was within 1%. Wisdom of the crowd is real, and it makes a great story for judges.
- **Daily loop:** A new jar every day. Rotate it in 3D, shake it, set one guess with a dial, lock it in.
- **The reveal:** The jar tips and pours. Items are counted in a fast, satisfying cascade. Your guess, the truth, and **the Hive** (the community median) land on a live histogram of every guess.
- **The rivalry:** You vs the Hive. "You beat the Hive 4 days in a row." The Hive has its own season record. The crowd becomes a character without being Reddit-themed.
- **Variety:** Gumballs, rubber ducks, dice, mixed sizes, hollow cores, "Double Jar Sunday", and a weekly "Mystery Jar" whose contents are hidden until the pour.
- **Reddit-y:** A one-tap comment draft (`🫙 412 · off 3% · beat the Hive`), accuracy flair tiers (Eyeball → Hawk → Oracle), and debate about strategy in the comments.
- **Onboarding:** One dial and one button. No text needed.
- **Build risk:** Medium-low. The count is generated, so it's always exact. Instanced 3D or 2.5D physics is a known quantity.

### B. HIDEOUT (UGC hide-and-seek)
Every day there's a new illustrated scene. You find the objects that yesterday's best hiders hid, then hide your own for tomorrow. "Only 2% of seekers found your spot" earns Ghost flair, and a heatmap shows everyone's search taps.
- Very novel and funny, and the content is endless and community-made.
- **Risk:** It needs rich scene art every day, and it starts cold (a judge alone in an empty subreddit). High build risk.

### C. LONELY (the minority game)
Each day there's one choice, and you win by picking what the *fewest* people pick, or by guessing "2/3 of the average" on a 0–100 scale. Results resolve tomorrow.
- Real game theory, pure community, and resolving tomorrow builds in a reason to return.
- **Risk:** Little visual spectacle, and a judge gets no payoff on the first play.

## 5. Why A wins on each criterion
| Criterion | THE JAR |
|---|---|
| Delightful UX | One gesture, a physical toy feel, and a spectacular pour-and-count reveal |
| Polish | Small scope, so all the time goes into feel, sound and the result card |
| Reddit-y | The crowd *is* the opponent; comments become strategy debate |
| Daily content | Infinite procedural jars with weekly twists; the Hive's season record |
