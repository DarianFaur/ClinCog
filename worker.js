import { DurableObject } from "cloudflare:workers";

// ============================================================================
// worker.js
//
// One Worker, two jobs:
//   1. Serve the static site (index.html, chat pages, styles, eval pages)
//      from /public, via env.ASSETS.
//   2. Answer POST /api/chat/<module> by calling the Anthropic API, with the
//      model impersonating that week's patient in first person.
//
// The API key is never in this file - it's a Cloudflare "secret", injected
// as env.ANTHROPIC_API_KEY at runtime.
// ============================================================================

// ---- Case files -----------------------------------------------------------
// Keep these in sync with the "Case summary" box on each *-chat.html page -
// they should describe exactly the same facts, just written for two
// different audiences (the student reads the HTML version; the model reads
// this one as its only source of truth).

// ---- Case files --------------------------------------------------------------
// The simulated patient is grounded in exactly the vignette students read.
// Both come from public/vignettes.json; the Worker fetches it from its own
// static assets rather than keeping a copy, because the copy it used to keep
// had drifted into a different, shorter text for every case.
let _vignetteCache = null;
async function loadVignettes(env, requestUrl) {
  if (_vignetteCache) return _vignetteCache;
  const res = await env.ASSETS.fetch(new Request(new URL('/vignettes.json', requestUrl)));
  if (!res.ok) throw new Error('vignettes.json unavailable: ' + res.status);
  const data = await res.json();
  const out = {};
  for (const [id, v] of Object.entries(data)) {
    if (id.startsWith('_') || !v || !Array.isArray(v.sections)) continue;
    out[id] = {
      name: v.name,
      text: v.sections.map(sec => sec.title.toUpperCase() + '\n' + sec.text).join('\n\n'),
    };
  }
  _vignetteCache = out;
  return out;
}

// ---- System prompt builder --------------------------------------------------

function buildSystemPrompt(vignette) {
  return `
You are role-playing as ${vignette.name}, a patient in a clinical training
exercise for undergraduate psychology students. Stay fully in character and
respond in first person, the way ${vignette.name} would actually speak in a
first clinical session - naturally, briefly (2-4 sentences), not as a
narrator summarizing a case file.

You may ONLY draw on the facts in the case file below. Never invent new
symptoms, events, dates, relationships, or details that aren't there. If the
student asks about something the case file doesn't cover, respond the way a
real patient plausibly would when asked something they haven't thought about
or don't want to get into - for example, "I haven't really thought about
that" or "I'd rather not get into that right now" - without inventing new
clinical content to fill the gap.

Non-negotiable safety boundaries, even in character:
- Never describe methods, plans, or step-by-step detail related to suicide
  or self-harm beyond exactly what is stated in the case file.
- Never escalate risk content beyond the case file - do not add new crisis
  details, intentions, urgency, delusional targets, or conspiratorial
  detail that isn't already there.
- If the case file mentions sensitive material (thoughts of death,
  self-harm, paranoid or persecutory beliefs, hallucinations), present it
  matter-of-factly, exactly as documented, without dramatizing or
  elaborating on it.
- If a student's question would require inventing or elaborating on
  self-harm, suicide, or delusional/paranoid detail beyond the case file,
  stay in character but decline or deflect the way that patient plausibly
  would (e.g. "I don't really want to get into more detail about that", or
  becoming guarded and changing the subject if that fits the presentation)
  rather than generating new content.

CASE FILE:
${vignette.text}
`.trim();
}

// ---- ICD-API OAuth token cache ---------------------------------------------
// WHO's ICD-API uses client_credentials OAuth2. The client_id/client_secret
// must never reach the browser, so the ECT widget on the frontend is
// configured with a getNewTokenFunction() callback that calls OUR /api/icd/token
// route instead - only the token itself (not the secret) goes to the browser.
// Tokens last ~1h; this in-memory cache avoids re-authenticating on every
// search. Keyed by client_id since three different credential sets can be
// in play (student / demo / an adopting instructor's own WHO account) -
// each gets its own cached token, not sharing a single global slot.
// It's a plain Map rather than KV, which means it only helps within a warm
// isolate (not guaranteed across cold starts or different edge locations) -
// a reasonable tradeoff for this traffic level, not a production-grade cache.
const icdTokenCache = new Map();

async function getIcdToken(clientId, clientSecret) {
  const cached = icdTokenCache.get(clientId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const tokenResponse = await fetch("https://icdaccessmanagement.who.int/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: "grant_type=client_credentials&scope=icdapi_access",
  });
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("ICD-API token error:", errorText);
    throw new Error("ICD-API authentication failed");
  }
  const data = await tokenResponse.json();
  // Subtract a 60s safety margin so we never hand out a token that expires
  // mid-search.
  icdTokenCache.set(clientId, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

// ---- Three-tier credential resolution --------------------------------------
// ClinCog runs on three fronts, all served by this same Worker:
//   - uvt.clincog.net    -> the author's own students. My keys, generous limits.
//   - clincog.net (root) -> journal readers / instructors trying the demo.
//                           My keys too, but a SEPARATE pair from the student
//                           ones, and a much stricter rate limit.
//   - clincog.net + BYOK -> an instructor who has "adopted" the platform and
//                           entered their own Anthropic + WHO credentials in
//                           the browser (see adopt.html). Those keys are sent
//                           with each request and used for that call only -
//                           never stored server-side, never logged.
const STUDENT_HOSTNAME = "uvt.clincog.net";
// The author's own console: the same app as clincog.net (Gemini, demo
// keys), behind its own username and password, with live usage monitoring
// as its first page. ADMIN_USER / ADMIN_PASSWORD are secrets; without them
// the host lets nobody in.
const ADMIN_HOSTNAME = "admin.clincog.net";

const SUPPORTED_BYOK_PROVIDERS = new Set(["anthropic", "gemini", "openai"]);

// Whitelisted per provider, so a BYOK request can only ever select a model
// we've actually verified exists and behaves reasonably - never an
// arbitrary string passed through untouched.
const ALLOWED_MODELS = {
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5"],
  gemini: ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.1-pro"],
  openai: ["gpt-5-nano", "gpt-5.6-terra", "gpt-5.6-sol"],
};

function resolveModelCredentials(hostname, byok, studentModel, env) {
  if (hostname === ADMIN_HOSTNAME) {
    return { provider: "gemini", key: env.GEMINI_API_KEY_DEMO, tier: "admin" };
  }
  if (hostname === STUDENT_HOSTNAME) {
    // Provider, key and model come from the seminar settings (chat route).
    return { provider: null, key: null, model: undefined, tier: "student" };
  }
  if (byok && byok.llmProvider && byok.llmKey && SUPPORTED_BYOK_PROVIDERS.has(byok.llmProvider)) {
    const allowed = ALLOWED_MODELS[byok.llmProvider];
    const model = allowed.includes(byok.llmModel) ? byok.llmModel : undefined; // undefined -> function's own safe default
    return { provider: byok.llmProvider, key: byok.llmKey, model, tier: "adopted" };
  }
  // The demo tier runs on Gemini rather than Anthropic - a deliberate cost
  // choice for the free public-facing tier, kept entirely separate from
  // the Anthropic keys used for the author's own students and for any
  // instructor who adopts with their own key. No model choice here by
  // design - fixed to gemini-3.5-flash (the function's own default).
  return { provider: "gemini", key: env.GEMINI_API_KEY_DEMO, tier: "demo" };
}

function resolveIcdCredentials(hostname, byok, env) {
  if (hostname === STUDENT_HOSTNAME) {
    return { clientId: env.ICD_CLIENT_ID, clientSecret: env.ICD_CLIENT_SECRET, tier: "student" };
  }
  if (byok && byok.icdClientId && byok.icdClientSecret) {
    return { clientId: byok.icdClientId, clientSecret: byok.icdClientSecret, tier: "adopted" };
  }
  return { clientId: env.ICD_CLIENT_ID_DEMO, clientSecret: env.ICD_CLIENT_SECRET_DEMO, tier: "demo" };
}

// ---- Turnstile verification --------------------------------------------
// Confirms the request came from a real browser that solved (invisibly)
// Cloudflare's challenge, before we spend an Anthropic API call on it.
async function verifyTurnstile(token, ip, env) {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return false;
  }
}

// ---- Contact form ----------------------------------------------------------
// Mail goes out through Cloudflare Email Routing's send_email binding rather
// than a third-party provider: the destination is a single address verified
// on the account, which is free on every plan and exempt from sending quotas.
// The binding in wrangler.toml is pinned to that address, so this code cannot
// send anywhere else regardless of what arrives in the request body.

// RFC 5322 wants a numeric zone offset. Date.toUTCString() ends in "GMT",
// which is the obsolete form - accepted by most parsers, but it is one more
// thing for a filter to score against a message it does not already trust.
function rfc5322Date(d) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n) => String(n).padStart(2, "0");
  return days[d.getUTCDay()] + ", " + p(d.getUTCDate()) + " " + months[d.getUTCMonth()] +
         " " + d.getUTCFullYear() + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) +
         ":" + p(d.getUTCSeconds()) + " +0000";
}

// Header values must be ASCII. A subject or display name containing a
// Romanian diacritic would otherwise go out as raw 8-bit bytes in a header,
// which is invalid and a reliable way to be scored as spam. RFC 2047
// encodes it instead.
function encodeHeaderWord(value) {
  const text = String(value || "");
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return "=?UTF-8?B?" + btoa(binary) + "?=";
}

// base64 with the 76-character line wrapping the format requires.
function base64Body(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return (btoa(binary).match(/.{1,76}/g) || []).join("\r\n") + "\r\n";
}

// The three pieces of identity the contact page needs. Secrets rather than
// [vars] because vars live in wrangler.toml, which is committed - putting
// them there would leave the original author's details in the repository,
// which is the problem this is solving.
function contactAddress(env) {
  const value = String(env.CONTACT_TO || "").trim();
  return isEmail(value) ? value : "";
}

// The envelope sender has to sit on a domain this Cloudflare account can
// sign for. Deriving it from the DESTINATION was wrong: the destination is
// usually somewhere else entirely - a university mailbox - and mail claiming
// to come from a domain you do not control fails authentication outright.
// So it comes from the hostname the request arrived on, which is by
// definition a zone on this account, and CONTACT_FROM overrides that when
// the sending domain differs from the one serving the site.
function contactSender(env, hostname) {
  const configured = String(env.CONTACT_FROM || "").trim();
  if (isEmail(configured)) return configured;
  const host = String(hostname || "").trim().toLowerCase();
  return host ? "contact@" + host.replace(/^www\./, "") : "";
}

function contactIdentity(env) {
  return {
    configured: !!contactAddress(env),
    address: contactAddress(env),
    name: String(env.CONTACT_NAME || "").trim(),
    role: String(env.CONTACT_ROLE || "").trim(),
  };
}

function contactError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Header injection guard. Anything that ends up on a header line has its
// newlines stripped - without this, a subject containing CRLF could append
// arbitrary headers to the outgoing message.
function headerSafe(value, max) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max || 200);
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

async function sendContactEmail(body, env, hostname) {
  const topic = headerSafe(body.topic, 80);
  const name = headerSafe(body.name, 120);
  const replyTo = String(body.email || "").trim();
  const message = String(body.message || "").trim();

  if (!message) return { ok: false, error: "The message is empty." };
  if (message.length > 8000) return { ok: false, error: "That message is too long to send." };
  if (replyTo && !isEmail(replyTo)) return { ok: false, error: "That email address does not look right." };

  // Destination comes from a secret, not from the source. Anyone who clones
  // this repository and deploys it gets their own instance; a recipient
  // baked into the code would make their students' messages point at the
  // original author. If it is unset the caller has already been told the
  // form is not configured, so reaching here without it is a bug.
  const to = contactAddress(env);
  if (!to) return { ok: false, error: "The contact form is not configured." };
  const subject = "ClinCog - " + (topic || "Message");
  const from = contactSender(env, hostname);
  if (!from) return { ok: false, error: "The contact form is not configured." };

  // Built by hand rather than with a MIME library: one plain-text part, no
  // attachments, so a handful of headers and a body is the whole message.
  const headers = [
    "From: " + encodeHeaderWord("ClinCog contact form") + " <" + from + ">",
    "To: " + to,
    "Subject: " + encodeHeaderWord(headerSafe(subject, 180)),
    "Message-ID: <" + crypto.randomUUID() + "@clincog.net>",
    "Date: " + rfc5322Date(new Date()),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    // base64 rather than 8bit: the body carries whatever a student typed,
    // which on a Romanian keyboard means diacritics. Raw 8-bit bytes in a
    // message body depend on the receiving server negotiating 8BITMIME, and
    // filters treat a mismatch as a malformed message.
    "Content-Transfer-Encoding: base64",
  ];
  // Reply-To carries the sender's own address, so replying from the inbox
  // reaches the person rather than the form.
  if (replyTo) headers.push("Reply-To: " + headerSafe(replyTo, 200));

  const lines = [];
  if (topic) lines.push("Topic: " + topic);
  if (name) lines.push("From: " + name);
  if (replyTo) lines.push("Reply to: " + replyTo);
  if (lines.length) lines.push("");
  lines.push(message);

  const raw = headers.join("\r\n") + "\r\n\r\n" + base64Body(lines.join("\r\n") + "\r\n");

  try {
    const { EmailMessage } = await import("cloudflare:email");
    await env.CONTACT_EMAIL.send(new EmailMessage(from, to, raw));
    return { ok: true };
  } catch (err) {
    console.error("Contact send failed:", err);
    return { ok: false, error: "The message could not be sent right now." };
  }
}

function rateLimitedResponse() {
  return new Response(
    JSON.stringify({ text: "Too many requests right now - please wait a moment and try again." }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

// ---- Student-subdomain access gate -----------------------------------------
// uvt.clincog.net is meant only for the author's own students - this is a
// deterrent against accidental/casual visits, not a defense against a
// determined intruder (the password is shared among the whole class, not
// per-student). Checked server-side, before anything else is served -
// static pages included - so it can't be bypassed by disabling JS.
//
// The class list, the password (when changed from the admin console) and
// every limit live in the seminar configuration below, not in secrets.
async function checkStudentAccess(request, env) {
  const cred = basicCredentials(request);
  if (!cred) return false;
  const cfg = await seminarConfig(env);
  if (!(await classPasswordMatches(cfg, cred.password, env))) return false;
  // With a class list the username has to be a student number on it.
  // Without one the password alone opens the site, but the chat stays
  // closed - see studentIdentity().
  const ids = Object.keys(cfg.students);
  return ids.length === 0 || !!cfg.students[normaliseStudentId(cred.username)];
}

function checkAdminAccess(request, env) {
  const cred = basicCredentials(request);
  if (!cred || !env.ADMIN_USER || !env.ADMIN_PASSWORD) return false;
  return cred.username === env.ADMIN_USER && cred.password === env.ADMIN_PASSWORD;
}

function basicCredentials(request) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) return null;
  try {
    const decoded = atob(auth.slice(6));
    const i = decoded.indexOf(":");
    return i === -1 ? { username: "", password: decoded } : { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

// ---- Per-student quota (seminar instance) ------------------------------------
// Each student signs in with their student number (număr matricol) as the
// username and the class password. Matching ignores case and spaces, so
// "ab 123" and "AB123" are the same student.
//
// The number is what the quota is counted against, on the server, in a
// Durable Object per student and per period - so it holds across devices,
// browsers and the in-app "restart progress", none of which the server
// ever sees, and a new period starts everyone from zero.
function normaliseStudentId(v) {
  return String(v || "").replace(/\s+/g, "").toUpperCase();
}

// ---- Seminar configuration (edited on admin.clincog.net) ---------------------
// One Durable Object holds everything the seminar leader can change without
// a terminal: the class list, per-student and per-case limits, periods,
// open/closed, which models students may pick, a daily cap and the class
// password. On first use it is seeded from the old settings (STUDENT_IDS,
// STUDENT_CASE_LIMIT, QUOTA_PERIOD), so nothing already counted is lost.
// Each Worker instance keeps a copy for 20 seconds, so a change made in the
// console reaches every student within that time.
const CASE_IDS = ["schizophrenia", "depression", "anxiety", "addiction"];
// Which company plays the patients on the course instance is a setting.
// Students choose between two tiers, "fast" and "thoughtful"; each provider
// maps them to one of its models. Model names and prices can be changed on
// the console as providers release new ones.
const SEMINAR_PROVIDERS = {
  anthropic: { label: "Anthropic", secret: "ANTHROPIC_API_KEY",
    models: { fast: "claude-haiku-4-5-20251001", thoughtful: "claude-sonnet-5" } },
  gemini: { label: "Google Gemini", secret: "GEMINI_API_KEY_SEMINAR",
    models: { fast: "gemini-3.1-flash-lite", thoughtful: "gemini-3.5-flash" } },
  openai: { label: "OpenAI", secret: "OPENAI_API_KEY_SEMINAR",
    models: { fast: "gpt-5.6-luna", thoughtful: "gpt-5.6-terra" } },
};
const TIERS = ["fast", "thoughtful"];
const TIER_LABEL = { fast: "Fast", thoughtful: "Thoughtful" };
// Older settings and older browsers name the tiers by the Anthropic model.
const LEGACY_TIER = { haiku: "fast", sonnet: "thoughtful", "claude-haiku-4-5-20251001": "fast", "claude-sonnet-5": "thoughtful" };

// "claude-haiku-4-5-20251001" -> "Haiku 4.5", "gpt-5.6-luna" -> "GPT 5.6 Luna":
// the name students see on the model switch.
function prettyModel(id) {
  const parts = String(id).replace(/-\d{8}$/, "").replace(/^claude-/, "").split("-");
  const out = [];
  for (const part of parts) {
    if (/^\d+$/.test(part) && out.length && /\d$/.test(out[out.length - 1])) out[out.length - 1] += "." + part;
    else if (part === "gpt") out.push("GPT");
    else out.push(part.charAt(0).toUpperCase() + part.slice(1));
  }
  return out.join(" ");
}

function seminarModels(cfg) {
  const out = {};
  for (const p in SEMINAR_PROVIDERS) {
    out[p] = Object.assign({}, SEMINAR_PROVIDERS[p].models, (cfg.providerModels || {})[p] || {});
  }
  return out;
}
function seminarProvider(cfg) {
  return SEMINAR_PROVIDERS[cfg.provider] ? cfg.provider : "anthropic";
}
function seminarTiers(cfg) {
  const t = (cfg.models || []).map((m) => LEGACY_TIER[m] || m).filter((m) => TIERS.includes(m));
  return t.length ? [...new Set(t)] : ["fast"];
}
// The key a provider uses: one saved on the console wins over the secret.
function seminarKey(cfg, env, provider) {
  const k = (cfg.keys || {})[provider];
  if (k) return k;
  return env[SEMINAR_PROVIDERS[provider].secret] || null;
}
function keySource(cfg, env, provider) {
  const k = (cfg.keys || {})[provider];
  if (k) return { source: "console", hint: "…" + k.slice(-4) };
  const e = env[SEMINAR_PROVIDERS[provider].secret];
  if (e) return { source: "secret", hint: "…" + String(e).slice(-4), secret: SEMINAR_PROVIDERS[provider].secret };
  return { source: "none", secret: SEMINAR_PROVIDERS[provider].secret };
}
const UNLIMITED_HISTORY = 200; // exchanges a conversation may reach when a limit is lifted

function configStub(env) {
  return env.SEMINAR_CONFIG.get(env.SEMINAR_CONFIG.idFromName("seminar"));
}
function configSeed(env) {
  const ids = String(env.STUDENT_IDS || "").split(/[\s,;]+/).map(normaliseStudentId).filter(Boolean);
  const n = parseInt(env.STUDENT_CASE_LIMIT, 10);
  return { ids, defaultLimit: n > 0 ? n : 20, period: String(env.QUOTA_PERIOD || "default") };
}
let cfgCache = { at: 0, value: null };
async function seminarConfig(env, fresh) {
  if (!fresh && cfgCache.value && Date.now() - cfgCache.at < 20000) return cfgCache.value;
  const value = await configStub(env).get(configSeed(env));
  cfgCache = { at: Date.now(), value };
  return value;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function classPasswordMatches(cfg, password, env) {
  if (cfg.password && typeof cfg.password.value === "string") return password === cfg.password.value;
  if (cfg.password) return (await sha256Hex(cfg.password.salt + password)) === cfg.password.hash;
  return !!env.STUDENT_ACCESS_PASSWORD && password === env.STUDENT_ACCESS_PASSWORD;
}

// The period now running, or null between periods (the chat is then shut).
function activePeriod(cfg, now) {
  now = now || Date.now();
  let best = null;
  for (const p of cfg.periods) {
    if ((p.start == null || p.start <= now) && (p.end == null || p.end > now)) {
      if (!best || (p.start || 0) >= (best.start || 0)) best = p;
    }
  }
  return best;
}

// A limit is a number of exchanges, -1 for no limit, or null to inherit:
// student + case, then student (all cases), then the case, then the default.
function effectiveLimit(cfg, studentId, caseId) {
  const s = cfg.students[studentId];
  let v = s && s.limits ? s.limits[caseId] : null;
  if (v == null && s && s.limits) v = s.limits.all;
  if (v == null) v = cfg.caseLimits[caseId];
  if (v == null) v = cfg.defaultLimit;
  return v < 0 ? null : v; // null = unlimited
}
function studentLimits(cfg, studentId) {
  const out = {};
  CASE_IDS.forEach((c) => { out[c] = effectiveLimit(cfg, studentId, c); });
  return out;
}

function dayKey(cfg, now) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: cfg.timezone || "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now || Date.now()));
  } catch {
    return new Date(now || Date.now()).toISOString().slice(0, 10);
  }
}

// The signed-in student's number, or null when they are not on the list.
async function studentIdentity(request, env) {
  const cred = basicCredentials(request);
  if (!cred) return null;
  const cfg = await seminarConfig(env);
  const id = normaliseStudentId(cred.username);
  return cfg.students[id] ? id : null;
}

// Why a student cannot use the interviews right now, or null if they can.
function seminarGate(cfg, studentId) {
  const s = cfg.students[studentId];
  if (!s) return { status: 503, text: "The interview is not available right now. Tell your seminar leader." };
  if (s.suspended) return { status: 403, text: "Your access to the interviews is paused. Talk to your seminar leader." };
  if (!cfg.open) return { status: 503, text: cfg.closedMessage || "The interviews are closed right now." };
  if (!activePeriod(cfg)) return { status: 503, text: cfg.closedMessage || "The interviews are closed between periods." };
  if (budgetBlocked(cfg)) return { status: 503, text: "The interviews are closed for the rest of the month. Talk to your seminar leader." };
  return null;
}

// ---- Case schedule ------------------------------------------------------------
// Each patient can be open, closed, or open only between two dates, so the
// cases can be released week by week. Closing a case stops its interview;
// the student's evaluation pages stay available.
const CASE_NAMES = { schizophrenia: "Dennis", depression: "Darren", anxiety: "Alex", addiction: "Jordan" };
function fmtWhen(ms, cfg) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: (cfg && cfg.timezone) || "Europe/Bucharest", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  } catch { return new Date(ms).toUTCString(); }
}
function caseState(cfg, caseId, now) {
  now = now || Date.now();
  const c = (cfg.cases || {})[caseId] || { mode: "open" };
  const name = CASE_NAMES[caseId] || caseId;
  if (c.mode === "closed") return { open: false, text: "The interview with " + name + " is closed for now." };
  if (c.mode === "window") {
    if (c.opensAt != null && now < c.opensAt) return { open: false, opensAt: c.opensAt, text: "The interview with " + name + " opens on " + fmtWhen(c.opensAt, cfg) + "." };
    if (c.closesAt != null && now >= c.closesAt) return { open: false, closedAt: c.closesAt, text: "The interview with " + name + " closed on " + fmtWhen(c.closesAt, cfg) + "." };
    return { open: true, closesAt: c.closesAt || null };
  }
  return { open: true };
}

// ---- Announcements --------------------------------------------------------------
function activeAnnouncements(cfg, now) {
  now = now || Date.now();
  return (cfg.announcements || []).filter((a) => (a.from == null || a.from <= now) && (a.until == null || a.until > now))
    .map((a) => ({ id: a.id, text: a.text, level: a.level }));
}

// ---- Budget and alerts ----------------------------------------------------------
// A monthly cap on the seminar's estimated spend (calendar month, UTC). At the
// alert threshold an email goes out; at 100% the interviews can close by
// themselves until the next month, a higher cap, or "Reopen" on the console.
// Failure alerts: when half or more of the last 10 minutes' replies (at least
// five) failed, at most one email an hour.
function budgetOf(cfg) {
  return Object.assign({ monthly: null, alertPct: 80, autoClose: true, emailAlerts: true, failureAlerts: true }, cfg.budget || {});
}
function budgetBlocked(cfg) {
  const b = budgetOf(cfg), st = cfg.budgetState;
  return !!(b.autoClose && st && st.blocked && st.month === monthKey());
}
function adminMailDomain(env) {
  const parts = ADMIN_HOSTNAME.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : ADMIN_HOSTNAME;
}
async function sendAdminEmail(env, subject, lines) {
  const to = contactAddress(env);
  if (!to || !env.CONTACT_EMAIL) return { ok: false, error: "Email is not set up (CONTACT_TO and the send_email binding)." };
  const from = contactSender(env, adminMailDomain(env));
  const headers = [
    "From: " + encodeHeaderWord("ClinCog alerts") + " <" + from + ">",
    "To: " + to,
    "Subject: " + encodeHeaderWord(headerSafe("ClinCog - " + subject, 180)),
    "Message-ID: <" + crypto.randomUUID() + "@" + adminMailDomain(env) + ">",
    "Date: " + rfc5322Date(new Date()),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const text = lines.concat(["", "Live monitoring: https://" + ADMIN_HOSTNAME + "/"]).join("\r\n") + "\r\n";
  try {
    const { EmailMessage } = await import("cloudflare:email");
    await env.CONTACT_EMAIL.send(new EmailMessage(from, to, headers.join("\r\n") + "\r\n\r\n" + base64Body(text)));
    return { ok: true, to };
  } catch (e) {
    console.error("alert email:", e);
    return { ok: false, error: "The email could not be sent." };
  }
}
// After each seminar reply: let the config object decide (once, atomically)
// whether a threshold was just crossed, then send what it asks for.
async function watchSeminar(env, after, ev) {
  let actions = [];
  try { actions = await configStub(env).tick(after, configSeed(env)); } catch (e) { console.error("tick:", e); return; }
  if (!actions.length) return;
  // Crossing the alert level and the whole budget in one reply: one email.
  if (actions.some((a) => a.type === "budget-closed")) actions = actions.filter((a) => a.type !== "budget-alert");
  cfgCache = { at: 0, value: null };
  const cfg = await seminarConfig(env, true);
  const b = budgetOf(cfg);
  for (const a of actions) {
    if (!b.emailAlerts) continue;
    if (a.type === "budget-alert") {
      await sendAdminEmail(env, "seminar budget at " + Math.round(a.pct) + "%", [
        "The seminar has used an estimated $" + a.cost.toFixed(2) + " of its $" + b.monthly.toFixed(2) + " monthly budget (" + Math.round(a.pct) + "%).",
        b.autoClose ? "At 100% the interviews close by themselves until the next month, a higher budget, or Reopen under AI provider on the console." : "The interviews stay open when the budget is reached (automatic closing is off).",
      ]);
    } else if (a.type === "budget-closed") {
      await sendAdminEmail(env, "interviews closed: monthly budget reached", [
        "The seminar reached its $" + b.monthly.toFixed(2) + " monthly budget (estimated $" + a.cost.toFixed(2) + "), so the interviews are now closed.",
        "They reopen on the 1st of next month, or now if you raise the budget or press Reopen under AI provider > Budget and alerts on the console.",
      ]);
    } else if (a.type === "failures") {
      await sendAdminEmail(env, "patient replies are failing", [
        a.fail + " of the last " + a.n + " replies in the seminar failed in the past 10 minutes.",
        "Most recent reason: " + (a.lastError || "unknown") + ".",
        "Check the key and the model under AI provider on the console, and the Health panel on Live monitoring.",
      ]);
    }
  }
}

// ---- Demo control (clincog.net) ------------------------------------------------
// The public demo runs on the author's own Gemini key, on the free tier. It
// can be switched off, paused until a given time (so the day's free quota is
// still there for a presentation) and capped at a number of replies a day.
function demoOf(cfg) {
  return Object.assign({ enabled: true, message: "", dailyCap: null, pausedUntil: null }, cfg.demo || {});
}
function demoState(cfg, now) {
  now = now || Date.now();
  const d = demoOf(cfg);
  const extra = " You can still try ClinCog with your own key (Adopt with your own keys).";
  if (!d.enabled) return { open: false, text: (d.message || "The public demo is switched off for now.") + extra };
  if (d.pausedUntil && now < d.pausedUntil) return { open: false, pausedUntil: d.pausedUntil, text: (d.message || "The public demo is paused until " + fmtWhen(d.pausedUntil, cfg) + ".") + extra };
  return { open: true };
}
const DEMO_QUOTA = ["demo", "all"];

// ---- History of changes -----------------------------------------------------------
// Every change made on the console is described in words and kept, with the
// settings as they were before it, so it can be undone. Runtime state that
// the Worker keeps for itself is never part of a change, a backup or an undo.
const RUNTIME_KEYS = ["budgetState", "alertState", "autoPrices", "priceCheck", "seedIds"];
const SECRET_KEYS = ["password", "keys", "adminKeys"];
const HISTORY_MAX = 50;
function pick(o, keys) { const r = {}; keys.forEach((k) => { if (o && k in o) r[k] = o[k]; }); return r; }
function limitWords(v) { return v === null || v === undefined ? "default" : v < 0 ? "no limit" : String(v); }
function whenWords(ms, cfg) { return ms == null ? "none" : fmtWhen(ms, cfg); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function describeChange(b, a) {
  const out = [], cn = (id) => CASE_NAMES[id] || id;
  const val = (label, x, y, f) => { if (!same(x, y)) out.push(label + ": " + (f ? f(x) : String(x)) + " \u2192 " + (f ? f(y) : String(y))); };
  val("Interviews", b.open, a.open, (v) => (v ? "open" : "closed"));
  val("Message when closed", b.closedMessage || "", a.closedMessage || "", (v) => (v ? "\u201c" + v + "\u201d" : "none"));
  val("Models students may use", b.models, a.models, (v) => (v || []).join(", "));
  val("Default limit", b.defaultLimit, a.defaultLimit, limitWords);
  CASE_IDS.forEach((k) => val("Limit for " + cn(k), (b.caseLimits || {})[k] ?? null, (a.caseLimits || {})[k] ?? null, limitWords));
  val("Daily cap", b.dailyCap, a.dailyCap, (v) => (v == null ? "none" : String(v)));
  val("Time zone", b.timezone, a.timezone);
  // periods
  const pb = Object.fromEntries((b.periods || []).map((p) => [p.id, p])), pa = Object.fromEntries((a.periods || []).map((p) => [p.id, p]));
  for (const id in pa) if (!pb[id]) out.push("Period added: " + pa[id].name);
  for (const id in pb) if (!pa[id]) out.push("Period removed: " + pb[id].name);
  for (const id in pa) if (pb[id] && !same(pb[id], pa[id])) out.push("Period changed: " + pa[id].name);
  // students
  const sb = b.students || {}, sa = a.students || {};
  const added = Object.keys(sa).filter((k) => !sb[k]), removed = Object.keys(sb).filter((k) => !sa[k]);
  const list = (ids) => ids.slice(0, 8).join(", ") + (ids.length > 8 ? " and " + (ids.length - 8) + " more" : "");
  if (added.length) out.push("Students added: " + list(added));
  if (removed.length) out.push("Students removed: " + list(removed));
  const changed = Object.keys(sa).filter((k) => sb[k] && !same(sb[k], sa[k]));
  if (changed.length === 1) {
    const k = changed[0], x = sb[k], y = sa[k];
    if (x.suspended !== y.suspended) out.push(k + ": " + (y.suspended ? "paused" : "active again"));
    if ((x.note || "") !== (y.note || "")) out.push(k + ": note \u2192 \u201c" + (y.note || "") + "\u201d");
    const lx = x.limits || {}, ly = y.limits || {};
    ["all"].concat(CASE_IDS).forEach((c) => { if (!same(lx[c] ?? null, ly[c] ?? null)) out.push(k + ": limit " + (c === "all" ? "for every patient" : "for " + cn(c)) + " " + limitWords(lx[c]) + " \u2192 " + limitWords(ly[c])); });
  } else if (changed.length > 1) out.push("Settings changed for " + changed.length + " students: " + list(changed));
  // secrets: never the values
  if (!same(b.password, a.password)) out.push(a.password ? "Class password changed" : "Class password cleared (the Cloudflare one applies)");
  for (const p of new Set(Object.keys(b.keys || {}).concat(Object.keys(a.keys || {})))) {
    if (!same((b.keys || {})[p], (a.keys || {})[p])) out.push(((SEMINAR_PROVIDERS[p] || {}).label || p) + " key " + ((a.keys || {})[p] ? "saved" : "removed"));
  }
  if (!same(b.adminKeys, a.adminKeys)) out.push("Anthropic admin key " + ((a.adminKeys || {}).anthropic ? "saved" : "removed"));
  val("Provider", b.provider || "anthropic", a.provider || "anthropic", (v) => (SEMINAR_PROVIDERS[v] || {}).label || v);
  if (!same(b.providerModels, a.providerModels)) out.push("Model names changed");
  if (!same(b.prices, a.prices)) out.push("Prices changed");
  val("Billing workspace", b.billingWorkspaceName || b.billingWorkspace || "whole organization", a.billingWorkspaceName || a.billingWorkspace || "whole organization");
  // schedule
  CASE_IDS.forEach((k) => {
    const x = (b.cases || {})[k] || { mode: "open" }, y = (a.cases || {})[k] || { mode: "open" };
    if (same(x, y)) return;
    out.push(cn(k) + ": " + (y.mode === "closed" ? "closed" : y.mode === "window"
      ? "scheduled" + (y.opensAt ? ", opens " + whenWords(y.opensAt, a) : "") + (y.closesAt ? ", closes " + whenWords(y.closesAt, a) : "") : "open"));
  });
  // announcements
  const ab = new Set((b.announcements || []).map((x) => x.id));
  const aa = new Set((a.announcements || []).map((x) => x.id));
  const short = (t) => "\u201c" + (t.length > 60 ? t.slice(0, 57) + "\u2026" : t) + "\u201d";
  (a.announcements || []).forEach((x) => { if (!ab.has(x.id)) out.push("Announcement published: " + short(x.text)); });
  (b.announcements || []).forEach((x) => { if (!aa.has(x.id)) out.push("Announcement removed: " + short(x.text)); });
  // budget
  const bb = budgetOf(b), ba = budgetOf(a);
  val("Monthly budget", bb.monthly, ba.monthly, (v) => (v == null ? "none" : "$" + v));
  val("Budget alert", bb.alertPct, ba.alertPct, (v) => v + "%");
  val("Close at 100% of the budget", bb.autoClose, ba.autoClose, (v) => (v ? "on" : "off"));
  val("Alert emails", bb.emailAlerts, ba.emailAlerts, (v) => (v ? "on" : "off"));
  val("Failure emails", bb.failureAlerts, ba.failureAlerts, (v) => (v ? "on" : "off"));
  if (!(b.budgetState || {}).reopened && (a.budgetState || {}).reopened) out.push("Interviews reopened past this month's budget");
  // demo
  const db = demoOf(b), da = demoOf(a);
  val("Public demo", db.enabled, da.enabled, (v) => (v ? "on" : "off"));
  val("Demo paused until", db.pausedUntil, da.pausedUntil, (v) => whenWords(v, a));
  val("Demo daily cap", db.dailyCap, da.dailyCap, (v) => (v == null ? "none" : String(v)));
  val("Demo message", db.message || "", da.message || "", (v) => (v ? "\u201c" + v + "\u201d" : "default"));
  return out;
}
// A backup is the settings without keys, passwords or runtime state.
function backupOf(cfg) {
  const out = {};
  for (const k in cfg) if (!RUNTIME_KEYS.includes(k) && !SECRET_KEYS.includes(k)) out[k] = cfg[k];
  return out;
}

function quotaStub(env, periodId, studentId) {
  return env.STUDENT_QUOTA.get(env.STUDENT_QUOTA.idFromName(periodId + ":" + studentId));
}

function blankLimits() {
  const l = { all: null };
  CASE_IDS.forEach((c) => { l[c] = null; });
  return l;
}
function initialConfig(seed) {
  seed = seed || { ids: [], defaultLimit: 20, period: "default" };
  const students = {};
  const now = Date.now();
  seed.ids.forEach((id) => { students[id] = { note: "", suspended: false, limits: blankLimits(), added: now }; });
  const caseLimits = {};
  CASE_IDS.forEach((c) => { caseLimits[c] = null; });
  return {
    version: 1, open: true, closedMessage: "", models: ["fast", "thoughtful"],
    provider: "anthropic", providerModels: {}, prices: {}, keys: {},
    defaultLimit: seed.defaultLimit, caseLimits, dailyCap: null, timezone: "Europe/Bucharest",
    periods: [{ id: seed.period, name: seed.period, start: null, end: null }],
    students, password: null, passwordChanged: null,
  };
}

function limitValue(v, allowNull) {
  if (v === null || v === "" || v === undefined) {
    if (allowNull) return null;
    throw new Error("A limit is required.");
  }
  if (v === "unlimited" || v === -1) return -1;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error("Limits are whole numbers from 0 to 1000.");
  return n;
}
function timeValue(v) {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("That date could not be read.");
  return n;
}

export class SeminarConfig extends DurableObject {
  async get(seed) {
    let c = await this.ctx.storage.get("config");
    if (!c) {
      c = initialConfig(seed);
      c.seedIds = seed ? seed.ids.slice().sort().join(",") : "";
      await this.ctx.storage.put("config", c);
      return c;
    }
    // For instances run without the admin console: numbers added to the
    // STUDENT_IDS secret later are added to the list too. Removing one from
    // the secret does not remove the student - that is done on the console.
    const now = seed ? seed.ids.slice().sort().join(",") : null;
    if (now !== null && now !== (c.seedIds || "")) {
      // Only numbers that are new in the secret: a student removed on the
      // console stays removed even though the secret still lists them.
      const t = Date.now(), before = new Set((c.seedIds || "").split(",").filter(Boolean));
      seed.ids.forEach((id) => { if (!before.has(id) && !c.students[id]) c.students[id] = { note: "", suspended: false, limits: blankLimits(), added: t }; });
      c.seedIds = now;
      await this.ctx.storage.put("config", c);
    }
    return c;
  }

  // Called after each seminar reply with the month's spend and the last ten
  // minutes' failures; returns which alerts to send, each at most once.
  async tick(after, seed) {
    const c = await this.get(seed);
    const b = budgetOf(c), actions = [];
    let changed = false;
    if (!c.budgetState || c.budgetState.month !== after.month) { c.budgetState = { month: after.month, alerted: false, blocked: false }; changed = true; }
    const st = c.budgetState;
    if (b.monthly) {
      const pct = after.monthCost / b.monthly * 100;
      if (!st.alerted && pct >= b.alertPct) { st.alerted = true; changed = true; actions.push({ type: "budget-alert", pct, cost: after.monthCost }); }
      if (b.autoClose && !st.blocked && !st.reopened && pct >= 100) { st.blocked = true; changed = true; actions.push({ type: "budget-closed", cost: after.monthCost }); }
    }
    const r = after.recent || { n: 0, fail: 0 };
    c.alertState = c.alertState || {};
    if (b.failureAlerts && r.n >= 5 && r.fail / r.n >= 0.5 && (!c.alertState.failureAt || Date.now() - c.alertState.failureAt > 3600e3)) {
      c.alertState.failureAt = Date.now(); changed = true;
      actions.push({ type: "failures", n: r.n, fail: r.fail, lastError: r.lastError });
    }
    if (changed) await this.ctx.storage.put("config", c);
    return actions;
  }

  async setAutoPrices(found, meta) {
    const c = await this.get(null);
    c.autoPrices = c.autoPrices || {};
    for (const id in found) c.autoPrices[id] = Object.assign({}, found[id], { at: meta.at });
    c.priceCheck = meta;
    await this.ctx.storage.put("config", c);
    return meta;
  }

  // Every change goes through here, validated, one at a time, and is
  // written down with the settings as they were before (History).
  async update(op, a, seed) {
    let c = await this.get(seed);
    a = a || {};
    const before = structuredClone(c);
    let note = null;
    switch (op) {
      case "undo": {
        const hist = (await this.ctx.storage.get("history")) || [];
        const i = hist.findIndex((h) => h.id === a.id);
        if (i < 0 || !hist[i].before) throw new Error("That change can no longer be undone.");
        c = Object.assign({}, hist[i].before, pick(c, RUNTIME_KEYS));
        note = "Undone: " + hist[i].summary[0] + (i ? " (with the " + i + " later change" + (i > 1 ? "s" : "") + ")" : "");
        break;
      }
      case "restore": {
        const b = a.config && a.config.clincog_backup ? a.config.settings : a.config;
        if (!b || typeof b !== "object" || !b.students || typeof b.students !== "object" || !Array.isArray(b.periods)) throw new Error("This is not a ClinCog settings backup.");
        c = Object.assign(initialConfig(null), backupOf(b), pick(c, RUNTIME_KEYS.concat(SECRET_KEYS)));
        note = "Settings restored from a backup" + (a.config.at ? " of " + fmtWhen(a.config.at, c) : "");
        break;
      }
      case "demo": {
        const d = demoOf(c);
        if ("enabled" in a) d.enabled = !!a.enabled;
        if ("message" in a) d.message = String(a.message || "").trim().slice(0, 300);
        if ("dailyCap" in a) {
          const v = a.dailyCap === null || a.dailyCap === "" ? null : Number(a.dailyCap);
          if (v !== null && (!Number.isInteger(v) || v < 1 || v > 100000)) throw new Error("The daily cap is a whole number of replies, or empty for none.");
          d.dailyCap = v;
        }
        if ("pausedUntil" in a) {
          const v = timeValue(a.pausedUntil);
          if (v !== null && v <= Date.now()) throw new Error("Pick a time in the future.");
          d.pausedUntil = v;
        }
        c.demo = d;
        break;
      }
      case "general": {
        if ("open" in a) c.open = !!a.open;
        if ("closedMessage" in a) c.closedMessage = String(a.closedMessage || "").slice(0, 300);
        if ("models" in a) {
          const m = (Array.isArray(a.models) ? a.models : []).map((x) => LEGACY_TIER[x] || x).filter((x) => TIERS.includes(x));
          if (!m.length) throw new Error("Leave at least one model on.");
          c.models = [...new Set(m)];
        }
        if ("defaultLimit" in a) {
          const v = limitValue(a.defaultLimit, false);
          c.defaultLimit = v;
        }
        if (a.caseLimits) CASE_IDS.forEach((k) => { if (k in a.caseLimits) c.caseLimits[k] = limitValue(a.caseLimits[k], true); });
        if ("dailyCap" in a) {
          const v = a.dailyCap === null || a.dailyCap === "" ? null : Number(a.dailyCap);
          if (v !== null && (!Number.isInteger(v) || v < 1 || v > 5000)) throw new Error("The daily cap is a whole number from 1 to 5000, or empty for none.");
          c.dailyCap = v;
        }
        if ("timezone" in a) {
          try { new Intl.DateTimeFormat("en", { timeZone: a.timezone }); c.timezone = a.timezone; }
          catch { throw new Error("Unknown time zone."); }
        }
        break;
      }
      case "provider": {
        if ("provider" in a) {
          if (!SEMINAR_PROVIDERS[a.provider]) throw new Error("Unknown provider.");
          c.provider = a.provider;
        }
        if (a.models) {
          c.providerModels = c.providerModels || {};
          for (const p in a.models) {
            if (!SEMINAR_PROVIDERS[p]) continue;
            const cur = Object.assign({}, c.providerModels[p] || {});
            TIERS.forEach((t) => {
              if (!(t in a.models[p])) return;
              const v = String(a.models[p][t] || "").trim();
              if (v && !/^[A-Za-z0-9._:\-\/]{2,80}$/.test(v)) throw new Error("\"" + v + "\" does not look like a model name.");
              if (v) cur[t] = v; else delete cur[t];
            });
            c.providerModels[p] = cur;
          }
        }
        if (a.prices) {
          c.prices = c.prices || {};
          for (const model in a.prices) {
            const pr = a.prices[model];
            if (pr === null) { delete c.prices[model]; continue; }
            const i = Number(pr[0]), o = Number(pr[1]);
            if (!(i >= 0 && i < 1000 && o >= 0 && o < 1000)) throw new Error("Prices are dollars per million tokens, from 0 to 999.");
            c.prices[model] = [i, o];
          }
        }
        break;
      }
      case "setKey": {
        if (!SEMINAR_PROVIDERS[a.provider]) throw new Error("Unknown provider.");
        const k = String(a.key || "").trim();
        if (k.length < 20 || /\s/.test(k)) throw new Error("That does not look like an API key.");
        c.keys = c.keys || {};
        c.keys[a.provider] = k;
        break;
      }
      case "clearKey": {
        if (c.keys) delete c.keys[a.provider];
        break;
      }
      case "cases": {
        c.cases = c.cases || {};
        for (const id in (a.cases || {})) {
          if (!CASE_IDS.includes(id)) continue;
          const v = a.cases[id] || {};
          const mode = ["open", "closed", "window"].includes(v.mode) ? v.mode : "open";
          const opensAt = mode === "window" ? timeValue(v.opensAt) : null;
          const closesAt = mode === "window" ? timeValue(v.closesAt) : null;
          if (mode === "window" && opensAt == null && closesAt == null) throw new Error("Give " + CASE_NAMES[id] + " an opening or a closing date, or choose Open.");
          if (opensAt != null && closesAt != null && closesAt <= opensAt) throw new Error(CASE_NAMES[id] + " has to close after it opens.");
          c.cases[id] = { mode, opensAt, closesAt };
        }
        break;
      }
      case "announce": {
        const text = String(a.text || "").trim().slice(0, 400);
        if (!text) throw new Error("Write the announcement first.");
        const from = timeValue(a.from), until = timeValue(a.until);
        if (from != null && until != null && until <= from) throw new Error("An announcement has to end after it starts.");
        c.announcements = (c.announcements || []).concat([{ id: crypto.randomUUID().slice(0, 8), text, level: a.level === "important" ? "important" : "info", from, until, created: Date.now() }]);
        if (c.announcements.length > 30) throw new Error("Remove some old announcements first.");
        break;
      }
      case "removeAnnouncement": {
        c.announcements = (c.announcements || []).filter((x) => x.id !== a.id);
        break;
      }
      case "budget": {
        const b = budgetOf(c);
        if ("monthly" in a) {
          const v = a.monthly === null || a.monthly === "" ? null : Number(a.monthly);
          if (v !== null && !(v > 0 && v < 100000)) throw new Error("The budget is an amount in dollars, or empty for none.");
          b.monthly = v;
        }
        if ("alertPct" in a) {
          const v = Number(a.alertPct);
          if (!(v >= 10 && v <= 100)) throw new Error("The alert is a percentage from 10 to 100.");
          b.alertPct = v;
        }
        ["autoClose", "emailAlerts", "failureAlerts"].forEach((k) => { if (k in a) b[k] = !!a[k]; });
        c.budget = b;
        // A higher budget than what was spent reopens a month that was closed.
        // A new budget is judged afresh: the month reopens, and the alert and
        // the closing apply again against the new amount.
        if (c.budgetState && "monthly" in a) { c.budgetState.blocked = false; c.budgetState.alerted = false; c.budgetState.reopened = false; }
        break;
      }
      case "reopenBudget": {
        // Stays open for the rest of this month, past the budget.
        if (c.budgetState) { c.budgetState.blocked = false; c.budgetState.reopened = true; }
        break;
      }
      case "setAdminKey": {
        const k = String(a.key || "").trim();
        if (!/^sk-ant-admin/.test(k)) throw new Error("That is not an Anthropic Admin key (they start with sk-ant-admin).");
        c.adminKeys = c.adminKeys || {};
        c.adminKeys.anthropic = k;
        break;
      }
      case "clearAdminKey": {
        if (c.adminKeys) delete c.adminKeys.anthropic;
        break;
      }
      case "billingWorkspace": {
        c.billingWorkspace = a.id ? String(a.id).slice(0, 80) : null;
        c.billingWorkspaceName = a.id ? String(a.name || a.id).slice(0, 80) : null;
        break;
      }
      case "addStudents": {
        // One per line or separated by commas; spaces inside a number are
        // ignored, so "PSI 1234" is PSI1234.
        const ids = (Array.isArray(a.ids) ? a.ids : String(a.ids || "").split(/[\n\r\t,;]+/)).map(normaliseStudentId).filter(Boolean);
        if (!ids.length) throw new Error("No student numbers to add.");
        if (Object.keys(c.students).length + ids.length > 3000) throw new Error("That is more students than the list can hold.");
        const now = Date.now();
        ids.forEach((id) => {
          if (!/^[A-Z0-9._-]{2,40}$/.test(id)) throw new Error("\"" + id + "\" does not look like a student number.");
          if (!c.students[id]) c.students[id] = { note: String(a.note || "").slice(0, 120), suspended: false, limits: blankLimits(), added: now };
        });
        break;
      }
      case "removeStudents": {
        (a.ids || []).map(normaliseStudentId).forEach((id) => { delete c.students[id]; });
        break;
      }
      case "updateStudent": {
        const s = c.students[normaliseStudentId(a.id)];
        if (!s) throw new Error("That student is not on the list.");
        if ("note" in a) s.note = String(a.note || "").slice(0, 120);
        if ("suspended" in a) s.suspended = !!a.suspended;
        if (a.limits) ["all"].concat(CASE_IDS).forEach((k) => { if (k in a.limits) s.limits[k] = limitValue(a.limits[k], true); });
        break;
      }
      case "bulkStudents": {
        const ids = (a.ids || []).map(normaliseStudentId).filter((id) => c.students[id]);
        ids.forEach((id) => {
          const s = c.students[id];
          if ("suspended" in a) s.suspended = !!a.suspended;
          if (a.limits) ["all"].concat(CASE_IDS).forEach((k) => { if (k in a.limits) s.limits[k] = limitValue(a.limits[k], true); });
        });
        break;
      }
      case "addPeriod": {
        const name = String(a.name || "").trim().slice(0, 60);
        if (!name) throw new Error("Give the period a name.");
        const start = timeValue(a.start), end = timeValue(a.end);
        if (start != null && end != null && end <= start) throw new Error("A period has to end after it starts.");
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) + "-" + Math.random().toString(36).slice(2, 7);
        c.periods.push({ id, name, start, end });
        break;
      }
      case "updatePeriod": {
        const p = c.periods.find((x) => x.id === a.id);
        if (!p) throw new Error("That period no longer exists.");
        if ("name" in a) p.name = String(a.name || p.name).trim().slice(0, 60) || p.name;
        if ("start" in a) p.start = timeValue(a.start);
        if ("end" in a) p.end = timeValue(a.end);
        if (p.start != null && p.end != null && p.end <= p.start) throw new Error("A period has to end after it starts.");
        break;
      }
      case "removePeriod": {
        c.periods = c.periods.filter((x) => x.id !== a.id);
        break;
      }
      case "newPeriodNow": {
        const name = String(a.name || "").trim().slice(0, 60);
        if (!name) throw new Error("Give the new period a name.");
        const now = Date.now();
        const cur = activePeriod(c, now);
        if (cur) cur.end = now;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) + "-" + Math.random().toString(36).slice(2, 7);
        c.periods.push({ id, name, start: now, end: timeValue(a.end) });
        break;
      }
      case "setPassword": {
        const pw = String(a.password || "");
        if (pw.length < 6) throw new Error("Use at least 6 characters.");
        if (pw.includes(":")) throw new Error("The password cannot contain a colon.");
        // Kept readable, so the seminar leader can look it up on the admin
        // console: it is a password the whole class shares, not a personal
        // one, and only the admin can read the configuration.
        c.password = { value: pw };
        c.passwordChanged = Date.now();
        break;
      }
      case "clearPassword": {
        c.password = null;
        c.passwordChanged = Date.now();
        break;
      }
      default:
        throw new Error("Unknown change.");
    }
    const summary = describeChange(before, c);
    if (a.dryRun) return { preview: summary };
    if (note) summary.unshift(note);
    await this.ctx.storage.put("config", c);
    if (summary.length) await this.addHistory(op, summary, before);
    return { ok: true, changed: summary.length > 0 };
  }

  async addHistory(op, summary, before) {
    const hist = (await this.ctx.storage.get("history")) || [];
    hist.unshift({ id: crypto.randomUUID().slice(0, 8), at: Date.now(), op, summary, before: before || null });
    await this.ctx.storage.put("history", hist.slice(0, HISTORY_MAX));
  }
  async history() {
    const hist = (await this.ctx.storage.get("history")) || [];
    return hist.map((h) => ({ id: h.id, at: h.at, op: h.op, summary: h.summary, undoable: !!h.before }));
  }

}

// One object per student. Its methods run one at a time, so reading the
// count and writing the new one cannot be split by a second request from
// another device arriving at the same moment.
export class StudentQuota extends DurableObject {
  // limit null = no limit for this case; dayCap null = no daily cap.
  async reserve(caseId, limit, day, dayCap) {
    const key = "case:" + caseId;
    const used = (await this.ctx.storage.get(key)) || 0;
    if (limit != null && used >= limit) return { ok: false, reason: "case", used, limit };
    const dkey = "day:" + day;
    const today = (await this.ctx.storage.get(dkey)) || 0;
    if (dayCap != null && today >= dayCap) return { ok: false, reason: "day", used, limit, today, dayCap };
    await this.ctx.storage.put(key, used + 1);
    await this.ctx.storage.put(dkey, today + 1);
    return { ok: true, used: used + 1, limit, today: today + 1, dayCap };
  }
  // A call that failed before the patient said anything is not counted.
  async refund(caseId, day) {
    const key = "case:" + caseId, dkey = "day:" + day;
    const used = (await this.ctx.storage.get(key)) || 0;
    if (used > 0) await this.ctx.storage.put(key, used - 1);
    const today = (await this.ctx.storage.get(dkey)) || 0;
    if (today > 0) await this.ctx.storage.put(dkey, today - 1);
  }
  async status(day) {
    const out = {};
    for (const [k, v] of await this.ctx.storage.list({ prefix: "case:" })) out[k.slice(5)] = v;
    if (day === undefined) return out;
    return { cases: out, today: (await this.ctx.storage.get("day:" + day)) || 0 };
  }
  async reset(caseId) {
    if (caseId) await this.ctx.storage.delete("case:" + caseId);
    else {
      for (const [k] of await this.ctx.storage.list({ prefix: "case:" })) await this.ctx.storage.delete(k);
      for (const [k] of await this.ctx.storage.list({ prefix: "day:" })) await this.ctx.storage.delete(k);
    }
  }
}

// ---- Usage monitoring (admin console) ------------------------------------------
// Every chat reply is recorded as one event - lane (demo / seminar / admin /
// byok), participant, case, model, tokens in and out, cost, latency - in a
// single Durable Object that keeps them in SQLite and pushes each new one
// to every open admin page over a WebSocket. No conversation text is kept.
const DEFAULT_MODEL = { anthropic: "claude-haiku-4-5-20251001", gemini: "gemini-3.5-flash", openai: "gpt-5-nano" };

// US dollars per million tokens, standard (paid) tier, as published by the
// providers in September 2026. PRICING (a JSON var) overrides any entry,
// e.g. {"gemini-3.5-flash":[1.5,9]}. BYOK traffic is never priced: it is
// the adopting instructor's own bill.
const PRICES = {
  "claude-haiku-4-5-20251001": [1, 5],
  "claude-sonnet-5": [2, 10],
  "gemini-3.5-flash": [1.5, 9],
  "gemini-3.1-flash-lite": [0.25, 1.5],
  "gemini-3.1-pro": [2, 12],
  // OpenAI, as listed after the July 2026 price cut - check before relying
  // on them; they can be corrected on the console's AI provider page.
  "gpt-5.6-luna": [0.2, 1.2],
  "gpt-5.6-terra": [2, 12],
};
function priceTable(env) {
  if (!env.PRICING) return PRICES;
  try { return Object.assign({}, PRICES, JSON.parse(env.PRICING)); } catch { return PRICES; }
}
// Where a model's price comes from, in order: set by hand on the console,
// fetched automatically (daily, see refreshPrices), the PRICING var, the
// table above.
function priceInfo(model, env, cfg) {
  const manual = cfg && cfg.prices && cfg.prices[model];
  if (manual) return { in: manual[0], out: manual[1], source: "manual" };
  const auto = cfg && cfg.autoPrices && cfg.autoPrices[model];
  if (auto) return { in: auto.in, out: auto.out, source: auto.source, at: auto.at };
  const t = priceTable(env)[model];
  if (t) return { in: t[0], out: t[1], source: "built-in" };
  return null;
}
function priceOf(model, tin, tout, env, cfg) {
  const p = priceInfo(model, env, cfg);
  if (!p) return null;
  return (tin * p.in + tout * p.out) / 1e6;
}

// ---- Automatic prices --------------------------------------------------------
// No provider publishes its prices in an API, so they are read once a day
// (and on request from the console) from two public catalogues: OpenRouter's
// model list, which carries each model's list price, and, for anything not
// found there, LiteLLM's price file, which uses the providers' own model
// names. A price set by hand on the console always wins; a model found in
// neither keeps its last known price and is reported as not found.
const OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models";
const LITELLM_PRICES = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

function vendorOf(model) {
  if (/^claude/.test(model)) return "anthropic";
  if (/^gemini/.test(model)) return "google";
  if (/^(gpt|o\d)/.test(model)) return "openai";
  return null;
}
// "anthropic/claude-haiku-4.5" and "claude-haiku-4-5-20251001" both become
// "claude-haiku-4-5"; a ":free" variant stays different.
function normModel(id) {
  return String(id).toLowerCase().replace(/^[a-z0-9-]+\//, "").replace(/-\d{8}$/, "").replace(/[.:_]/g, "-");
}
function watchedModels(cfg) {
  const set = new Set(Object.keys(PRICES));
  const mods = seminarModels(cfg);
  for (const p in mods) TIERS.forEach((t) => set.add(mods[p][t]));
  Object.values(DEFAULT_MODEL).forEach((m) => set.add(m));
  Object.keys((cfg && cfg.prices) || {}).forEach((m) => set.add(m));
  return [...set].filter(vendorOf);
}
const round4 = (x) => Math.round(x * 10000) / 10000;

async function refreshPrices(env) {
  const cfg = await seminarConfig(env, true);
  const want = watchedModels(cfg);
  const found = {};
  let orOk = false, llOk = false;
  try {
    const r = await fetch(OPENROUTER_MODELS, { headers: { "User-Agent": "ClinCog price check (clincog.net)" } });
    if (r.ok) {
      const list = (await r.json()).data || [];
      orOk = true;
      const byKey = new Map();
      for (const m of list) byKey.set(String(m.id).split("/")[0] + "|" + normModel(m.id), m);
      for (const id of want) {
        const m = byKey.get(vendorOf(id) + "|" + normModel(id));
        if (!m || !m.pricing) continue;
        const i = Number(m.pricing.prompt) * 1e6, o = Number(m.pricing.completion) * 1e6;
        if (isFinite(i) && isFinite(o) && i >= 0 && o >= 0 && (i > 0 || o > 0)) found[id] = { in: round4(i), out: round4(o), source: "OpenRouter" };
      }
    }
  } catch (e) { /* catalogue unreachable: keep what we had */ }
  const missing = want.filter((id) => !found[id]);
  if (missing.length) {
    try {
      const r = await fetch(LITELLM_PRICES);
      if (r.ok) {
        const ll = await r.json();
        llOk = true;
        for (const id of missing) {
          const e = ll[id] || ll["gemini/" + id] || ll["openai/" + id] || ll["anthropic/" + id];
          if (e && e.input_cost_per_token != null) found[id] = { in: round4(e.input_cost_per_token * 1e6), out: round4((e.output_cost_per_token || 0) * 1e6), source: "LiteLLM" };
        }
      }
    } catch (e) { /* same */ }
  }
  return configStub(env).setAutoPrices(found, {
    at: Date.now(), openrouter: orOk, litellm: llOk,
    found: Object.keys(found).length, missing: want.filter((id) => !found[id]),
  });
}

// Demo visitors are anonymous: chat.js sends a random id kept in the
// browser, shown as "Visitor a3f2". Only its shape is checked.
function visitorLabel(v) {
  const id = String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  return id || "anon";
}

function monitorStub(env) {
  return env.USAGE_MONITOR.get(env.USAGE_MONITOR.idFromName("global"));
}
async function recordUsage(env, ev) {
  try { return await monitorStub(env).record(ev); } catch (e) { console.error("monitor:", e); return null; }
}

const RANGES = {
  "1h": { span: 3600e3, bucket: 60e3 },
  "24h": { span: 86400e3, bucket: 900e3 },
  "7d": { span: 7 * 86400e3, bucket: 3 * 3600e3 },
  "30d": { span: 30 * 86400e3, bucket: 86400e3 },
};
const KEEP_MS = 90 * 86400e3;
function monthKey(ts) { return new Date(ts || Date.now()).toISOString().slice(0, 7); }

export class UsageMonitor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ev (
      ts INTEGER NOT NULL, lane TEXT NOT NULL, pid TEXT NOT NULL, cs TEXT, model TEXT,
      tin INTEGER, tout INTEGER, cost REAL, ok INTEGER, ms INTEGER)`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS ev_ts ON ev(ts)");
    // Added later: why a reply failed (status and provider message only).
    try { this.sql.exec("ALTER TABLE ev ADD COLUMN err TEXT"); } catch (e) { /* already there */ }
    this.inserts = 0;
  }

  async record(e) {
    this.sql.exec("INSERT INTO ev (ts, lane, pid, cs, model, tin, tout, cost, ok, ms, err) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      e.ts, e.lane, e.participant, e.caseId, e.model, e.tin, e.tout, e.cost, e.ok, e.ms, e.err || null);
    if (++this.inserts % 500 === 0) this.sql.exec("DELETE FROM ev WHERE ts < ?", Date.now() - KEEP_MS);
    const msg = JSON.stringify({ type: "event", event: e });
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch {} }
    // What the budget and failure alerts need, returned to the caller.
    return { month: monthKey(e.ts), monthCost: this.monthCost(e.lane, e.ts), recent: this.recentFailures(e.lane, 10 * 60e3) };
  }
  monthCost(laneKey, ts) {
    const d = new Date(ts || Date.now());
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const row = this.sql.exec("SELECT SUM(cost) AS c FROM ev WHERE lane = ? AND ts >= ?", laneKey, from).toArray()[0];
    return (row && row.c) || 0;
  }
  byParticipant(laneKey, from) {
    const out = {};
    for (const r of this.sql.exec("SELECT pid, SUM(cost) AS cost, COUNT(*) AS req, MAX(ts) AS last FROM ev WHERE lane = ? AND ts >= ? GROUP BY pid", laneKey, from || 0)) out[r.pid] = { cost: r.cost || 0, req: r.req, last: r.last };
    return out;
  }
  recentFailures(laneKey, span) {
    const row = this.sql.exec("SELECT COUNT(*) AS n, SUM(1 - ok) AS f FROM ev WHERE lane = ? AND ts >= ?", laneKey, Date.now() - span).toArray()[0];
    const last = this.sql.exec("SELECT err FROM ev WHERE lane = ? AND ok = 0 AND ts >= ? ORDER BY ts DESC LIMIT 1", laneKey, Date.now() - span).toArray()[0];
    return { n: (row && row.n) || 0, fail: (row && row.f) || 0, lastError: last ? last.err : null };
  }
  // The last hour, per lane: replies, failures, latency; the latest errors;
  // and this month's cost per lane.
  async health() {
    const since = Date.now() - 3600e3, lanes = {};
    for (const k of ["seminar", "demo", "admin", "byok"]) lanes[k] = { req: 0, fail: 0, p50: null, p90: null, month: this.monthCost(k) };
    const ms = {};
    for (const row of this.sql.exec("SELECT lane, ok, ms FROM ev WHERE ts >= ?", since)) {
      const L = lanes[row.lane]; if (!L) continue;
      L.req++; if (!row.ok) L.fail++; else (ms[row.lane] = ms[row.lane] || []).push(row.ms);
    }
    for (const k in ms) {
      const a = ms[k].sort((x, y) => x - y);
      lanes[k].p50 = a[Math.floor((a.length - 1) * 0.5)];
      lanes[k].p90 = a[Math.floor((a.length - 1) * 0.9)];
    }
    const errors = this.sql.exec("SELECT ts, lane, pid AS participant, cs AS caseId, model, err FROM ev WHERE ok = 0 ORDER BY ts DESC LIMIT 12").toArray();
    return { lanes, errors, now: Date.now() };
  }

  // Totals, a time series and the participant table for each lane, plus
  // the latest events - everything the page needs to draw itself.
  async summary(rangeKey) {
    const r = RANGES[rangeKey] || RANGES["24h"];
    const now = Date.now(), from = now - r.span;
    const start = Math.floor(from / r.bucket) * r.bucket;
    const n = Math.ceil((now - start) / r.bucket);
    const lanes = {};
    const lane = (k) => lanes[k] || (lanes[k] = {
      req: 0, fail: 0, tin: 0, tout: 0, cost: 0, priced: true, participants: 0,
      series: Array.from({ length: n }, (_, i) => ({ t: start + i * r.bucket, req: 0, tok: 0, cost: 0 })),
      people: [],
    });
    ["demo", "seminar", "admin", "byok"].forEach(lane);
    for (const row of this.sql.exec(
      "SELECT lane, CAST((ts - ?) / ? AS INTEGER) AS b, COUNT(*) AS req, SUM(1 - ok) AS fail, SUM(tin) AS tin, SUM(tout) AS tout, SUM(cost) AS cost, SUM(cost IS NULL AND ok = 1) AS unpriced FROM ev WHERE ts >= ? GROUP BY lane, b",
      start, r.bucket, start)) {
      const L = lane(row.lane), b = L.series[row.b];
      if (b) { b.req = row.req; b.tok = (row.tin || 0) + (row.tout || 0); b.cost = row.cost || 0; }
      L.req += row.req; L.fail += row.fail || 0; L.tin += row.tin || 0; L.tout += row.tout || 0; L.cost += row.cost || 0;
      if (row.unpriced) L.priced = false;
    }
    for (const row of this.sql.exec(
      "SELECT lane, pid, COUNT(*) AS req, SUM(tin) AS tin, SUM(tout) AS tout, SUM(cost) AS cost, MAX(ts) AS last FROM ev WHERE ts >= ? GROUP BY lane, pid ORDER BY cost DESC, req DESC",
      start)) {
      const L = lane(row.lane);
      L.people.push({ pid: row.pid, req: row.req, tin: row.tin || 0, tout: row.tout || 0, cost: row.cost || 0, last: row.last });
    }
    for (const k in lanes) lanes[k].participants = lanes[k].people.length;
    const feed = this.sql.exec("SELECT ts, lane, pid AS participant, cs AS caseId, model, tin, tout, cost, ok, ms, err FROM ev ORDER BY ts DESC LIMIT 40").toArray();
    return { range: rangeKey in RANGES ? rangeKey : "24h", bucket: r.bucket, from: start, now, lanes, feed };
  }

  // Estimated cost per UTC day for one lane, models starting with a prefix.
  // When this console first saw a reply of this kind: billing before that
  // cannot be compared with an estimate that did not exist yet.
  firstEvent(laneKey, modelPrefix) {
    const row = this.sql.exec("SELECT MIN(ts) AS t FROM ev WHERE lane = ? AND model LIKE ?", laneKey, modelPrefix + "%").toArray()[0];
    return row && row.t ? row.t : null;
  }
  async dailyCost(days, laneKey, modelPrefix) {
    const DAY = 86400e3, since = Math.floor(Date.now() / DAY) * DAY - (days - 1) * DAY;
    const out = {};
    for (const row of this.sql.exec(
      "SELECT CAST(ts / ? AS INTEGER) AS d, SUM(cost) AS cost FROM ev WHERE ts >= ? AND lane = ? AND model LIKE ? GROUP BY d",
      DAY, since, laneKey, modelPrefix + "%")) {
      out[new Date(row.d * DAY).toISOString().slice(0, 10)] = row.cost || 0;
    }
    return out;
  }

  // One participant's own series, for the detail chart.
  async participant(laneKey, pid, rangeKey) {
    const r = RANGES[rangeKey] || RANGES["24h"];
    const now = Date.now(), start = Math.floor((now - r.span) / r.bucket) * r.bucket;
    const n = Math.ceil((now - start) / r.bucket);
    const series = Array.from({ length: n }, (_, i) => ({ t: start + i * r.bucket, req: 0, tok: 0, cost: 0 }));
    for (const row of this.sql.exec(
      "SELECT CAST((ts - ?) / ? AS INTEGER) AS b, COUNT(*) AS req, SUM(tin) + SUM(tout) AS tok, SUM(cost) AS cost FROM ev WHERE ts >= ? AND lane = ? AND pid = ? GROUP BY b",
      start, r.bucket, start, laneKey, pid)) {
      const b = series[row.b]; if (b) { b.req = row.req; b.tok = row.tok || 0; b.cost = row.cost || 0; }
    }
    const byCase = this.sql.exec(
      "SELECT cs AS caseId, COUNT(*) AS req, SUM(tin) AS tin, SUM(tout) AS tout, SUM(cost) AS cost FROM ev WHERE ts >= ? AND lane = ? AND pid = ? GROUP BY cs",
      start, laneKey, pid).toArray();
    return { lane: laneKey, pid, bucket: r.bucket, series, byCase };
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws, msg) { if (msg === "ping") ws.send("pong"); }
  async webSocketClose(ws, code) { try { ws.close(code, "bye"); } catch {} }
}

// ---- What Anthropic actually billed (Usage & Cost Admin API) ----------------
// Needs an Admin API key (sk-ant-admin…), either the ANTHROPIC_ADMIN_KEY
// secret or one saved on the console. Such a key has full admin rights over
// the Anthropic organization, so it is only ever used here, for read-only
// cost reports, and never shown again. Anthropic reports costs per day
// (in cents), usually within minutes; results are kept for 10 minutes.
function anthropicAdminKey(cfg, env) {
  return (cfg.adminKeys && cfg.adminKeys.anthropic) || env.ANTHROPIC_ADMIN_KEY || null;
}
async function anthropicAdmin(key, path) {
  const r = await fetch("https://api.anthropic.com/v1/organizations/" + path, {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (body && body.error && body.error.message) || ("Anthropic answered " + r.status);
    throw new Error(r.status === 401 || r.status === 403 ? "Anthropic did not accept the admin key. " + msg : msg);
  }
  return body;
}
const billingCache = new Map();
async function anthropicBilling(env, days) {
  const cfg = await seminarConfig(env);
  const key = anthropicAdminKey(cfg, env);
  if (!key) return { configured: false };
  const ws = cfg.billingWorkspace || null;
  const cacheKey = days + "|" + (ws || "") + "|" + key.slice(-6);
  const hit = billingCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 600e3) return hit.value;

  const DAY = 86400e3;
  const today = Math.floor(Date.now() / DAY) * DAY;
  const start = new Date(today - (days - 1) * DAY).toISOString();
  const end = new Date(today + DAY).toISOString();
  const byDay = new Map(), byModel = {};
  for (let i = 0; i < days; i++) byDay.set(new Date(today - (days - 1 - i) * DAY).toISOString().slice(0, 10), 0);
  let page = null, guard = 0;
  do {
    const q = "cost_report?starting_at=" + encodeURIComponent(start) + "&ending_at=" + encodeURIComponent(end) +
      "&bucket_width=1d&limit=31&group_by[]=workspace_id&group_by[]=description" + (page ? "&page=" + encodeURIComponent(page) : "");
    const res = await anthropicAdmin(key, q);
    for (const b of res.data || []) {
      const d = String(b.starting_at).slice(0, 10);
      for (const r of b.results || []) {
        if (ws && r.workspace_id !== ws) continue;
        const usd = (Number(r.amount) || 0) / 100; // amounts are in cents
        byDay.set(d, (byDay.get(d) || 0) + usd);
        const m = r.model || r.description || "other";
        byModel[m] = (byModel[m] || 0) + usd;
      }
    }
    page = res.has_more ? res.next_page : null;
  } while (page && ++guard < 10);

  // Our own estimate for the same days: the seminar lane's Claude replies.
  const est = await monitorStub(env).dailyCost(days, "seminar", "claude");
  // Only days this console watched from start to finish are compared: what
  // was billed before monitoring started (tests, earlier use) has no
  // estimate to set against it. The first day counts only if monitoring
  // was on from its first hour (UTC).
  const first = await monitorStub(env).firstEvent("seminar", "claude");
  let compareFrom = null;
  if (first != null) {
    const d0 = Math.floor(first / DAY) * DAY;
    compareFrom = new Date(first - d0 < 3600e3 ? d0 : d0 + DAY).toISOString().slice(0, 10);
  }
  const series = [...byDay.entries()].map(([date, billed]) => ({ date, billed, estimate: est[date] || 0, compared: !!compareFrom && date >= compareFrom }));
  const cmp = series.filter((x) => x.compared), pre = series.filter((x) => !x.compared);
  const value = {
    configured: true, workspace: ws, workspaceName: cfg.billingWorkspaceName || null,
    days: series, compareFrom, monitoringSince: first,
    billed: cmp.reduce((a, x) => a + x.billed, 0), estimate: cmp.reduce((a, x) => a + x.estimate, 0),
    before: { billed: pre.reduce((a, x) => a + x.billed, 0), from: series[0].date, to: pre.length ? pre[pre.length - 1].date : null },
    byModel, fetchedAt: Date.now(),
  };
  billingCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

async function handleMonitorApi(request, url, env) {
  const path = url.pathname.slice("/api/monitor/".length);
  // Only the admin page itself may call these. A browser that has the admin
  // password cached would otherwise send it along with a request made by
  // some other site (a form post, a WebSocket) without the admin knowing.
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return new Response("Forbidden", { status: 403 });
  if (request.method === "POST" && request.headers.get("X-ClinCog-Admin") !== "1") {
    return new Response("Forbidden", { status: 403 });
  }
  if (path === "live") {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    return monitorStub(env).fetch(request);
  }
  if (path === "summary" && request.method === "GET") {
    const data = await monitorStub(env).summary(url.searchParams.get("range") || "24h");
    data.freeTierGemini = String(env.GEMINI_FREE_TIER || "").toLowerCase() === "true";
    try { data.seminarProvider = SEMINAR_PROVIDERS[seminarProvider(await seminarConfig(env))].label; } catch { data.seminarProvider = "Anthropic"; }
    data.prices = priceTable(env);
    return jsonResponse(data);
  }
  if (path === "participant" && request.method === "GET") {
    return jsonResponse(await monitorStub(env).participant(
      url.searchParams.get("lane") || "", url.searchParams.get("pid") || "", url.searchParams.get("range") || "24h"));
  }
  // The seminar roster with each student's quota, and a per-student reset.
  if (path === "quotas" && request.method === "GET") {
    const cfg = await seminarConfig(env, true);
    const ids = Object.keys(cfg.students);
    const period = activePeriod(cfg);
    const defaults = studentLimits({ students: {}, caseLimits: cfg.caseLimits, defaultLimit: cfg.defaultLimit }, "");
    if (!ids.length) return jsonResponse({ configured: false, limit: cfg.defaultLimit, limits: defaults, students: [] });
    const used = period ? await Promise.all(ids.map((id) => quotaStub(env, period.id, id).status().catch(() => ({})))) : ids.map(() => ({}));
    return jsonResponse({ configured: true, limit: cfg.defaultLimit, limits: defaults, period: period ? period.name : "(between periods)",
      students: ids.map((id, i) => ({ id, used: used[i], limits: studentLimits(cfg, id), suspended: !!cfg.students[id].suspended })) });
  }
  if (path === "quota-reset" && request.method === "POST") {
    const id = normaliseStudentId(url.searchParams.get("student"));
    if (!id) return jsonResponse({ error: "student is required" }, 400);
    const cfg = await seminarConfig(env, true);
    const period = activePeriod(cfg);
    if (!period) return jsonResponse({ error: "No period is running." }, 409);
    await quotaStub(env, period.id, id).reset(url.searchParams.get("case") || null);
    return jsonResponse({ id, used: await quotaStub(env, period.id, id).status() });
  }

  // ---- Settings (the admin console's Course, Students, Demo, AI provider pages)
  if (path === "seminar" && request.method === "GET") {
    const cfg = await seminarConfig(env, true);
    const period = activePeriod(cfg);
    const day = dayKey(cfg);
    const ids = Object.keys(cfg.students).sort();
    const st = period ? await Promise.all(ids.map((id) => quotaStub(env, period.id, id).status(day).catch(() => ({ cases: {}, today: 0 })))) : ids.map(() => ({ cases: {}, today: 0 }));
    const safe = Object.assign({}, cfg, { password: undefined, students: undefined, keys: undefined, adminKeys: undefined, autoPrices: undefined, models: seminarTiers(cfg) });
    const providers = {};
    for (const p in SEMINAR_PROVIDERS) {
      providers[p] = { label: SEMINAR_PROVIDERS[p].label, models: seminarModels(cfg)[p], defaults: SEMINAR_PROVIDERS[p].models, key: keySource(cfg, env, p) };
    }
    return jsonResponse({
      config: safe,
      provider: seminarProvider(cfg), providers,
      prices: Object.fromEntries(watchedModels(cfg).map((m) => [m, priceInfo(m, env, cfg)]).filter((x) => x[1])),
      priceCheck: cfg.priceCheck || null,
      passwordSource: cfg.password ? "console" : (env.STUDENT_ACCESS_PASSWORD ? "secret" : "none"),
      activePeriodId: period ? period.id : null,
      now: Date.now(), today: day,
      cases: Object.fromEntries(CASE_IDS.map((c) => [c, caseState(cfg, c)])),
      budget: Object.assign(budgetOf(cfg), { blocked: budgetBlocked(cfg), month: monthKey(),
        spent: await monitorStub(env).monthCost("seminar", Date.now()).catch(() => null) }),
      email: { configured: !!(contactAddress(env) && env.CONTACT_EMAIL), to: contactAddress(env) || null },
      freeTierGemini: String(env.GEMINI_FREE_TIER || "").toLowerCase() === "true",
      demo: Object.assign(demoOf(cfg), { state: demoState(cfg),
        today: await quotaStub(env, DEMO_QUOTA[0], DEMO_QUOTA[1]).status(day).then((x) => x.today || 0).catch(() => 0) }),
      students: ids.map((id, i) => Object.assign({ id, effective: studentLimits(cfg, id), used: st[i].cases || {}, today: st[i].today || 0 }, cfg.students[id])),
    });
  }
  // The strip at the top of Live monitoring: everything that can stop a
  // student or a visitor, in one call.
  if (path === "overview" && request.method === "GET") {
    const cfg = await seminarConfig(env, true);
    const period = activePeriod(cfg);
    const why = !cfg.open ? "Closed by you" : !period ? "No period is running" : budgetBlocked(cfg) ? "The monthly budget ran out" : "";
    const d = demoOf(cfg), ds = demoState(cfg);
    const demoToday = await quotaStub(env, DEMO_QUOTA[0], DEMO_QUOTA[1]).status(dayKey(cfg)).then((x) => x.today || 0).catch(() => 0);
    const b = budgetOf(cfg);
    return jsonResponse({
      interviews: { open: !!(cfg.open && period && !budgetBlocked(cfg)), closedByYou: !cfg.open, blocked: budgetBlocked(cfg), period: period ? period.name : null, text: why },
      cases: Object.fromEntries(CASE_IDS.map((c) => [c, caseState(cfg, c)])),
      demo: { enabled: d.enabled, open: ds.open, pausedUntil: ds.pausedUntil || null, dailyCap: d.dailyCap, today: demoToday },
      budget: { monthly: b.monthly, alertPct: b.alertPct, spent: await monitorStub(env).monthCost("seminar", Date.now()).catch(() => null) },
      announcements: activeAnnouncements(cfg).length,
      provider: SEMINAR_PROVIDERS[seminarProvider(cfg)].label,
      now: Date.now(),
    });
  }
  // Consumption per student, for a spreadsheet.
  if (path === "export.csv" && request.method === "GET") {
    const cfg = await seminarConfig(env, true);
    const period = activePeriod(cfg);
    const day = dayKey(cfg);
    const ids = Object.keys(cfg.students).sort();
    const st = period ? await Promise.all(ids.map((id) => quotaStub(env, period.id, id).status(day).catch(() => ({ cases: {}, today: 0 })))) : ids.map(() => ({ cases: {}, today: 0 }));
    const cost = await monitorStub(env).byParticipant("seminar", period && period.start ? period.start : 0).catch(() => ({}));
    const q = (v) => { const t = v == null ? "" : String(v); return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const rows = [["student", "note", "status", "period"].concat(CASE_IDS.map((c) => CASE_NAMES[c].toLowerCase())).concat(["total", "today", "estimated_cost_usd", "last_reply"])];
    ids.forEach((id, i) => {
      const s = cfg.students[id], used = st[i].cases || {}, c = cost[id] || {};
      const total = CASE_IDS.reduce((n, k) => n + (used[k] || 0), 0);
      rows.push([id, s.note || "", s.suspended ? "paused" : "active", period ? period.name : ""].concat(CASE_IDS.map((k) => used[k] || 0))
        .concat([total, st[i].today || 0, c.cost != null ? c.cost.toFixed(4) : "0", c.last ? new Date(c.last).toISOString() : ""]));
    });
    const body = "\uFEFF" + rows.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
    return new Response(body, { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="clincog-usage-' + day + '.csv"',
    } });
  }
  // History of changes, and a backup of the settings.
  if (path === "history" && request.method === "GET") return jsonResponse({ entries: await configStub(env).history(), now: Date.now() });
  if (path === "backup" && request.method === "GET") {
    const cfg = await seminarConfig(env, true);
    const at = Date.now();
    return new Response(JSON.stringify({ clincog_backup: 1, at, host: STUDENT_HOSTNAME, settings: backupOf(cfg) }, null, 2), { headers: {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="clincog-settings-' + dayKey(cfg) + '.json"',
    } });
  }
  // Health: the last hour per lane, recent errors, this month's spend.
  if (path === "health" && request.method === "GET") {
    const cfg = await seminarConfig(env, true);
    const h = await monitorStub(env).health();
    h.budget = Object.assign(budgetOf(cfg), { blocked: budgetBlocked(cfg), state: cfg.budgetState || null });
    return jsonResponse(h);
  }
  if (path === "test-email" && request.method === "POST") {
    const r = await sendAdminEmail(env, "test alert", ["This is a test of the ClinCog alerts. If you are reading it, alerts will reach you."]);
    return jsonResponse(r);
  }

  // Prices: fetch now, instead of waiting for the daily run.
  if (path === "prices-refresh" && request.method === "POST") {
    const meta = await refreshPrices(env);
    cfgCache = { at: 0, value: null };
    return jsonResponse({ ok: true, check: meta });
  }

  // What Anthropic billed, next to our estimate.
  if (path === "billing" && request.method === "GET") {
    const days = Math.min(31, Math.max(7, parseInt(url.searchParams.get("days"), 10) || 30));
    try { return jsonResponse(await anthropicBilling(env, days)); }
    catch (e) { return jsonResponse({ configured: true, error: String(e.message || e) }, 200); }
  }
  if (path === "billing-status" && request.method === "GET") {
    const cfg = await seminarConfig(env, true);
    const k = (cfg.adminKeys && cfg.adminKeys.anthropic) ? "console" : env.ANTHROPIC_ADMIN_KEY ? "secret" : "none";
    const key = anthropicAdminKey(cfg, env);
    const out = { source: k, hint: key ? "…" + key.slice(-4) : null, workspace: cfg.billingWorkspace || null, workspaceName: cfg.billingWorkspaceName || null, workspaces: null };
    if (key) {
      try {
        const res = await anthropicAdmin(key, "workspaces?limit=100");
        out.workspaces = (res.data || []).map((w) => ({ id: w.id, name: w.name, archived: !!w.archived_at }));
      } catch (e) { out.error = String(e.message || e); }
    }
    return jsonResponse(out);
  }

  // Try a provider's key and model with a one-line request, before switching.
  if (path === "seminar-test" && request.method === "POST") {
    const cfg = await seminarConfig(env, true);
    const p = url.searchParams.get("provider");
    if (!SEMINAR_PROVIDERS[p]) return jsonResponse({ ok: false, error: "Unknown provider." }, 400);
    const k = seminarKey(cfg, env, p);
    if (!k) return jsonResponse({ ok: false, error: "No key is set for " + SEMINAR_PROVIDERS[p].label + "." });
    const results = {}, pending = [];
    for (const t of TIERS) {
      const model = seminarModels(cfg)[p][t];
      const started = Date.now();
      let reply;
      const history = [{ role: "user", content: "Say hello in five words." }];
      const vignette = { name: "Sam", text: "Sam, 30, is here for a routine check-up and feels well." };
      // Billed on the seminar's key like any reply, so counted like one
      // (participant "key test"), or the billing comparison would miss it.
      const meter = (usage, ok, reason) => {
        const ev = { ts: Date.now(), lane: "seminar", participant: "key test", caseId: null, model,
          tin: usage ? usage.in : 0, tout: usage ? usage.out : 0, ok: ok ? 1 : 0, ms: Date.now() - started, err: ok ? null : (reason || "Failed") };
        ev.cost = priceOf(model, ev.tin, ev.tout, env, cfg);
        pending.push(recordUsage(env, ev));
      };
      try {
        if (p === "gemini") reply = await respondAsPatientGemini(history, k, vignette, model, meter);
        else if (p === "openai") reply = await respondAsPatientOpenAI(history, k, vignette, model, meter);
        else reply = await respondAsPatient(history, k, vignette, model, meter);
        const text = await reply.text();
        results[t] = reply.ok && text.trim()
          ? { ok: true, model, ms: Date.now() - started, sample: text.trim().slice(0, 80) }
          : { ok: false, model, error: "The provider refused the request. Check the key and the model name." };
      } catch (e) {
        results[t] = { ok: false, model, error: "No answer from the provider." };
      }
    }
    await Promise.all(pending).catch(() => {});
    return jsonResponse({ ok: TIERS.every((t) => results[t].ok), results });
  }

  // The class password, only when asked for (the page shows it on request).
  if (path === "seminar-password" && request.method === "GET") {
    const cfg = await seminarConfig(env, true);
    if (cfg.password && typeof cfg.password.value === "string") return jsonResponse({ source: "console", password: cfg.password.value });
    if (cfg.password) return jsonResponse({ source: "console", password: null, note: "Set before passwords could be shown. Set it again to see it here." });
    if (env.STUDENT_ACCESS_PASSWORD) return jsonResponse({ source: "secret", password: env.STUDENT_ACCESS_PASSWORD });
    return jsonResponse({ source: "none", password: null });
  }
  if (path === "seminar" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return jsonResponse({ error: "Could not read the change." }, 400); }
    let r;
    try {
      r = await configStub(env).update(String(body.op || ""), body.args || {}, configSeed(env));
    } catch (e) {
      return jsonResponse({ error: String((e && e.message) || e).replace(/^Error: /, "") }, 400);
    }
    if (r && r.preview) return jsonResponse({ ok: true, preview: r.preview });
    cfgCache = { at: 0, value: null };
    return jsonResponse({ ok: true });
  }
  return new Response("Not found", { status: 404 });
}

function jsonResponse(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, extra || {}),
  });
}

// The browser sends the whole conversation with every question, and all of
// it is billed as input. Anything longer or odder than the chat page itself
// can produce is refused, so a hand-made request cannot run up the cost.
function validHistory(history, maxExchanges) {
  if (!Array.isArray(history) || history.length === 0) return false;
  if (history.length > maxExchanges * 2 - 1) return false;
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (!m || typeof m.content !== "string") return false;
    if (m.role !== (i % 2 === 0 ? "user" : "assistant")) return false;
    if (m.content.length > (m.role === "user" ? 2000 : 4000)) return false;
  }
  return history[history.length - 1].role === "user";
}

// What the browser shows when the password prompt is cancelled. The prompt
// itself is the browser's own and always has a Cancel button, so the gate
// cannot remove it - what it controls is that cancelling leads nowhere: this
// page is all that loads, with nothing of the app on it.
//
// It wears the site's own theme. The few files it needs for that - the
// design tokens, the self-hosted fonts and the logo - are let through the
// gate (PUBLIC_SHELL_ASSET below). They are the same files anyone can load
// from clincog.net, and none of them carries case material or app code.
// Everything else on this page is inline.
const UNAUTHORIZED_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ClinCog - Seminar access</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script>
  // The theme the student chose inside the app, if any (same key as theme-init.js).
  (function () {
    var pref = "system";
    try { pref = localStorage.getItem("clincog_theme") || "system"; } catch (e) {}
    var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  })();
</script>
<link rel="stylesheet" href="/tokens.css">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column;
    background: var(--paper, #ffffff); color: var(--text-primary, #17191c);
    font-family: var(--font-sans, system-ui, sans-serif); font-size: 16px; line-height: 1.6;
    -webkit-font-smoothing: antialiased; overflow-x: hidden;
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 22px clamp(16px, 6vw, 80px); }
  .brand { display: inline-flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; }
  .brand img { width: 32px; height: 32px; border-radius: 8px; display: block; }
  .brand span { font-family: var(--font-serif, Georgia, serif); font-size: 26px; font-weight: 400; letter-spacing: -0.02em; }
  main { flex: 1; display: grid; place-items: center; padding: 24px 16px 64px; position: relative; }
  .stage { position: relative; width: 100%; max-width: 640px; text-align: center; }
  .eyebrow { margin: 0 0 18px; color: var(--text-tertiary, #777b86); font-size: 15px; }
  h1 {
    margin: 0 0 22px; font-family: var(--font-serif, Georgia, serif); font-weight: 400;
    font-size: clamp(44px, 8vw, 80px); line-height: 1.02; letter-spacing: -0.025em;
  }
  h1 em { font-style: italic; }
  .lede { margin: 0 auto 32px; max-width: 480px; color: var(--text-secondary, #4d4d4d); font-size: clamp(16px, 2vw, 19px); line-height: 1.55; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px; height: 48px; padding: 0 26px; border: 0; border-radius: 999px;
    background: var(--ink, #17191c); color: var(--ink-text, #ffffff);
    font: 500 15px/1 var(--font-sans, system-ui, sans-serif); cursor: pointer; transition: background .15s ease;
  }
  .btn:hover { background: var(--ink-hover, #202020); }
  .btn:focus-visible { outline: 2px solid var(--accent, #5d2a1a); outline-offset: 3px; }
  .btn .arrow { transition: transform .15s ease; }
  .btn:hover .arrow { transform: translateX(3px); }
  .note { margin: 20px auto 0; max-width: 400px; color: var(--text-tertiary, #777b86); font-size: 14px; line-height: 1.5; }
  .note a { color: var(--text-primary, #17191c); font-weight: 500; text-decoration: none; }
  .note a:hover, .note a:focus-visible { text-decoration: underline; text-underline-offset: 3px; }

  /* One floating postcard, the splash page's signature device. */
  .card {
    position: absolute; width: 272px; padding: 18px 20px; border-radius: 20px; text-align: left;
    background: var(--paper, #ffffff); box-shadow: var(--shadow-lg, 0 20px 25px -5px rgba(0,0,0,.1));
  }
  .card-a { top: -40px; left: -300px; transform: rotate(-3deg); }
  .card-b { bottom: -20px; right: -300px; transform: rotate(2.5deg); background: var(--accent-soft, #fbe1d1); }
  .card small { display: flex; align-items: center; gap: 8px; color: var(--text-tertiary, #777b86); font-size: 13px; }
  .card small i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #5d2a1a); }
  .card p { margin: 10px 0 0; font-family: var(--font-serif, Georgia, serif); font-size: 19px; line-height: 1.3; letter-spacing: -0.01em; }
  .card-b small, .card-b p { color: var(--accent-ink, #5d2a1a); }
  .dots { display: flex; gap: 6px; margin-top: 14px; }
  .dots span { width: 38px; height: 26px; border-radius: 999px; background: var(--mist, #f2f2f3); }
  .dots span.on { background: var(--ink, #17191c); }
  @media (max-width: 1180px) { .card { display: none; } }
  @media (prefers-reduced-motion: reduce) { .btn, .btn .arrow { transition: none; } }
</style></head>
<body>
  <header>
    <a class="brand" href="/" aria-label="ClinCog"><img src="/favicon.svg" alt="" width="32" height="32"><span>ClinCog</span></a>
  </header>
  <main>
    <div class="stage">
<!--cards-->
      <div class="card card-a" aria-hidden="true">
        <small><i></i>Seminar · UVT</small>
        <p>The cases open once you sign in.</p>
        <div class="dots"><span></span><span></span><span class="on"></span><span></span></div>
      </div>
      <div class="card card-b" aria-hidden="true">
        <small>Password</small>
        <p>The one you received in class.</p>
      </div>
      <!--/cards-->

      <p class="eyebrow">Clinical Cognition · Seminar access</p>
      <h1>This space is for <em>the seminar</em>.</h1>
      <p class="lede">ClinCog here is reserved for students enrolled in the seminar. Sign in with your <strong>student number</strong> as the username and the password you received in class.</p>
      <button type="button" class="btn" onclick="location.reload()">Sign in <span class="arrow" aria-hidden="true">&rarr;</span></button>
      <p class="note">Not in the seminar? The public version is open at <a href="https://clincog.net">clincog.net</a>.</p>
    </div>
  </main>
</body></html>`;

// The only files served without the password: what the page above needs
// to look like the site. Exact names, GET/HEAD only.
function isPublicShellAsset(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return url.pathname === "/tokens.css" ||
         url.pathname === "/favicon.svg" ||
         url.pathname === "/manifest.webmanifest" ||
         /^\/(favicon|icon)-[a-z0-9-]+\.png$/.test(url.pathname) ||
         /^\/fonts\/[A-Za-z0-9-]+\.woff2$/.test(url.pathname);
}

function unauthorizedResponse(admin) {
  const page = admin
    ? UNAUTHORIZED_PAGE
        .replace("<title>ClinCog - Seminar access</title>", "<title>ClinCog - Admin</title>")
        .replace("Clinical Cognition · Seminar access", "Clinical Cognition · Admin")
        .replace("This space is for <em>the seminar</em>.", "This is the <em>admin</em> console.")
        .replace(/<p class="lede">[^]*?<\/p>/, '<p class="lede">Sign in with the admin username and password.</p>')
        .replace(/<!--cards-->[^]*?<!--\/cards-->/, "")
        .replace(/<p class="note">[^]*?<\/p>/, "")
    : UNAUTHORIZED_PAGE;
  return new Response(page, {
    status: 401,
    headers: {
      "WWW-Authenticate": admin
        ? 'Basic realm="ClinCog admin", charset="UTF-8"'
        : 'Basic realm="ClinCog seminar - username: your student number", charset="UTF-8"',
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

// ---- Installable web app ----------------------------------------------------
// One manifest per address, so the public site, the course instance and the
// admin console install side by side as three apps with their own names.
function appIdentity(hostname) {
  if (hostname === ADMIN_HOSTNAME) return { name: "ClinCog Admin", short: "ClinCog Admin", desc: "Live usage monitoring and seminar settings for ClinCog." };
  if (hostname === STUDENT_HOSTNAME) return { name: "ClinCog UVT", short: "ClinCog UVT", desc: "ClinCog for the seminar: interview simulated patients and evaluate them through three lenses." };
  return { name: "ClinCog", short: "ClinCog", desc: "Clinical cognition: interview simulated patients and evaluate them through three lenses." };
}
function manifestResponse(url) {
  const id = appIdentity(url.hostname);
  const isAdmin = url.hostname === ADMIN_HOSTNAME;
  const manifest = {
    id: "/", name: id.name, short_name: id.short, description: id.desc,
    start_url: "/", scope: "/", display: "standalone", lang: "en", dir: "ltr",
    background_color: "#ffffff", theme_color: "#ffffff", categories: ["education", "medical"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/favicon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: isAdmin
      ? [{ name: "Live monitoring", url: "/" }, { name: "Course", url: "/admin/course" }, { name: "Students", url: "/admin/students" }, { name: "Demo", url: "/admin/demo" }]
      : [{ name: "Dashboard", url: "/dashboard.html" }, { name: "My progress", url: "/progress.html" }],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
// On iOS the home-screen name comes from a meta tag in each page, which is
// the same file on every address; it is renamed here on the way out.
function withAppTitle(res, hostname) {
  const type = res.headers.get("Content-Type") || "";
  if (!type.includes("text/html") || (hostname !== ADMIN_HOSTNAME && hostname !== STUDENT_HOSTNAME)) return res;
  const title = appIdentity(hostname).short;
  return new HTMLRewriter()
    .on('meta[name="apple-mobile-web-app-title"]', { element(e) { e.setAttribute("content", title); } })
    .transform(res);
}

function withNoIndex(res) {
  const headers = new Headers(res.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// ---- Worker entry point -----------------------------------------------------

export default {
  // Once a day (see [triggers] in wrangler.toml): fetch current prices.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshPrices(env).catch((e) => console.error("prices:", e)));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === STUDENT_HOSTNAME && !isPublicShellAsset(request, url) && !(await checkStudentAccess(request, env))) {
      return unauthorizedResponse(false);
    }
    const isAdmin = url.hostname === ADMIN_HOSTNAME;
    if (isAdmin && !checkAdminAccess(request, env) && !isPublicShellAsset(request, url)) {
      return unauthorizedResponse(true);
    }

    if (url.pathname === "/manifest.webmanifest" && request.method === "GET") return manifestResponse(url);

    // The admin pages (live monitoring, seminar settings) exist only on the
    // admin console; the monitoring page is its front page.
    if ((/^\/admin-[a-z]+(\.html|\.js|\.css)?$/.test(url.pathname) || url.pathname.startsWith("/admin/")) && !isAdmin) {
      return new Response("Not found", { status: 404 });
    }
    // Settings pages: /admin/course, /admin/students, /admin/demo,
    // /admin/provider, /admin/history. The old single page redirects.
    if (isAdmin && /^\/admin-seminar(\.html)?$/.test(url.pathname)) return Response.redirect(new URL("/admin/course", url), 301);
    const adminPage = isAdmin && url.pathname.match(/^\/admin\/(course|students|demo|provider|history)\/?$/);
    if (adminPage) {
      const page = new URL("/admin-" + adminPage[1], url);
      return withAppTitle(withNoIndex(await env.ASSETS.fetch(new Request(page, request))), url.hostname);
    }
    if (isAdmin && (url.pathname === "/" || url.pathname === "/index.html")) {
      // The asset store serves pages without the extension ("/admin-monitor")
      // and redirects the ".html" form, so the pretty path is fetched.
      const page = new URL("/admin-monitor", url);
      return withAppTitle(withNoIndex(await env.ASSETS.fetch(new Request(page, request))), url.hostname);
    }

    // ---- Live monitoring API (admin console only) --------------------------
    if (url.pathname.startsWith("/api/monitor/")) {
      if (!isAdmin) return new Response("Not found", { status: 404 });
      return handleMonitorApi(request, url, env);
    }

    // ---- Licensed instruments ----------------------------------------------
    // The SPIN is used under a written licence that allows it only in a
    // secure electronic format, never where the public can reach it. Its
    // items live in the SPIN_CONTENT secret, not in the repository, and this
    // route serves them only on the password-protected seminar subdomain.
    // The Basic Auth check above has already run for that hostname.
    // Anywhere else it answers 404 rather than 403, so the public instance
    // does not advertise that restricted content exists.
    if (url.pathname === "/api/restricted/spin" && request.method === "GET") {
      if ((url.hostname !== STUDENT_HOSTNAME && url.hostname !== ADMIN_HOSTNAME) || !env.SPIN_CONTENT) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(env.SPIN_CONTENT, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          // never cached by a shared cache, never indexed
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      });
    }

    const match = url.pathname.match(/^\/api\/chat\/([a-z]+)$/);
    const clientIp = request.headers.get("CF-Connecting-IP");

    if (match && request.method === "POST") {
      const moduleId = match[1];
      let vignettes;
      try {
        vignettes = await loadVignettes(env, request.url);
      } catch (e) {
        return new Response(JSON.stringify({ text: "Case file unavailable." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      const vignette = vignettes[moduleId];
      if (!vignette) {
        return new Response(JSON.stringify({ text: "Unknown case." }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ text: "Malformed request." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      let { provider, key, model, tier } = resolveModelCredentials(url.hostname, body.byok, body.studentModel, env);

      // On the seminar instance every request belongs to a named student on
      // the class list, within an open period; without that there is nobody
      // to count against, so the chat does not run rather than spend
      // uncounted credits.
      let studentId = null, cfg = null, period = null, limit = 20;
      // The public demo: switched off, paused, or at its daily cap.
      if (tier === "demo") {
        cfg = await seminarConfig(env);
        const ds = demoState(cfg);
        if (!ds.open) return jsonResponse({ gate: true, text: ds.text }, 503);
      }
      if (tier === "student") {
        cfg = await seminarConfig(env);
        studentId = await studentIdentity(request, env);
        const gate = studentId ? seminarGate(cfg, studentId) : { status: 503, text: "The interview is not available right now. Tell your seminar leader." };
        if (gate) return jsonResponse({ gate: true, text: gate.text }, gate.status);
        const cs = caseState(cfg, moduleId);
        if (!cs.open) return jsonResponse({ gate: true, text: cs.text }, 503);
        period = activePeriod(cfg);
        limit = effectiveLimit(cfg, studentId, moduleId);
        // The provider and key the seminar leader chose; the tier the student
        // picked if it is one left on, otherwise the first one that is.
        provider = seminarProvider(cfg);
        key = seminarKey(cfg, env, provider);
        if (!key) return jsonResponse({ gate: true, text: "The interviews are not set up yet. Tell your seminar leader." }, 503);
        const tiers = seminarTiers(cfg);
        let want = LEGACY_TIER[body.studentModel] || body.studentModel;
        if (!tiers.includes(want)) want = tiers[0];
        model = seminarModels(cfg)[provider][want];
      }

      if (!validHistory(body.history, limit == null ? UNLIMITED_HISTORY : Math.max(limit, 1))) {
        return jsonResponse({ text: "That request is not an interview this page could have sent." }, 400);
      }

      // Demo tier spends OUR demo budget, so it gets the strict limiter.
      // Student and adopted-BYOK traffic isn't costing us anything (or is
      // already generously provisioned), so it gets the loose one - purely
      // an abuse backstop, not a budget control. Students are limited one
      // by one, not per IP: a whole class shares one address on the
      // university network.
      const limiter = tier === "demo" ? env.CHAT_RATE_LIMITER_DEMO : env.CHAT_RATE_LIMITER;
      const { success: withinLimit } = await limiter.limit({ key: studentId ? "student:" + studentId : (clientIp || "unknown") });
      if (!withinLimit) return rateLimitedResponse();

      const turnstileOk = await verifyTurnstile(body.turnstileToken, clientIp, env);
      if (!turnstileOk) {
        return new Response(
          JSON.stringify({ text: "We couldn't verify your browser. Please refresh the page and try again." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // The quota is taken only once the request is known to be genuine,
      // and given back if the model never answered.
      let quota = null, day = null, demoDay = null;
      if (tier === "demo" && demoOf(cfg).dailyCap) {
        demoDay = dayKey(cfg);
        const r = await quotaStub(env, DEMO_QUOTA[0], DEMO_QUOTA[1]).reserve("demo", null, demoDay, demoOf(cfg).dailyCap);
        if (!r.ok) return jsonResponse({ gate: true, text: "The public demo has had all its conversations for today. Come back tomorrow, or try ClinCog with your own key (Adopt with your own keys)." }, 429);
      } else if (tier === "demo") {
        // Counted even without a cap, so the console can show today's use.
        demoDay = dayKey(cfg);
        await quotaStub(env, DEMO_QUOTA[0], DEMO_QUOTA[1]).reserve("demo", null, demoDay, null);
      }
      if (studentId) {
        day = dayKey(cfg);
        quota = await quotaStub(env, period.id, studentId).reserve(moduleId, limit, day, cfg.dailyCap);
        if (!quota.ok) {
          return jsonResponse({
            quota: true, reason: quota.reason, used: quota.used, limit: quota.limit, dayCap: quota.dayCap,
            text: quota.reason === "day"
              ? "You have used today's " + quota.dayCap + " exchanges. More tomorrow."
              : "You have used all " + quota.limit + " exchanges for this interview.",
          }, 429);
        }
      }

      // Every reply is metered for the admin console: who, which case,
      // which model, how many tokens, what it cost. Recorded after the
      // stream ends, without holding up the student's reply.
      const started = Date.now();
      const usedModel = model || DEFAULT_MODEL[provider];
      const lane = { demo: "demo", student: "seminar", admin: "admin", adopted: "byok" }[tier] || "demo";
      const participant = studentId || (tier === "admin" ? "admin" : "v:" + visitorLabel(body.visitorId));
      const meter = (usage, ok, reason) => {
        const ev = {
          ts: Date.now(), lane, participant, caseId: moduleId, model: usedModel,
          tin: usage ? usage.in : 0, tout: usage ? usage.out : 0,
          ok: ok ? 1 : 0, ms: Date.now() - started, err: ok ? null : (reason || "Failed"),
        };
        const p = (async () => {
          let c = cfg;
          if (!c) { try { c = await seminarConfig(env); } catch { c = null; } }
          ev.cost = lane === "byok" ? null : priceOf(usedModel, ev.tin, ev.tout, env, c);
          const after = await recordUsage(env, ev);
          if (lane === "seminar" && after) await watchSeminar(env, after, ev);
        })();
        if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      };

      let reply;
      if (provider === "gemini") reply = await respondAsPatientGemini(body.history, key, vignette, model, meter);
      else if (provider === "openai") reply = await respondAsPatientOpenAI(body.history, key, vignette, model, meter);
      else reply = await respondAsPatient(body.history, key, vignette, model, meter);

      if (demoDay && !reply.ok) await quotaStub(env, DEMO_QUOTA[0], DEMO_QUOTA[1]).refund("demo", demoDay);
      if (!quota) return reply;
      if (!reply.ok) {
        await quotaStub(env, period.id, studentId).refund(moduleId, day);
        return reply;
      }
      const headers = new Headers(reply.headers);
      headers.set("X-Quota-Used", String(quota.used));
      headers.set("X-Quota-Limit", quota.limit == null ? "none" : String(quota.limit));
      return new Response(reply.body, { status: reply.status, headers });
    }

    // ---- Quota: where the signed-in student stands, for the chat pages ----
    if (url.pathname === "/api/quota" && request.method === "GET") {
      if (url.hostname !== STUDENT_HOSTNAME) return new Response("Not found", { status: 404 });
      const cfg = await seminarConfig(env);
      const studentId = await studentIdentity(request, env);
      if (!studentId) return jsonResponse({ available: false }, 200);
      const gate = seminarGate(cfg, studentId);
      const period = activePeriod(cfg);
      const cases = Object.fromEntries(CASE_IDS.map((c) => [c, caseState(cfg, c)]));
      if (!period) return jsonResponse({ available: true, open: false, message: gate ? gate.text : "", student: studentId, limits: studentLimits(cfg, studentId), used: {}, cases });
      const st = await quotaStub(env, period.id, studentId).status(dayKey(cfg));
      const prov = seminarProvider(cfg), mods = seminarModels(cfg)[prov];
      return jsonResponse({
        available: true, open: !gate, message: gate ? gate.text : "", student: studentId,
        limits: studentLimits(cfg, studentId), used: st.cases, dayCap: cfg.dailyCap, today: st.today,
        provider: SEMINAR_PROVIDERS[prov].label, cases,
        models: seminarTiers(cfg).map((t) => ({ tier: t, label: TIER_LABEL[t], model: prettyModel(mods[t]) })),
      });
    }

    // ---- Demo status, for the chat pages on the public site ---------------
    if (url.pathname === "/api/demo" && request.method === "GET") {
      if (url.hostname === STUDENT_HOSTNAME || isAdmin) return jsonResponse({ open: true });
      const cfg = await seminarConfig(env);
      const ds = demoState(cfg);
      return jsonResponse({ open: ds.open, text: ds.open ? "" : ds.text });
    }

    // ---- Announcements for students (seminar instance) ---------------------
    if (url.pathname === "/api/announcements" && request.method === "GET") {
      if (url.hostname !== STUDENT_HOSTNAME) return jsonResponse({ announcements: [] });
      const cfg = await seminarConfig(env);
      return jsonResponse({ announcements: activeAnnouncements(cfg) });
    }

    // ---- Quota administration (seminar leader) ----------------------------
    // Look up or reset one student's counts, e.g. after a lost connection:
    //   GET  /api/admin/quota?student=AB123
    //   POST /api/admin/quota?student=AB123&case=anxiety   (omit case: all four)
    // with the header  X-Admin-Token: <ADMIN_TOKEN secret>. Without that
    // secret configured the route does not exist.
    if (url.pathname === "/api/admin/quota") {
      const token = request.headers.get("X-Admin-Token") || "";
      if (url.hostname !== STUDENT_HOSTNAME || !env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return new Response("Not found", { status: 404 });
      }
      const studentId = normaliseStudentId(url.searchParams.get("student"));
      if (!studentId) return jsonResponse({ error: "student is required" }, 400);
      const cfg = await seminarConfig(env);
      const period = activePeriod(cfg);
      if (!period) return jsonResponse({ student: studentId, onList: !!cfg.students[studentId], period: null, used: {} });
      const stub = quotaStub(env, period.id, studentId);
      if (request.method === "POST") await stub.reset(url.searchParams.get("case") || null);
      return jsonResponse({ student: studentId, onList: !!cfg.students[studentId], period: period.name, limits: studentLimits(cfg, studentId), used: await stub.status() });
    }

    // ---- Contact form ----------------------------------------------------
    // The page asks who it is writing to rather than having it hardcoded.
    if (url.pathname === "/api/contact/info" && request.method === "GET") {
      return new Response(JSON.stringify(contactIdentity(env)), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    if (url.pathname === "/api/contact" && request.method === "POST") {
      // Fail closed: an unconfigured instance says so instead of falling back
      // to a default recipient who never agreed to receive the mail.
      if (!contactAddress(env)) {
        return contactError(503, "The contact form is not configured on this instance.");
      }

      const { success: withinLimit } =
        await env.CONTACT_RATE_LIMITER.limit({ key: clientIp || "unknown" });
      if (!withinLimit) {
        return contactError(429, "Too many messages from this connection. Try again in a few minutes.");
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return contactError(400, "Could not read the message.");
      }

      const turnstileOk = await verifyTurnstile(body.turnstileToken, clientIp, env);
      if (!turnstileOk) {
        return contactError(403, "Could not verify this request came from a browser. Reload the page and try again.");
      }

      const sent = await sendContactEmail(body, env, url.hostname);
      return new Response(JSON.stringify(sent.ok ? { ok: true } : { error: sent.error }), {
        status: sent.ok ? 200 : 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/api/icd/token" && request.method === "POST") {
      const { success: withinLimit } = await env.ICD_RATE_LIMITER.limit({ key: clientIp || "unknown" });
      if (!withinLimit) return rateLimitedResponse();

      let body;
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const { clientId, clientSecret } = resolveIcdCredentials(url.hostname, body.byok, env);

      try {
        const token = await getIcdToken(clientId, clientSecret);
        return new Response(JSON.stringify({ token }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "ICD-API unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Anything else (the pages, CSS, JS) is served as a static file from /public.
    const asset = await env.ASSETS.fetch(request);
    // The seminar subdomain carries licensed material, so nothing on it may
    // be indexed. Basic Auth already keeps crawlers out; this makes the
    // intent explicit to any that authenticate or follow a leaked link.
    if (url.hostname === STUDENT_HOSTNAME || isAdmin) return withAppTitle(withNoIndex(asset), url.hostname);
    return asset;
  },
};

async function respondAsPatient(history, anthropicKey, vignette, model = "claude-haiku-4-5-20251001", meter = null) {
  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: buildSystemPrompt(vignette),
        messages: history,
        stream: true,
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error("Anthropic error:", errorText);
      if (meter) meter(null, false, providerReason(anthropicResponse.status, errorText));
      return new Response(JSON.stringify({ text: "There was an error generating a response." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Anthropic streams Server-Sent Events - "content_block_delta" events
    // carry the incremental text. We re-emit just that plain text, chunk
    // by chunk, so the frontend doesn't need to know anything about SSE
    // or which provider is even being used underneath.
    return streamPlainTextFromSSE(anthropicResponse, (parsed) =>
      parsed.type === "content_block_delta" ? parsed.delta?.text : null
    , meter, (parsed, u) => {
      // message_start carries the input count, message_delta the running
      // output count (the last one is the total).
      const m = parsed.type === "message_start" ? parsed.message?.usage : null;
      if (m) {
        u.in = (m.input_tokens || 0) + (m.cache_creation_input_tokens || 0) + (m.cache_read_input_tokens || 0);
        u.out = m.output_tokens || 0;
      }
      if (parsed.type === "message_delta" && parsed.usage) u.out = parsed.usage.output_tokens || u.out;
    });

  } catch (err) {
    if (meter) meter(null, false, "No connection to the provider");
    return new Response(JSON.stringify({ text: "Invalid request." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// The demo tier's model. Gemini's API shape differs from Anthropic's in
// several ways that matter here:
//   - endpoint takes the model name in the URL, auth via x-goog-api-key
//   - conversation turns are "contents"/"parts", not "messages"/"content"
//   - roles are "user"/"model", not "user"/"assistant"
//   - the system prompt is its own top-level "systemInstruction" field
//   - response text lives at candidates[0].content.parts[0].text
// A short, content-free reason for a failed reply, for the admin console:
// the HTTP status and the provider's own error message, never the student's
// text.
function providerReason(status, body) {
  let msg = "";
  try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error.type)) || j.message || ""; } catch { msg = ""; }
  const label = { 400: "Bad request", 401: "Key not accepted", 403: "Not allowed", 404: "Model not found", 429: "Provider limit reached", 500: "Provider error", 503: "Provider overloaded", 529: "Provider overloaded" }[status] || "Error";
  return (status + " " + label + (msg ? ": " + String(msg).replace(/\s+/g, " ").slice(0, 140) : "")).trim();
}

// ---- Streaming helper ------------------------------------------------------
// Every provider streams Server-Sent Events, but each wraps the actual
// text delta in a differently-shaped JSON payload. Rather than have the
// frontend understand three different SSE dialects, we parse each
// provider's stream here, server-side, and re-emit a single uniform
// format: plain text chunks, nothing else. chat.js just reads bytes and
// appends them - it never needs to know which provider answered.
function streamPlainTextFromSSE(providerResponse, extractDelta, meter, extractUsage) {
  const encoder = new TextEncoder();
  const usage = { in: 0, out: 0 };
  const decoder = new TextDecoder();
  const reader = providerResponse.body.getReader();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop(); // last (possibly incomplete) line carries over
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = extractDelta(parsed);
              if (delta) controller.enqueue(encoder.encode(delta));
              if (extractUsage) extractUsage(parsed, usage);
            } catch {
              // Non-JSON or partial line - safe to skip, next chunk will
              // usually complete it.
            }
          }
        }
      } catch (err) {
        console.error("Stream relay error:", err);
      } finally {
        controller.close();
        if (meter) meter(usage, true);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function respondAsPatientGemini(history, geminiKey, vignette, model = "gemini-3.5-flash", meter = null) {
  try {
    const contents = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: buildSystemPrompt(vignette) }] },
          generationConfig: {
            // Gemini 2.5/3.x models "think" before answering by default,
            // and those internal reasoning tokens count against this same
            // budget as the visible reply - a short budget can let
            // thinking alone consume nearly all of it, cutting the actual
            // answer off mid-sentence. The clean fix would be disabling
            // thinking via thinkingConfig, but that field has multiple
            // independently-reported 400 errors specifically on this
            // streaming endpoint with gemini-3.x models (Google's own
            // developer forum, several unrelated projects, same error
            // pattern) - not worth the fragility. A generous ceiling that
            // comfortably covers thinking + a real reply is the safer fix.
            maxOutputTokens: 1024,
          },
          // Gemini's default safety filters are tuned for general
          // consumer use and can misfire on legitimate clinical content
          // (this platform's cases involve delusions, suicidal ideation,
          // substance dependence, by design). Loosened to reduce false
          // positives - worth watching in practice and tightening back up
          // if it ever under-blocks something it shouldn't.
          safetySettings: [
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          ],
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini error:", errorText);
      if (meter) meter(null, false, providerReason(geminiResponse.status, errorText));
      return new Response(JSON.stringify({ text: "There was an error generating a response." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // With ?alt=sse, Gemini streams proper Server-Sent Events - without
    // it, this same endpoint would instead return one giant JSON array,
    // which the SSE parser below could not read at all (a real, easy-to-
    // hit gotcha, confirmed by several independent implementation
    // write-ups). Each event repeats the same candidates/parts shape as
    // the non-streaming response, just one incremental chunk at a time.
    return streamPlainTextFromSSE(geminiResponse, (parsed) =>
      parsed.candidates?.[0]?.content?.parts?.[0]?.text
    , meter, (parsed, u) => {
      // Every chunk repeats usageMetadata with the running totals. Thinking
      // tokens are billed as output.
      const m = parsed.usageMetadata;
      if (m) {
        u.in = m.promptTokenCount || u.in;
        u.out = (m.candidatesTokenCount || 0) + (m.thoughtsTokenCount || 0);
      }
    });

  } catch (err) {
    if (meter) meter(null, false, "No connection to the provider");
    return new Response(JSON.stringify({ text: "Invalid request." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// OpenAI's Chat Completions API - the most stable, longest-unchanged
// format of the three. Roles are "system"/"user"/"assistant" - the
// system prompt goes in the messages array itself (unlike Anthropic and
// Gemini, which each have a separate top-level field for it), and our
// internal history already uses "user"/"assistant", so no role
// conversion is needed here, unlike the Gemini integration.
async function respondAsPatientOpenAI(history, openaiKey, vignette, model = "gpt-5-nano", meter = null) {
  try {
    const messages = [
      { role: "system", content: buildSystemPrompt(vignette) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Streamed like the other two, so the page shows the reply as it is
    // written. The GPT-5 family takes max_completion_tokens (not
    // max_tokens) and spends part of it on reasoning, hence the headroom;
    // include_usage adds the token counts to the last chunk.
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: 1024,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI error:", errorText);
      if (meter) meter(null, false, providerReason(openaiResponse.status, errorText));
      return new Response(JSON.stringify({ text: "There was an error generating a response." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return streamPlainTextFromSSE(openaiResponse, (parsed) =>
      parsed.choices?.[0]?.delta?.content
    , meter, (parsed, u) => {
      if (parsed.usage) {
        u.in = parsed.usage.prompt_tokens || 0;
        u.out = parsed.usage.completion_tokens || 0;
      }
    });

  } catch (err) {
    if (meter) meter(null, false, "No connection to the provider");
    return new Response(JSON.stringify({ text: "Invalid request." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
