# Message for a possible teammate

Copy, adjust the first line, and send. Below it are the exact steps for them.

---

Hey! I’m entering Reddit’s Game of the Day hackathon (deadline Dec 8, $35k in prizes) with a game called VAULT, and I need a teammate with a Reddit account in good standing.

VAULT is a daily stealth puzzle that runs inside a Reddit post. Every night you sneak past guards, lasers and cameras to crack a set of vaults, then build your own vault from the same box of parts everyone got, and the rest of the subreddit tries to break into it. It’s already built and tested; it just needs to be uploaded from an account in good standing (mine got caught by an automatic spam filter and the appeal is still pending).

What you’d do, about 15 minutes total:
1. Install Node.js (version 22 or newer) and Git, if you don’t have them.
2. Run four commands I’ll send you. They log you into Reddit’s developer tools, upload the app, and set up a test subreddit for it.
3. Be the team member who submits on Devpost (one person submits for the team; you’d be listed as a teammate either way).

You’d be on the team for any prize. Want in?

---

## Steps for the teammate (Windows PowerShell, macOS or Linux)

Get the code:
```bash
git clone -b dev/eager-albattani-c9atvp https://github.com/Modemola/reddit.git
```
```bash
cd reddit/vault-app
```
```bash
npm install
```

Log in to Reddit’s developer tools with your own account:
```bash
npx devvit login
```

Upload the app, then start a test subreddit with it installed:
```bash
npm run upload
```
```bash
npm run playtest
```

The app is registered as `vault-heist-game` (https://developers.reddit.com/apps/vault-heist-game), with the playtest subreddit r/vault_heist_game_dev. To ship an update, from `reddit/vault-app` run `git pull` then `npm run upload`. If `git pull` complains that `devvit.json` has local changes, run `git checkout -- devvit.json` and pull again.

### Check that it worked (5 minutes, on your phone and on a computer)
Installing the app posts tonight’s VAULT in the test subreddit by itself. If no post shows up, open the subreddit’s menu (the `…` or mod tools) and choose **VAULT: post tonight’s vaults**.

1. **The feed card.** In the subreddit feed, the post shows a dark card with “VAULT”, the night number and a **Start the heist** button. It should be tall (about half a phone screen), not a thin strip, and never flash white while loading.
2. **First run.** Tap **Start the heist**. You should land straight in vault 1, *The Lobby*, with a tip above the board. Swipe up twice: a guard catches you and a **CAUGHT** card appears.
3. **The GIF comment.** On the CAUGHT card, tap **Post this bust in the comments**. A comment from your account should appear on the post with a short looping GIF of the run.
4. **Build.** Go home (tap VAULT top left), tap **Build tonight’s vault**, then **Surprise me**, then **Lock it in**. Your vault appears under *Your vault*.
5. **Sound.** Tap the screen once; music should start quietly. Scroll the post away and it stops.

If any step looks wrong, send a screenshot of it.

Then send the playtest subreddit’s link back so we can set it up as the demo subreddit. Please don’t publish the app during the event; the hackathon rules want it uploaded but not published.
