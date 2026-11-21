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

If `npm run upload` says the app name `vault-heist` is taken, pick another short lowercase name (letters, numbers, hyphens) and change `"name"` in both `devvit.json` and `package.json`, then run it again.

Then send the playtest subreddit’s link back so we can set it up as the demo subreddit. Please don’t publish the app during the event; the hackathon rules want it uploaded but not published.
