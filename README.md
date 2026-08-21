# Cum rulezi și publici acest prototip

Ai 4 fișiere:
- `index.html` — pagina pe care o vede studentul (front-end)
- `worker.js` — proxy-ul care vorbește cu Anthropic (back-end, rulează pe Cloudflare)
- `wrangler.toml` — fișier de configurare, citit automat de Cloudflare
- acest README

Pune toate 3 fișierele de cod (`index.html`, `worker.js`, `wrangler.toml`)
într-un singur folder pe calculatorul tău, ex. `psihopatologie-platforma/`.

---

## Pasul 1 — Testează proxy-ul local (fără să publici nimic încă)

Deschide un terminal (în VS Code: meniul `Terminal > New Terminal`) și
navighează în folderul cu fișierele:

```
cd calea/catre/psihopatologie-platforma
```

Instalează Wrangler (unealta Cloudflare, o singură dată):

```
npm install -g wrangler
```

Autentifică-te (se deschide o pagină în browser, e nevoie de cont Cloudflare
gratuit — dacă nu ai, ți-l creează tot acolo):

```
wrangler login
```

Setează cheia API ca "secret" local, pentru testare (îți va cere s-o lipești):

```
wrangler secret put ANTHROPIC_API_KEY --local
```

Pornește Worker-ul local:

```
wrangler dev
```

Dacă vezi în terminal ceva de genul `Ready on http://127.0.0.1:8787`,
funcționează — proxy-ul rulează acum pe calculatorul tău, la acea adresă.
(Adresa asta e deja scrisă în `index.html`, la linia `URL_PROXY`.)

---

## Pasul 2 — Deschide pagina și testeaz-o

Cu `wrangler dev` încă pornit (lasă acel terminal deschis), deschide un
terminal nou și, în același folder, pornește un mic server local pentru
`index.html`. Cea mai simplă variantă dacă ai extensia "Live Server" în
VS Code: click dreapta pe `index.html` → **"Open with Live Server"**.

Ar trebui să se deschidă automat o pagină în browser cu vinieta lui Andrei
și o casetă de chat. Scrie o întrebare (ex. "De cât timp are aceste
simptome?") și apasă "Întreabă". Dacă totul e conectat corect, primești
un răspuns bazat strict pe vinietă în câteva secunde.

**Dacă nu funcționează:** deschide unealta de dezvoltator a browser-ului
(F12 sau click-dreapta → "Inspect" → tab-ul "Console") și vezi ce eroare
apare — de obicei e o problemă simplă de adresă greșită sau cheie API
nesetată corect.

---

## Pasul 3 — Publică Worker-ul (îl faci disponibil pe internet, nu doar local)

```
wrangler deploy
```

Îți dă o adresă publică de tipul:
`https://proxy-conceptualizare.<numele-tau>.workers.dev`

Setează cheia API și pentru versiunea publicată (nu doar local):

```

```

Apoi **înlocuiește** în `index.html` linia:

```js
const URL_PROXY = "http://127.0.0.1:8787";
```

cu adresa publică primită mai sus.

---

## Pasul 4 — Publică pagina (index.html) pe Cloudflare Pages

1. Urcă folderul pe GitHub (dacă nu ai făcut-o deja — vezi pasul din
   conversația anterioară: creezi un repo, faci `git add`, `git commit`,
   `git push`).
2. Din dashboard-ul Cloudflare: **Workers & Pages → Create → Pages →
   Connect to Git** → alegi repo-ul.
3. Lași setările implicite (nu ai nevoie de "build command" — sunt fișiere
   statice) și apeși "Deploy".

Primești o adresă de tipul `https://numele-proiectului.pages.dev` —
aceasta e adresa pe care o trimiți studenților.

---

## Ce faci diferit pentru fiecare săptămână nouă

Copiezi `index.html` și `worker.js`, le redenumești (ex. `saptamana2.html`,
`worker-saptamana2.js`), și schimbi doar:
- textul `VINIETA` din `worker.js`
- textul afișat în `<div id="vinieta">` din HTML

Restul codului (logica de chat, stilul) rămâne identic — de-asta arhitectura
e modulară, nu rescrii totul de 12 ori.
