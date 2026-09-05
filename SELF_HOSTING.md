# How to host your own copy of ClinCog

This guide takes you from zero — no account, no code, no technical
background — to a fully working, completely independent copy of ClinCog:
your own API key, your own domain, entirely separate from any other
installation of the platform. Nothing routes through `clincog.net` — you
have full control, and you're the only one who ever sees your key.

The first time through takes roughly 30-45 minutes, most of it spent
downloading things and waiting on external services (Cloudflare, WHO). No
programming experience is required — just the patience to copy commands
exactly as written.

---

## What you'll end up with

- Your own site, at an address like `your-name.workers.dev` (free,
  immediate) — or your own domain, if you have one.
- Your own Anthropic key, billed to you, used only by your instance.
- Full control: change anything, turn anything off, depend on no one.

## Quick glossary — terms you'll run into

No need to memorize these, just to recognize them when they show up:

- **Terminal** — a window where you type text commands instead of clicking
  buttons. On Mac it's called "Terminal" (Launchpad → Other). On Windows,
  use "PowerShell" (search from the Start menu).
- **Command** — a line of text you type (or paste) into the terminal and
  press Enter on. The terminal runs whatever it says.
- **npm** — a tool that installs other tools. It comes bundled with
  Node.js (Step 1).
- **Cloudflare Worker** — the "server" that runs your code. You're not
  hosting anything on your own computer; Cloudflare runs it, free, at the
  scale of a single class.
- **Secret** — an API key or password, stored securely by Cloudflare,
  never visible in the code or on the public internet.

---

## Step 1 — Install Node.js

Node.js is what gives you access to `npm` (the next step).

1. Go to **[nodejs.org](https://nodejs.org)**.
2. Download the recommended ("LTS") version for your system.
3. Open the downloaded file and follow the installer (Next → Next →
   Install, nothing special to check or uncheck).
4. Open a terminal (see the glossary above) and type:
   ```
   node --version
   ```
   If you see something like `v22.x.x`, you're set. If you get a "command
   not found" error, close and reopen the terminal (it sometimes needs a
   restart to pick up a newly installed program) and try again.

## Step 2 — Download the ClinCog code

1. Go to the project's GitHub page (the link the author gave you).
2. Find the green **"Code"** button → **"Download ZIP"**.
3. Unzip the downloaded file somewhere easy to find — for example,
   directly on your Desktop, in a folder called `clincog`.

## Step 3 — Create a Cloudflare account

1. Go to **[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)**.
2. Create a free account (email + password). No card needed, no paid
   plan — everything below works on the free tier.
3. Confirm your email if asked.

## Step 4 — Open a terminal in the right folder

1. Open a terminal.
2. Type `cd ` (with a trailing space), then **drag the `clincog` folder**
   (the one you unzipped in Step 2) directly into the terminal window —
   the path fills in automatically. Press Enter.
   - On Mac, this looks something like:
     `cd /Users/yourname/Desktop/clincog`
   - On Windows, something like:
     `cd C:\Users\yourname\Desktop\clincog`
3. Confirm you're in the right place:
   ```
   ls
   ```
   (on Windows: `dir`) — you should see files like `worker.js` and
   `wrangler.toml` in the list.

## Step 5 — Install and connect Wrangler

Wrangler is the tool that sends your code to Cloudflare.

1. In the terminal, type:
   ```
   npm install -g wrangler
   ```
   Wait for it to finish (can take 1-2 minutes).
2. Connect it to your Cloudflare account:
   ```
   wrangler login
   ```
   A page opens in your browser — click "Allow". Come back to the
   terminal, where you should see a success message.

## Step 6 — Get your own Anthropic key

1. Go to **[console.anthropic.com](https://console.anthropic.com)** and
   create an account if you don't have one.
2. Add a payment method (Anthropic has no permanent free tier, but the
   cost for a single class is small — see the budget note below).
3. From the menu, go to **API Keys** → **Create Key**. Give it any name
   (e.g. "ClinCog") and copy the generated key — it looks like
   `sk-ant-...`. **Copy it now** — some consoles won't show it again.
4. **Budget recommendation**: in the same Console, find the
   Billing/Limits section and set a monthly spending cap (e.g. $20-30,
   plenty for a class), plus an alert at 50-90% of that cap — so you're
   never surprised by an unexpected bill.

## Step 7 — Change one line of code before deploying

The original code has a specific subdomain hardcoded
(`uvt.clincog.net`), used to decide which API key to use. On **your**
instance, that subdomain will never exist — so without this step, your
platform would silently fall back to a heavily rate-limited "demo" tier,
even for your own students. Let's fix that now.

1. Open the `clincog` folder in any plain text editor — if you don't have
   one you prefer, [VS Code](https://code.visualstudio.com) is free and
   simple to install.
2. Open the file **`worker.js`**.
3. Find (Ctrl+F / Cmd+F) the line:
   ```
   const STUDENT_HOSTNAME = "uvt.clincog.net";
   ```
4. Replace `"uvt.clincog.net"` with whatever domain you'll actually be
   using — if you don't have your own domain yet, put anything for now,
   for example:
   ```
   const STUDENT_HOSTNAME = "clincog-mycollege.workers.dev";
   ```
   (you'll see your exact address in Step 10 — if needed, you can come
   back and correct this line afterward, then redeploy.)
5. Save the file.

With this one line fixed, your **entire** platform will automatically use
your own Anthropic key, generously, without you ever needing to think
about the demo tier, Gemini, or BYOK — those stay relevant only to the
original instance at `clincog.net`.

## Step 8 — Simplify `wrangler.toml`

Open **`wrangler.toml`** in the same folder. Delete the whole
`routes = [ ... ]` block (the few lines mentioning `clincog.net`,
`www.clincog.net`, `uvt.clincog.net`) — those are the original author's
domains, not yours. Without that block, Cloudflare automatically gives
you a free address like `project-name.your-account.workers.dev` — perfect
to start with; you can add your own domain later (Step 11).

You can also delete the `CHAT_RATE_LIMITER_DEMO` block — it exists only
to protect the original demo tier's Gemini budget, which doesn't apply to
your instance at all.

Your file should look something like this afterward:
```toml
name = "clincog"
main = "worker.js"
compatibility_date = "2026-08-01"

workers_dev = true
preview_urls = true

[[ratelimits]]
name = "CHAT_RATE_LIMITER"
namespace_id = "1001"
simple = { limit = 200, period = 60 }

[[ratelimits]]
name = "ICD_RATE_LIMITER"
namespace_id = "1002"
simple = { limit = 200, period = 60 }

[assets]
directory = "./public"
binding = "ASSETS"
```

## Step 9 — Set your key as a secret, then deploy

Back in the terminal (make sure you're still in the `clincog` folder):

1. Set the Anthropic key:
   ```
   wrangler secret put ANTHROPIC_API_KEY
   ```
   You'll be asked to paste the key (from Step 6) — paste it and press
   Enter. It won't show on screen as you paste it — that's normal, a
   security measure.
2. Deploy for the first time:
   ```
   wrangler deploy
   ```
   Wait a few seconds. At the end, the terminal shows your live address —
   something like:
   ```
   https://clincog.your-account-name.workers.dev
   ```

## Step 10 — Test it

Open the address from Step 9 in a browser. You should see ClinCog's start
screen. Enter a name, open a case, try a conversation with the patient —
if you get a reply, everything's working.

If you didn't already know your exact address for Step 7, you do now — go
back, correct the line in `worker.js` with the real address you got here,
save, and run `wrangler deploy` again (no need to repeat the secret step —
that one stays set).

## Step 11 (optional) — Your own domain

If you already have a domain (bought separately, or one from your
university), you can attach it to the Worker:

1. In [dash.cloudflare.com](https://dash.cloudflare.com), add your domain
   as a new site in Cloudflare (if it isn't already there).
2. Go to Workers & Pages → your worker → Settings → Domains & Routes →
   Add → Custom Domain, and enter the domain you want.
3. Wait a few minutes for DNS to propagate.

## Step 12 (optional, but recommended) — Extra protections

The original platform includes protection against automated traffic
(rate limiting, already present by default) and bot verification
(Turnstile). Turnstile is optional for a small, controlled class, but
recommended if your link might circulate publicly:

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile → Add
   widget manually → type **Invisible** → note down the Site Key and
   Secret Key.
2. In `public/chat.js`, find the line `TURNSTILE_SITE_KEY = "..."` and
   replace it with your Site Key.
3. In the terminal: `wrangler secret put TURNSTILE_SECRET_KEY`, paste
   your Secret Key.
4. `wrangler deploy` again.

If you'd rather skip this step for now, the platform works normally
without it — just without the extra anti-bot layer.

## If you also want the ICD-11 diagnosis search widget

Requires a separate, free registration with WHO:

1. **[icd.who.int/icdapi](https://icd.who.int/icdapi)** → register → get
   a `client_id` and `client_secret`.
2. In the terminal:
   ```
   wrangler secret put ICD_CLIENT_ID
   wrangler secret put ICD_CLIENT_SECRET
   ```
3. `wrangler deploy`.

Without this step, the rest of the platform works normally — only the
"pick a probable diagnosis" step between conceptualization and evaluation
won't return search results.

---

## If something goes wrong

- **"command not found" on any command** — close and reopen the
  terminal, then try again (it sometimes needs to "notice" a newly
  installed program).
- **`wrangler deploy` complains about a missing secret** — you likely
  skipped Step 9(1); run `wrangler secret put ANTHROPIC_API_KEY` again.
- **The site opens, but the patient conversation doesn't reply** — check
  Cloudflare Dashboard → Workers & Pages → your worker → Logs for the
  exact error (often a mistyped Anthropic key, or no credit left on the
  account).
- **Anything else** — open an Issue on the project's GitHub page,
  describing exactly which command you ran and what message you got.
