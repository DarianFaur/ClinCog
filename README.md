# ClinCog

A teaching platform for *Introduction to Clinical Cognitive Science* seminars.
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
progress live only in that browser, on that device — see `public/help.html`
for the exact guarantees this makes and doesn't make.

## Architecture, briefly

One Cloudflare Worker (`worker.js`) serves both the static site (from
`public/`) and a small API surface (`/api/chat/<case>`, `/api/icd/token`).
There's no separate backend, no database — Cloudflare's static-assets
binding and a single `fetch` handler do both jobs.

The live deployment at `clincog.net` runs three access tiers from that one
Worker, distinguished purely by request hostname and an optional
client-supplied key:

| Tier | Hostname | Model | Who it's for |
|---|---|---|---|
| Demo | `clincog.net` | Gemini (shared, rate-limited) | anyone trying the platform |
| Adopted (BYOK) | `clincog.net` + saved key | Anthropic / Gemini / OpenAI, instructor's own | instructors using their own budget |
| Seminar | `uvt.clincog.net`, password-gated | Anthropic (author's own key) | the author's own students |

If you want your own fully independent instance instead — your own
Cloudflare account, your own domain, your own budget, nothing shared with
`clincog.net` at all — see **[SELF_HOSTING.md](./SELF_HOSTING.md)**. It
assumes no prior technical experience.

If you just want to try the platform with your own API key without
deploying anything, visit [clincog.net/adopt.html](https://clincog.net/adopt.html).

## Repository structure

```
worker.js            the entire backend: routing, model calls, credential
                      resolution across the three tiers, rate limiting,
                      Turnstile verification, ICD-11 OAuth token relay
wrangler.toml         Cloudflare Worker configuration
SELF_HOSTING.md       step-by-step deployment guide for a new instance
public/
  index.html          name-entry gate
  dashboard.html       student's term overview
  {case}-chat.html      conceptualization pages (×4)
  {case}-eval.html      evaluation pages (×4)
  adopt.html          bring-your-own-key form
  about.html, help.html
  storage.js          all client-side state (localStorage) lives here
  chat.js             shared conceptualization chat logic
  icd-select.js       ICD-11 diagnosis search widget
  sidebar.js, nav.js, a11y.js, theme-init.js, reveal.js
  styles.css
```

## Required secrets (for the live three-tier deployment)

Set with `wrangler secret put <NAME>`; see `SELF_HOSTING.md` for a version
of this list scoped to a single self-hosted instance, which needs far
fewer of these.

```
ANTHROPIC_API_KEY          seminar tier (your own students)
ICD_CLIENT_ID
ICD_CLIENT_SECRET
GEMINI_API_KEY_DEMO         demo tier
ICD_CLIENT_ID_DEMO
ICD_CLIENT_SECRET_DEMO
TURNSTILE_SECRET_KEY        bot verification, all tiers
STUDENT_ACCESS_PASSWORD     gates the seminar subdomain
```

## Stack

Cloudflare Workers (compute + static assets + native rate limiting) ·
Anthropic, Google Gemini, and OpenAI APIs (model calls) · WHO ICD-11 API
(diagnosis search) · Cloudflare Turnstile (bot verification).

## License and attribution

Diagnostic criteria in the evaluation pages are reproduced verbatim from
WHO's *Clinical Descriptions and Diagnostic Requirements for ICD-11
(CDDR)*, licensed CC BY-NC-ND 3.0 IGO. ICD-11 classification content is
licensed CC BY-ND 3.0 IGO. See the relevant evaluation page for full
citation.

Originally built by Darian Faur (FPSE, UVT Timișoara) for the
*Introduction to Clinical Cognitive Science* seminar. If you deploy your
own instance, the code carries no restriction on doing so — see
`SELF_HOSTING.md` — attribution in your own deployment's About page is
appreciated but not required.
