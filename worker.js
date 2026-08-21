// ============================================================================
// worker.js
//
// Acesta NU rulează în browser-ul studentului. Rulează pe serverele
// Cloudflare, ca un mic "portar" între pagina ta (index.html) și API-ul
// Anthropic. Singurul lui rol: primește întrebarea studentului, adaugă
// vinieta ca system prompt, sună către Anthropic, trimite răspunsul înapoi.
//
// Cheia API NU există niciunde în acest fișier - o ținem separat, ca
// "secret" în Cloudflare (vezi pasul de deploy). Așa nu ajunge niciodată
// vizibilă în browser-ul studentului.
// ============================================================================

// Vinieta - EXACT același text ca în index.html. Modelul va avea voie
// să răspundă DOAR pe baza acestui text.
const VINIETA = `
Andrei, 24 de ani, student, se prezintă la cabinet acompaniat de mama sa.
De aproximativ două luni, raportează oboseală constantă, dificultăți de
concentrare la cursuri și pierderea interesului pentru activitățile pe care
le făcea cu plăcere (fotbal, ieșit cu prietenii). Doarme mult mai mult decât
înainte, dar tot se simte obosit. A slăbit 4 kg în ultima lună fără să
încerce. Neagă idei de autovătămare, dar spune că uneori se gândește
"ce rost mai are".
`;

// Instrucțiunile date modelului. Aici e restricția-cheie: modelul are voie
// SĂ RĂSPUNDĂ DOAR DIN ACEST TEXT, nu să inventeze detalii noi.
const SYSTEM_PROMPT = `
Ești un instrument didactic pentru un curs de psihopatologie. Studentul îți
pune întrebări de tip interviu clinic despre un caz. Ai voie să răspunzi
EXCLUSIV pe baza vinietei de mai jos - nu inventa niciun simptom, dată sau
detaliu care nu apare în text.

Dacă studentul întreabă ceva ce nu apare în vinietă, răspunde exact atât:
"Această informație nu este menționată în vinietă."

Nu juca rolul pacientului la persoana întâi ("mă simt trist") - rămâi la
persoana a treia, ca un asistent care confirmă sau neagă informația din
text ("Da, textul menționează oboseală constantă de două luni.").

VINIETA:
${VINIETA}
`;

export default {
  async fetch(request, env) {

    // Browserele fac mai întâi o cerere "OPTIONS" de verificare (CORS)
    // înainte de cererea reală POST. Trebuie să răspundem la ea explicit.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Doar cereri POST sunt acceptate.", { status: 405 });
    }

    try {
      const { istoric } = await request.json();

      // Apelul real către API-ul Anthropic.
      const raspunsAnthropic = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY, // secretul, injectat de Cloudflare
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: istoric, // istoricul conversației, trimis de index.html
        }),
      });

      if (!raspunsAnthropic.ok) {
        const textEroare = await raspunsAnthropic.text();
        console.error("Eroare Anthropic:", textEroare);
        return new Response(JSON.stringify({ text: "Eroare la generarea răspunsului." }), {
          status: 502,
          headers: corsHeaders(),
        });
      }

      const date = await raspunsAnthropic.json();
      const text = date.content?.[0]?.text ?? "(fără răspuns)";

      return new Response(JSON.stringify({ text }), {
        headers: corsHeaders(),
      });

    } catch (eroare) {
      return new Response(JSON.stringify({ text: "Cerere invalidă." }), {
        status: 400,
        headers: corsHeaders(),
      });
    }
  },
};

// Anteturile CORS - permit paginii tale HTML să "vorbească" cu acest Worker.
// Pentru pilotare, "*" (oricine) e suficient. Când ai domeniul final,
// poți restrânge la "https://domeniul-tau.pages.dev".
function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
