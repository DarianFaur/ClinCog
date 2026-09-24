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
| Course instance | `uvt.clincog.net`, password-gated | Anthropic (author's own key) | the author's own students |

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
ANTHROPIC_API_KEY          course tier (your own students)
ICD_CLIENT_ID
ICD_CLIENT_SECRET
GEMINI_API_KEY_DEMO         demo tier
ICD_CLIENT_ID_DEMO
ICD_CLIENT_SECRET_DEMO
TURNSTILE_SECRET_KEY        bot verification, all tiers
STUDENT_ACCESS_PASSWORD     gates the course instance  
```

## Stack

Cloudflare Workers (compute + static assets + native rate limiting) ·
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
PHQ-9, GAD-7, AUDIT, the dot-probe word list, Inter, DM Mono, Plotly, and the
WHO ICD-11 embedded classification widget. It also records which instruments
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
