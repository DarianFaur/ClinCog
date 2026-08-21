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
  details, intentions, or urgency that isn't already there.
- If the case file mentions sensitive material (thoughts of death,
  self-harm), present it matter-of-factly, exactly as documented, without
  dramatizing or elaborating on it.
- If a student's question would require inventing or elaborating on
  self-harm or suicide detail beyond the case file, stay in character but
  decline gently (e.g. "I don't really want to get into more detail about
  that") rather than generating new content.

CASE FILE:
${vignette.text}
`.trim();
}

// ---- Worker entry point -----------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/chat\/([a-z]+)$/);

    if (match && request.method === "POST") {
      const moduleId = match[1];
      const vignette = VIGNETTES[moduleId];
      if (!vignette) {
        return new Response(JSON.stringify({ text: "Unknown case." }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return respondAsPatient(request, env, vignette);
    }

    // Anything else (the pages, CSS, JS) is served as a static file from /public.
    return env.ASSETS.fetch(request);
  },
};

async function respondAsPatient(request, env, vignette) {
  try {
    const { history } = await request.json();

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
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
