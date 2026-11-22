# VAULT: demo plan

How a judge meets VAULT, how to make the demo subreddit ready for that, the video, and the schedule to the deadline.

**Deadline:** Dec 8, 2026, 6:00 pm PT. Judging runs Dec 9–16.
**Blocker today:** the Reddit account that owns the app must be in good standing (appeal pending). Nothing below needs an account until "Upload and playtest".

---

## 1. What a judge does in the first 60 seconds

Judges open one post, usually on a phone, often without reading anything first. That minute has to land on its own.

| Time | What they see | What has to be true |
|---|---|---|
| 0–5 s | The feed card: VAULT wordmark on brick, “Sneak past guards, lasers and cameras to crack tonight’s vaults. Then build one that catches everyone else.” and a line like “12 vaults built tonight · 87 thieves caught”. | Real activity in the demo subreddit, so those numbers aren’t zero (see section 3). |
| 5–10 s | They tap **Start the heist** and land in vault 1, playing. A tip just above the board says how to move. | First-run start works on Reddit (it does locally). |
| 10–40 s | They get caught once, read “A guard spotted you on move 2.” and see the guard’s “Got you!”, retry, read the red corners, and crack it. | The Lobby takes most people 2–3 tries. Keep it that way. |
| 40–60 s | The crack screen offers “Post this crack in the comments”. They see the comments full of other people’s GIFs. | Several real GIF comments already on the demo post. |

If they keep going: vault 3 (Loose Change) shows off the pebble, The Core shows everything at once, and **Tonight’s vaults** shows the community part, which is the real hook.

---

## 2. Demo subreddit setup

Create it once the account is cleared (playtest makes one, or create your own and install the app there).

- **Name:** short and obvious, for example r/VaultNight or r/VaultHeistGame (whatever is free). Keep it under 200 members, as the rules prefer.
- **Public**, so judges can read and play without joining. If you need to approve posts, use the admin-approve helper app the hackathon mentions.
- **Description:** “A new VAULT every night. Crack the vaults, then build one that catches everyone else.”
- **Pinned:** tonight’s VAULT post (the app creates one every night just after midnight UTC). Re-pin the newest one before judging starts on Dec 9.
- **Rules (short):** be kind in vault names; no spoilers in titles; post your busts proudly.
- **Do not publish the app** during the event. Keep it in playtest or private upload, as the rules require.

---

## 3. Real players before judging (most important)

A community game judged in an empty room looks like a single-player game. The fix is real people, early, and never fake data or extra accounts.

- **Who:** friends, classmates, other hackathon entrants (r/Devvit and the Devvit Discord have people who playtest each other’s games), anyone who likes puzzles.
- **What to ask:** “Play tonight’s VAULT and build one vault. Takes 5 minutes.” Ask them to post one crack or bust to the comments.
- **When:** start as soon as the app is up, and aim for 3 nights of activity before Dec 8, so each night has 10+ vaults and the stats on the feed card are real.
- **Your own part:** build a vault every night. Make at least one that’s genuinely nasty so “deadliest” has a story.
- **Watch for:** vaults that are too easy (the checker already warns “a straight walk”), confusing moments testers mention, anything that breaks on a real phone. Send those to Claude to fix.

---

## 4. Demo video (about 2 minutes)

Optional on the form, but it’s the one thing every judge watches. Record on a phone in portrait with screen recording on and sound on (the music matters).

| Time | Shot | Voiceover (say it in your own words) |
|---|---|---|
| 0:00–0:08 | The feed card in the subreddit, then tap Start. | “This is VAULT, a daily stealth puzzle on Reddit where the other players are the puzzle.” |
| 0:08–0:30 | Vault 1: move, get caught once (“Got you!”), retry using the red corners, crack it. | “You move one tile, then everything else moves. Red corners show what’s watched next turn, so getting caught is always your fault.” |
| 0:30–0:45 | Loose Change: aim the pebble, the guard turns with “Who’s there?”, sneak past and knock them out. | “You carry one pebble. Throw it and guards turn to look.” |
| 0:45–1:15 | Builder: place walls, draw a guard route, the checker says “Impossible right now” then “A real puzzle”, lock it in. | “Then you build one. Everyone gets the same parts tonight, and the game won’t let you publish a vault nobody could crack.” |
| 1:15–1:35 | Home: your vault card (“14 busts · 3 cracks”), tonight’s list, a vault with red marks on the floor. | “Your vault goes live for the whole subreddit. Red marks show where people were caught. The deadliest vaults rise to the top.” |
| 1:35–1:50 | Post a crack to the comments; scroll the comments full of GIFs. | “Every crack or bust becomes a GIF in the comments.” |
| 1:50–2:00 | The feed card again. | “A new VAULT every night. Crack it, then build one that catches everyone else.” |

Fallback footage: a silent, scripted 75-second take of exactly these shots (recorded from a local test server, so the numbers are test players, not the real subreddit) exists from Nov 22. Use it as b-roll or as a shot guide; the real recording should come from the demo subreddit with sound on.

Tips: record each section separately and cut them together; keep the music audible under the voice; show real community numbers, not a fresh empty subreddit.

---

## 5. Submission checklist

- [ ] Account cleared (appeal) or a teammate’s account owns the app
- [ ] `npm run upload` and `npm run playtest` work; app name final
- [ ] Tested on a real phone: fonts, music after first tap, swipe, first-run start, posting a GIF comment
- [ ] Demo subreddit public, tonight’s post pinned, real players for 3+ nights
- [ ] Devpost text from `docs/devpost.md`, links filled in
- [ ] README in the repo (`vault-app/README.md`) describes the game and how to play
- [ ] Demo video uploaded and linked
- [ ] Repo public (optional but helps)
- [ ] Developer survey done (for the Feedback award)
- [ ] Submitted before Dec 8, 6:00 pm PT; no app updates after that

---

## 6. Schedule

| Dates | Goal |
|---|---|
| Now until the account clears | Appeal. Claude keeps polishing (anything that doesn’t need the account). |
| Day 1 after clearing | Upload, playtest, fix whatever breaks on real Reddit. |
| Days 2–4 | Recruit players, run 3 real nights, fix what they hit. |
| Dec 5–6 | Record the video, write the final Devpost text, re-check the checklist. |
| Dec 7 | Submit (a day early on purpose). |
| Dec 8 | Buffer only. Don’t change the uploaded app after submitting. |

If the account isn’t cleared by about **Dec 1**, switch to a teammate’s account in good standing so there’s still time for real nights of play.
