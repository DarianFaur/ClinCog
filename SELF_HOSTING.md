# Cum să găzduiești propria ta versiune de ClinCog

Acest ghid te duce de la zero — nici cont, nici cod, nici experiență tehnică —
până la o versiune complet a ta de ClinCog, funcțională, cu propria cheie API,
propriul domeniu, complet independentă de orice altă instalare a platformei.
Nu trece nimic prin `clincog.net` — ai control total, iar tu ești singurul
care vede cheia ta.

Durează, prima dată, undeva la 30-45 de minute, majoritatea timpul fiind
descărcări și așteptat răspunsuri de la servicii externe (Cloudflare, WHO).
Nu ai nevoie de experiență de programare — doar de răbdare să copiezi comenzi
exact cum sunt scrise.

---

## Ce vei avea la final

- Propriul tău site, la o adresă de forma `numele-tau.workers.dev` (gratuit,
  imediat) — sau, dacă vrei, pe propriul tău domeniu, dacă ai unul.
- Propria cheie Anthropic, plătită de tine, folosită doar de instanța ta.
- Control complet: poți schimba orice, opri orice, nu depinzi de nimeni.

## Glosar rapid — termenii pe care-i vei întâlni

Nu ai nevoie să-i memorezi, doar să știi ce înseamnă când îi vezi:

- **Terminal** — o fereastră unde tastezi comenzi text, în loc să dai clic pe
  butoane. Pe Mac se numește "Terminal" (îl găsești în Launchpad → Other).
  Pe Windows, folosim "PowerShell" (căutare din Start → scrie "PowerShell").
- **Comandă** — o linie de text pe care o tastezi (sau o copiezi) în terminal
  și apeși Enter. Terminalul execută ce scrie acolo.
- **npm** — un instrument care instalează alte instrumente. Vine automat cu
  Node.js (pasul 1).
- **Cloudflare Worker** — "serverul" care rulează codul tău. Nu găzduiești
  nimic pe propriul calculator; Cloudflare rulează totul, gratuit, la scara
  unei clase de studenți.
- **Secret** — o cheie API sau o parolă, stocată în siguranță de Cloudflare,
  niciodată vizibilă în cod sau pe internet.

---

## Pasul 1 — Instalează Node.js

Node.js e programul care-ți dă acces la `npm` (pasul următor).

1. Mergi la **[nodejs.org](https://nodejs.org)**.
2. Descarcă versiunea recomandată ("LTS") pentru sistemul tău (Windows/Mac).
3. Deschide fișierul descărcat și urmează instalarea (Next → Next → Install,
   fără să bifezi/debifezi nimic special).
4. Deschide terminalul (vezi glosarul de mai sus) și scrie:
   ```
   node --version
   ```
   Dacă vezi ceva de genul `v22.x.x`, ai reușit. Dacă primești o eroare de
   tip "comanda nu a fost găsită", închide și redeschide terminalul (uneori
   e nevoie de un restart al lui) și încearcă din nou.

## Pasul 2 — Descarcă codul ClinCog

1. Mergi la pagina GitHub a proiectului (link-ul pe care ți l-a dat autorul).
2. Caută butonul verde **"Code"** → **"Download ZIP"**.
3. Dezarhivează fișierul descărcat undeva ușor de găsit — de exemplu, direct
   pe Desktop, într-un folder numit `clincog`.

## Pasul 3 — Creează-ți cont Cloudflare

1. Mergi la **[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)**.
2. Creează un cont gratuit (email + parolă). Nu ai nevoie de card, de niciun
   plan plătit — tot ce urmează funcționează pe planul gratuit.
3. Confirmă emailul dacă ți se cere.

## Pasul 4 — Deschide terminalul în folderul corect

1. Deschide terminalul.
2. Scrie `cd ` (cu spațiu după), apoi **trage folderul `clincog`** (cel
   dezarhivat la pasul 2) direct în fereastra terminalului — calea se
   completează automat. Apasă Enter.
   - Pe Mac, comanda ar arăta cam așa:
     `cd /Users/numele-tau/Desktop/clincog`
   - Pe Windows, cam așa:
     `cd C:\Users\numele-tau\Desktop\clincog`
3. Confirmă că ești în locul corect:
   ```
   ls
   ```
   (pe Windows: `dir`) — ar trebui să vezi fișiere ca `worker.js` și
   `wrangler.toml` în listă.

## Pasul 5 — Instalează și conectează Wrangler

Wrangler e instrumentul care trimite codul tău către Cloudflare.

1. În terminal, scrie:
   ```
   npm install -g wrangler
   ```
   Așteaptă până se termină (poate dura 1-2 minute).
2. Conectează-l la contul tău Cloudflare:
   ```
   wrangler login
   ```
   Se deschide o pagină în browser — apasă "Allow" / "Autorizează". Revii
   apoi în terminal, unde ar trebui să vezi un mesaj de succes.

## Pasul 6 — Obține propria cheie Anthropic

1. Mergi la **[console.anthropic.com](https://console.anthropic.com)**,
   creează-ți cont dacă nu ai deja.
2. Adaugă o metodă de plată (Anthropic nu are tier gratuit permanent, dar
   costurile pentru o clasă sunt mici — vezi nota de buget mai jos).
3. Din meniu, mergi la **API Keys** → **Create Key**. Dă-i un nume (orice,
   de ex. "ClinCog") și copiază cheia generată — arată cam așa:
   `sk-ant-...`. **Copiaz-o acum** — unele console-uri n-o mai arată a doua
   oară.
4. **Recomandare de buget**: din același Console, caută secțiunea de
   Billing/Limits și setează un plafon lunar de cheltuială (de exemplu 20-30
   USD, suficient pentru o clasă), plus o alertă la 50-90% din plafon — ca
   să nu fii surprins de o factură neașteptată.

## Pasul 7 — Ajustează un singur lucru în cod, înainte de deploy

Codul original are hardcodat un subdomeniu specific autorului
(`uvt.clincog.net`), folosit pentru a decide ce cheie API se folosește.
Pe **instanța ta**, acel subdomeniu nu va exista niciodată — deci, fără
acest pas, platforma ta ar cădea implicit pe un tier "demo" cu limite
foarte stricte, chiar și pentru propriii tăi studenți. Reparăm asta acum.

1. Deschide folderul `clincog` cu orice editor de text simplu — dacă nu ai
   unul preferat, [VS Code](https://code.visualstudio.com) e gratuit și
   simplu de instalat.
2. Deschide fișierul **`worker.js`**.
3. Caută (Ctrl+F / Cmd+F) linia:
   ```
   const STUDENT_HOSTNAME = "uvt.clincog.net";
   ```
4. Înlocuiește `"uvt.clincog.net"` cu domeniul pe care vei folosi tu — dacă
   nu ai un domeniu propriu încă, poți pune orice, de exemplu:
   ```
   const STUDENT_HOSTNAME = "clincog-mit.workers.dev";
   ```
   (o să vezi exact ce adresă vei primi la pasul 9 — dacă vrei, poți reveni
   și corecta acest rând după aceea, apoi redeploy).
5. Salvează fișierul.

Cu acest singur rând corectat, **toată** platforma ta va folosi automat
cheia ta Anthropic, generos, fără să te mai preocupe deloc de tier-ul demo,
Gemini, sau BYOK — acelea rămân relevante doar pentru instanța originală de
la `clincog.net`.

## Pasul 8 — Simplifică `wrangler.toml`

Deschide **`wrangler.toml`** din același folder. Șterge complet blocul
`routes = [ ... ]` (cele câteva linii care menționează `clincog.net`,
`www.clincog.net`, `uvt.clincog.net`) — acelea sunt domeniile autorului
original, nu ale tale. Fără acel bloc, Cloudflare îți dă automat o adresă
gratuită de tipul `numele-proiectului.contul-tau.workers.dev` — perfect
pentru a începe; poți adăuga oricând un domeniu propriu mai târziu (pasul
10).

Fișierul tău ar trebui să arate cam așa după ștergere:
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

[assets]
directory = "./public"
binding = "ASSETS"
```

(Poți lăsa restul blocurilor `[[ratelimits]]` — nu strică nimic dacă rămân,
doar cele legate strict de tier-ul demo/Gemini nu ți se vor aplica ție.)

## Pasul 9 — Setează cheia ta ca secret, apoi fă deploy

Înapoi în terminal (asigură-te că ești tot în folderul `clincog`):

1. Setează cheia Anthropic:
   ```
   wrangler secret put ANTHROPIC_API_KEY
   ```
   Ți se cere să lipești cheia (cea de la pasul 6) — o lipești și apeși
   Enter. Nu se vede pe ecran cât o tastezi/lipești — e normal, e o măsură
   de siguranță.
2. Fă primul deploy:
   ```
   wrangler deploy
   ```
   Așteaptă câteva secunde. La final, terminalul îți arată adresa ta live
   — ceva de forma:
   ```
   https://clincog.numele-contului-tau.workers.dev
   ```

## Pasul 10 — Testează

Deschide adresa primită la pasul 9 într-un browser. Ar trebui să vezi
ecranul de start al ClinCog. Introdu un nume, deschide un caz, încearcă o
conversație cu pacientul — dacă primești un răspuns, totul funcționează.

Dacă nu ai reparat exact adresa la Pasul 7 (poate n-o știai încă), acum o
ai — întoarce-te, corectează linia din `worker.js` cu adresa reală primită
aici, salvează, și rulează din nou `wrangler deploy` (fără să mai repeți
pasul cu secretul, acela rămâne setat).

## Pasul 11 (opțional) — Domeniu propriu

Dacă ai deja un domeniu (de exemplu, cumpărat separat, sau unul al
universității tale), poți să-l legi de Worker:

1. În [dash.cloudflare.com](https://dash.cloudflare.com), adaugă domeniul
   tău ca site nou în Cloudflare (dacă nu e deja acolo).
2. Mergi la Workers & Pages → worker-ul tău → Settings → Domains & Routes
   → Add → Custom Domain, și introdu domeniul dorit.
3. Așteaptă câteva minute pentru propagare DNS.

## Pasul 12 (opțional, dar recomandat) — Protecții suplimentare

Platforma originală include protecție împotriva traficului automatizat
(rate limiting, deja prezent implicit) și verificare anti-bot (Turnstile).
Turnstile e opțional pentru o clasă mică, controlată, dar recomandat dacă
link-ul tău ar putea circula public:

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile → Add
   widget manually → tip **Invisible** → notează Site Key și Secret Key.
2. În `public/chat.js`, caută linia `TURNSTILE_SITE_KEY = "..."` și
   înlocuiește cu Site Key-ul tău.
3. În terminal: `wrangler secret put TURNSTILE_SECRET_KEY`, lipește Secret
   Key-ul.
4. `wrangler deploy` din nou.

Dacă preferi să sari peste acest pas acum, platforma funcționează normal
fără el — doar fără stratul suplimentar anti-bot.

## Dacă vrei și widget-ul de căutare ICD-11 (diagnostic probabil)

Necesită înregistrare separată, gratuită, la WHO:

1. **[icd.who.int/icdapi](https://icd.who.int/icdapi)** → înregistrare →
   primești `client_id` și `client_secret`.
2. În terminal:
   ```
   wrangler secret put ICD_CLIENT_ID
   wrangler secret put ICD_CLIENT_SECRET
   ```
3. `wrangler deploy`.

Fără acest pas, restul platformei funcționează normal — doar pasul de
"alege diagnosticul probabil" dintre conceptualizare și evaluare nu va găsi
rezultate la căutare.

---

## Ce faci dacă ceva nu merge

- **"command not found" la orice comandă** — închide și redeschide
  terminalul, apoi încearcă din nou (uneori terminalul are nevoie să
  "recunoască" un program nou instalat).
- **`wrangler deploy` dă eroare despre secrete lipsă** — înseamnă că ai
  uitat pasul 9(1); rulează `wrangler secret put ANTHROPIC_API_KEY` din nou.
- **Site-ul se deschide, dar conversația cu pacientul nu răspunde** —
  verifică în Cloudflare Dashboard → Workers & Pages → worker-ul tău →
  Logs, pentru mesajul exact de eroare (deseori e o cheie Anthropic
  greșit copiată sau fără credit disponibil în cont).
- **Orice altceva** — deschide un Issue pe pagina GitHub a proiectului,
  descriind exact ce comandă ai rulat și ce mesaj ai primit.
