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

const VIGNETTES = {

  schizophrenia: {
    name: "Dennis",
    text: `
Dennis is a 25-year-old college student, brought in by his family after they
found him attempting to barricade himself in his bedroom, convinced shadowy
figures were coming to take him away. This is his first psychiatric contact.
Known for academic excellence, he began withdrawing roughly a year ago -
spending long hours alone, losing interest in things he once enjoyed, and
letting his hygiene slip (unwashed clothes, unkempt appearance). His grades
declined sharply; professors noted he struggled to concentrate and that his
written work, when submitted at all, was disorganized and lacked coherence.
His family initially attributed this to academic stress. In recent weeks his
condition escalated: his parents found him pacing the house at night,
muttering to himself and glancing nervously at the windows, insisting
government agents had planted cameras to monitor him and that his family was
conspiring against him. He refuses food his mother prepares, convinced it is
poisoned. He has been observed laughing suddenly for no apparent reason and
arguing with people who are not there, and spends hours responding to voices
no one else can hear. His speech often shifts abruptly between unrelated
topics mid-sentence, losing his train of thought partway through. He has
been seen wandering the streets at night in mismatched clothing, gesturing
at unseen figures, and was once found standing motionless in the backyard,
staring at the sky and whispering about secret messages hidden in the stars.
`.trim(),
  },

  depression: {
    name: "Darren",
    text: `
Darren is a 34-year-old high school English teacher, in his first psychiatric
contact. For several weeks he has struggled to get out of bed most mornings,
lying there numb for hours. Once known for energetic lectures, he now dreads
facing his students and says things like "nothing I do matters." He has
withdrawn from colleagues, stopped cooking regularly (skipping meals or
eating whatever needs no decision), and lost weight without trying. His
sleep is restless and unrefreshing; his mind "goes blank" when trying to
plan even simple tasks, which he describes as "trying to think through fog."
He occasionally has a fleeting hour of restless agitation before returning
to flatness, and small comments from colleagues can make his chest tighten
with irritation, which surprises him. In the past few weeks he has
increasingly thought that everyone around him would be better off if he
disappeared. Last week, for the first time, he briefly considered how he
might act on that thought - frightened enough to stop, but not enough to
tell anyone. On one occasion he pressed his nails hard into his forearm,
not fully understanding why, only that it made the internal noise quieter
for a moment. At school he has missed several grading deadlines and once
walked out of class mid-lesson, overwhelmed and on the verge of tears.
`.trim(),
  },

  anxiety: {
    name: "Alex",
    text: `
Alex is a 24-year-old undergraduate student, referred by their GP after
persistent difficulties with academic performance and social engagement.
Alex describes a longstanding pattern, dating back to early adolescence, of
intense fear in situations where they might be observed or evaluated by
others. In seminars, Alex sits near the door and rarely contributes,
convinced any comment will sound foolish; when called on unexpectedly, Alex
reports a racing heart, flushed cheeks, and a sensation of the throat
closing up, followed by hours of replaying what was said afterward. Social
occasions outside university are managed through avoidance: Alex has
declined two customer-facing part-time jobs in the past year and cancelled
plans with friends citing vague physical complaints. At a recent networking
event, attended only because a friend stood nearby the whole time, Alex left
after forty minutes feeling distressed and out of place. Alex knows the fear
is "probably excessive" but has always attributed it to shyness or
personality, and has never sought help before. There is no history of panic
attacks outside social contexts, no substance use, and no psychotic
symptoms. The difficulties have been present for at least three years and
have worsened noticeably since starting university.
`.trim(),
  },

  addiction: {
    name: "Jordan",
    text: `
Jordan is a 25-year-old software engineer, self-referred after a formal
performance review noted missed sprint deadlines, late arrivals, and
declining code quality over six months. Jordan is intelligent and
self-aware but minimizes concern ("I work in a high-stress environment,
everyone on my team drinks after deploys - I just need to dial it back"),
rating motivation to change 5/10. Drinking began at university (18) and
escalated in his first engineering job (20-22) to manage social anxiety at
networking events. Over the past 14 months it has become daily: 4-5 drinks
on weeknights, 10-14 on weekend days, usually starting within an hour of
finishing work from home. He keeps a small cooler under his standing desk
"so he doesn't have to keep getting up." He has tried to stop three times
in the past year (after a partner confrontation, a health scare, and a bet
with a colleague), none lasting beyond five days before returning to his
previous intake, often exceeding it. On abstinent days he gets a fine hand
tremor, sweating, and severe insomnia, resolving within 20-30 minutes of
his first drink; he opens a beer before his first morning call about 3-4
days a week. Tolerance has roughly doubled versus 18 months ago. He has
missed four sprint deadlines this quarter and received one written warning,
withdrawn from his climbing gym, declined team social events, and his
partner of three years has issued an ultimatum and is sleeping in the
spare room. He has driven to restock alcohol while over the legal limit on
several occasions. He reports frequent intrusive urges to drink during the
workday, irritability, and difficulty concentrating, worse on low-intake
days. No prior psychiatric treatment; his father was a heavy drinker.
`.trim(),
  },

};

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

const SUPPORTED_BYOK_PROVIDERS = new Set(["anthropic", "gemini", "openai"]);

// Whitelisted per provider, so a BYOK request can only ever select a model
// we've actually verified exists and behaves reasonably - never an
// arbitrary string passed through untouched.
const ALLOWED_MODELS = {
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5"],
  gemini: ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.1-pro"],
  openai: ["gpt-5-nano", "gpt-5.6-terra", "gpt-5.6-sol"],
};

// Students get a choice too, but a deliberately narrower one than BYOK -
// Haiku or Sonnet, never Opus. This list is intentionally separate from
// ALLOWED_MODELS.anthropic (which does include Opus, for adopting
// instructors spending their own money) so the exclusion can't drift by
// accident if that list is ever edited.
const STUDENT_ALLOWED_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-5"];

function resolveModelCredentials(hostname, byok, studentModel, env) {
  if (hostname === STUDENT_HOSTNAME) {
    const model = STUDENT_ALLOWED_MODELS.includes(studentModel) ? studentModel : undefined;
    return { provider: "anthropic", key: env.ANTHROPIC_API_KEY, model, tier: "student" };
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
function checkStudentAccess(request, env) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) return false;
  try {
    const decoded = atob(auth.slice(6));
    const separatorIndex = decoded.indexOf(":");
    const password = separatorIndex === -1 ? decoded : decoded.slice(separatorIndex + 1);
    return password === env.STUDENT_ACCESS_PASSWORD;
  } catch {
    return false;
  }
}

function unauthorizedResponse() {
  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ClinCog - seminar access"' },
  });
}

// ---- Worker entry point -----------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === STUDENT_HOSTNAME && !checkStudentAccess(request, env)) {
      return unauthorizedResponse();
    }

    const match = url.pathname.match(/^\/api\/chat\/([a-z]+)$/);
    const clientIp = request.headers.get("CF-Connecting-IP");

    if (match && request.method === "POST") {
      const moduleId = match[1];
      const vignette = VIGNETTES[moduleId];
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

      const { provider, key, model, tier } = resolveModelCredentials(url.hostname, body.byok, body.studentModel, env);

      // Demo tier spends OUR demo budget, so it gets the strict limiter.
      // Student and adopted-BYOK traffic isn't costing us anything (or is
      // already generously provisioned), so it gets the loose one - purely
      // an abuse backstop, not a budget control.
      const limiter = tier === "demo" ? env.CHAT_RATE_LIMITER_DEMO : env.CHAT_RATE_LIMITER;
      const { success: withinLimit } = await limiter.limit({ key: clientIp || "unknown" });
      if (!withinLimit) return rateLimitedResponse();

      const turnstileOk = await verifyTurnstile(body.turnstileToken, clientIp, env);
      if (!turnstileOk) {
        return new Response(
          JSON.stringify({ text: "We couldn't verify your browser. Please refresh the page and try again." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      if (provider === "gemini") return respondAsPatientGemini(body.history, key, vignette, model);
      if (provider === "openai") return respondAsPatientOpenAI(body.history, key, vignette, model);
      return respondAsPatient(body.history, key, vignette, model);
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
    return env.ASSETS.fetch(request);
  },
};

async function respondAsPatient(history, anthropicKey, vignette, model = "claude-haiku-4-5-20251001") {
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
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error("Anthropic error:", errorText);
      return new Response(JSON.stringify({ text: "There was an error generating a response." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await anthropicResponse.json();
    const text = data.content?.[0]?.text ?? "(no response)";

    return new Response(JSON.stringify({ text }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
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
async function respondAsPatientGemini(history, geminiKey, vignette, model = "gemini-3.5-flash") {
  try {
    const contents = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: buildSystemPrompt(vignette) }] },
          generationConfig: { maxOutputTokens: 300 },
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
      return new Response(JSON.stringify({ text: "There was an error generating a response." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await geminiResponse.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no response)";

    return new Response(JSON.stringify({ text }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
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
async function respondAsPatientOpenAI(history, openaiKey, vignette, model = "gpt-5-nano") {
  try {
    const messages = [
      { role: "system", content: buildSystemPrompt(vignette) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        messages,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI error:", errorText);
      return new Response(JSON.stringify({ text: "There was an error generating a response." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await openaiResponse.json();
    const text = data.choices?.[0]?.message?.content ?? "(no response)";

    return new Response(JSON.stringify({ text }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ text: "Invalid request." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
