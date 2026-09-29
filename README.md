# ClinCog

A teaching platform for clinical psychology and psychopathology courses.
Students work through the same clinical case three times, through three
different lenses — categorical diagnosis, dimensional psychological profile,
and cognitive task performance — to see how the framework you use changes
what you actually see in a patient.

**Live demo:** [clincog.net](https://clincog.net)

---

## What this actually is

For each of four cases, a student:

1. **Conceptualizes** — has an open conversation with a simulated patient
   (an LLM, grounded strictly in a written case file — it cannot invent
   symptoms or details beyond what's documented), then searches ICD-11 and
   commits to a working diagnostic hypothesis.
2. **Evaluates** — rates the same case through three structured
   instruments: ICD-11 diagnostic criteria (reproduced verbatim from the
   CDDR, open-licensed — deliberately not DSM-5/SCID, which are
   copyrighted and incompatible with open publication), a dimensional
   questionnaire (HiTOP-SR), and a self-administered cognitive task
   (MATRICS), then compares that result against their own earlier
   hypothesis.

The four cases: a first psychotic episode (schizophrenia), a major
depressive episode, social anxiety disorder, and alcohol dependence.

Nothing a student types is stored on a server. Names, conversations, and
progress live only in that browser, on that device. The server keeps only a
usage record per reply (time, case, model, token count, no text) and, on the
course instance, how many exchanges each student number has used — see
`public/help.html` for the exact guarantees this makes and doesn't make.

## Architecture, briefly

One Cloudflare Worker (`worker.js`) serves both the static site (from
`public/`) and a small API surface (`/api/chat/<case>`, `/api/icd/token`,
`/api/quota`, `/api/monitor/*`). Every request passes through the Worker
first (`run_worker_first`), so the password gates cover the static pages too.
There's no separate backend: state that has to live on the server is kept
in three Durable Objects (SQLite-backed, available on the free plan):

| Durable Object | Holds |
|---|---|
| `StudentQuota` | one per student and period: exchanges used per case, and per day |
| `SeminarConfig` | the course instance's settings: class list, limits, periods, open/closed, allowed models, class password |
| `UsageMonitor` | one usage record per reply (time, case, model, tokens, cost estimate — no text), kept 90 days and streamed live to the admin console |

The live deployment at `clincog.net` runs four access tiers from that one
Worker, distinguished purely by request hostname and an optional
client-supplied key:

| Tier | Hostname | Model | Who it's for |
|---|---|---|---|
| Demo | `clincog.net` | Gemini (shared, rate-limited) | anyone trying the platform |
| Adopted (BYOK) | `clincog.net` + saved key | Anthropic / Gemini / OpenAI, instructor's own | instructors using their own budget |
| Course instance | `uvt.clincog.net` — student number + class password | Anthropic by default; switchable to Gemini or OpenAI on the console (author's own keys), per-student quotas | the author's own students |
| Admin console | `admin.clincog.net` — admin username + password | Gemini (demo key) | the author: live usage monitoring and seminar settings |

On the course instance each student signs in with their student number as
the username. Every exchange is counted on the server against that number,
so a second device, another browser or restarting progress does not reset
it. The class list, per-student and per-case limits, a daily cap, periods
(counters start from zero in each new period), opening and closing the
interviews, which company plays the patients (Anthropic, Google Gemini or
OpenAI, each with a "fast" and a "thoughtful" model, a key and prices) and
the class password are all managed on the admin console's **Seminar
settings** page — no terminal needed.

The admin console is the same app as `clincog.net` with two extra pages:
**Live monitoring** (its front page: cost, tokens and replies per tier and
per participant, updated live over a WebSocket) and **Seminar settings**.

If you want your own fully independent instance instead — your own
Cloudflare account, your own domain, your own budget, nothing shared with
`clincog.net` at all — see **[SELF_HOSTING.md](./SELF_HOSTING.md)**. It
assumes no prior technical experience.

If you just want to try the platform with your own API key without
deploying anything, visit [clincog.net/adopt.html](https://clincog.net/adopt.html).

## Repository structure

```
worker.js             the entire backend: routing, access gates, model calls,
                      credential resolution across the tiers, quotas, usage
                      metering, seminar settings, rate limiting, Turnstile
                      verification, ICD-11 OAuth token relay, contact form
wrangler.toml         Cloudflare Worker configuration (routes, rate limiters,
                      Durable Objects, vars)
SELF_HOSTING.md       step-by-step deployment guide for a new instance
DESIGN.md             the design system ("Paper & Ink")
public/
  index.html          name-entry gate
  dashboard.html      student's term overview
  progress.html       progress, backup and restore
  {case}-chat.html    conceptualization pages (×4)
  {case}-eval.html    evaluation pages (×4)
  cognitive-*.html, transdiagnostic*.html, icd-glossary.html,
  cddr-guide.html     resource pages
  adopt.html          bring-your-own-key form
  about.html, help.html, contact.html, benchmarks.html
  admin-monitor.*     admin console: live monitoring (admin host only)
  admin-seminar.*     admin console: seminar settings (admin host only)
  tokens.css, components.css, shell.css, alpha-eval.css, report.css
                      design tokens and shared styles
  storage.js          all client-side state (localStorage) lives here
  shell.js            sidebar and top bar shared by every page
  chat.js             shared conceptualization chat logic
  eval-focus.js       the "active postcard" rhythm on the evaluation pages
  eval-memory.js      keeps a student's answers across visits
  charts.js, norms.js severity bars, distribution panels, reference norms
  icd-select.js       ICD-11 diagnosis search widget
  a11y.js, theme-init.js, icons.js, toast.js, reveal.js, try-tasks.js
  fonts/              self-hosted Inter, Newsreader and DM Mono
```

## Required secrets (for the live three-tier deployment)

Set with `wrangler secret put <NAME>`; see `SELF_HOSTING.md` for a version
of this list scoped to a single self-hosted instance, which needs far
fewer of these.

```
ANTHROPIC_API_KEY           course tier (your own students), default provider
GEMINI_API_KEY_SEMINAR      optional: course tier on Gemini (a key can also be
OPENAI_API_KEY_SEMINAR      saved on the console instead)
ICD_CLIENT_ID
ICD_CLIENT_SECRET
GEMINI_API_KEY_DEMO         demo tier and admin console
ICD_CLIENT_ID_DEMO
ICD_CLIENT_SECRET_DEMO
TURNSTILE_SECRET_KEY        bot verification, all tiers
ADMIN_USER, ADMIN_PASSWORD  sign-in for the admin console
STUDENT_ACCESS_PASSWORD     class password, until one is set on the console
STUDENT_IDS                 optional: starting class list (comma-separated);
                            numbers added to it later are added to the list
SPIN_CONTENT                licensed SPIN items (course instance, admin console)
CONTACT_TO, CONTACT_NAME, CONTACT_ROLE, CONTACT_FROM
                            contact form
ADMIN_TOKEN                 optional: quota lookups from a terminal
```

Non-secret settings are `[vars]` in `wrangler.toml`: `STUDENT_CASE_LIMIT`
and `QUOTA_PERIOD` (starting values for the seminar settings),
`GEMINI_FREE_TIER` (whether the demo Gemini key is on the free tier, so the
console shows its cost as $0) and, optionally, `PRICING` (a JSON override of
the per-model prices used for the console's cost estimates; prices set on
the console win over both).

## Stack

Cloudflare Workers (compute + static assets + native rate limiting) ·
Durable Objects with SQLite storage and WebSockets (quotas, seminar
settings, usage monitoring) ·
Anthropic, Google Gemini, and OpenAI APIs (model calls) · WHO ICD-11 API
(diagnosis search) · Cloudflare Turnstile (bot verification).

## Licensing

**Open source code, with clinical content under open non-commercial licenses.**

| What | License |
|---|---|
| Source code — HTML, CSS, JavaScript, Worker, config | [MIT](LICENSE) |
| Vignettes, commentary, instructional text | [CC BY-NC-SA 4.0](LICENSE-CONTENT) |
| Clinical instruments and classification text | their own terms — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |

The three are separate on purpose. You can take the code and build something
else with it under MIT. You can adapt the vignettes for your own teaching if
you keep them non-commercial and share alike. You cannot relicense the WHO
CDDR text or the HiTOP-SR items, because they are NoDerivatives licensed and
belong to their publishers — ClinCog reproduces them verbatim under their
terms and passes those terms on to you.

`THIRD_PARTY_NOTICES.md` lists every reproduced instrument with its source and
licence: CDDR, ICD-11 classification, HiTOP-SR and its substance-use module,
PHQ-9, GAD-7, AUDIT, the dot-probe word list, the SPIN (licensed, never in
this repository), Inter, Newsreader, DM Mono, Plotly, and the WHO ICD-11
embedded classification widget. It also records which instruments
were deliberately removed for being proprietary, so nobody adds them back by
accident.

**Not endorsed by anyone.** ClinCog is not approved, endorsed or reviewed by
the World Health Organization, and is not affiliated with MATRICS/MCCB or with
Cambridge Cognition (CANTAB). The cognitive tasks are re-implementations of
published paradigms written for this project, not the original batteries.

**Educational use only. Not for assessing real people.** Nothing this platform
produces has diagnostic standing.

## Attribution

Built by Darian Faur (FPSE, UVT Timișoara) for teaching clinical
cognitive science; the platform itself is general-purpose. If you deploy your own instance — see
`SELF_HOSTING.md` — attribution on your About page is appreciated but not
required by the MIT license. The CC BY-NC-SA content does require attribution.
