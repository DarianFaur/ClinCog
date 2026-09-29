# ClinCog Alpha: "Paper & Ink"

> Editorial clinical science: a serif voice on white paper, flat mist cards, and colour that comes only from the four case pairs.

This document is the codebook for the alpha release. It synthesises two references, **Steep** (serif analytics on warm paper) and **Ventriloc** (an editorial data observatory, "a single orange ember punctuating monochrome precision"), and adapts them to what ClinCog is: a teaching tool where students read long clinical text, rate items and compare results.

All values are defined in `public/tokens.css`. Nothing outside that file should hardcode a colour, a shadow or a font stack.

---

## 1. Principles

1. **Hierarchy comes from the serif, not from bold.** Every h1/h2 uses Newsreader at weight 400. Size and tracking carry rank, and nothing uses 600 or 700 at display sizes.
2. **Tone replaces lines.** Cards are flat mist on paper, with no border and no shadow. Hairlines appear only where two paper surfaces meet (inputs, tables).
3. **About 95% achromatic.** Colour is rationed to three uses:
   - the sienna/peach accent (Dennis's pair);
   - one case paper per page;
   - semantic states.
4. **Only floating things cast shadows.** This covers the chat window, popovers, modals, the toast, the accessibility button and the hero artifact.
5. **Two structural radii:** 24px for cards and a pill for every control.
6. **Ink is the only dark surface.** It is used for primary buttons, selected answers, the current step and the student's chat bubble.

## 2. Colour

**Rule: only swatches that appear in the two references.** No intermediate tints are invented. Light mode uses the reference hex values verbatim. Dark mode has no reference, so it is derived from ink and graphite.

### Neutrals

| Token | Light | Source | Role |
|---|---|---|---|
| `--paper` | `#ffffff` | Steep paper white | Canvas, nested items inside cards |
| `--mist` | `#f2f2f3` | Steep mist gray | Card surface (flat) |
| `--mist-strong` / `--hairline` | `#e8e8e8` | Ventriloc mist | Hover, tracks, hairlines |
| `--fog` | `#fafafb` | Steep fog white | Sidebar |
| `--ivory` | `#ebe6dd` | Ventriloc ivory | Warm wash |
| `--text-primary` / `--ink` | `#17191c` | Steep ink black | Text, primary buttons (17.6:1) |
| `--ink-hover` | `#202020` | Ventriloc graphite | |
| `--text-secondary` | `#4d4d4d` | Ventriloc steel | Secondary copy (8.5:1) |
| `--text-tertiary` | `#777b86` | Steep slate gray | Labels, captions (**4.2:1 on paper, 3.8:1 on mist: below AA for small text**) |
| `--text-placeholder` | `#a3a6af` | Steep smoke gray | Placeholders |

### Accent (r3: ember retired)

Ventriloc's ember `#ff682c` clashed with the rest of the palette and has been removed from the interface. The system accent is now Steep's sienna-on-peach pair, so every colour in the app belongs to one of the case pairs.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#5d2a1a` sienna | `#fbe1d1` peach | Lines, fills, focus, progress |
| `--accent-soft` | `#fbe1d1` peach | peach at 12% | One editorial card per page |
| `--accent-ink` / `--accent-deep` | `#5d2a1a` | `#fbe1d1` | Accent text, text on peach |

**One exception:** the stop signal in Jordan's stop-signal task stays ember. It is the experimental stimulus, and no palette colour separates clearly enough from the white "go" stimulus on the dark task canvas. The legend shows an ember swatch next to the word, so the text itself stays legible.

### Cases: four tokens per case

| Case | `-soft` (surface) | `-ink` (text on surface) | `-line` (bars, lines, dots) | `-tint` (light surface under line-coloured text) |
|---|---|---|---|---|
| Dennis | `#fbe1d1` peach | `#5d2a1a` sienna | `#5d2a1a` sienna | `#fbe1d1` |
| Darren | `#202020` graphite | `#ffffff` | `#202020` graphite | `#e8e8e8` |
| Alex | `#e8e8e8` mist | `#4d4d4d` steel | `#4d4d4d` steel | `#e8e8e8` |
| Jordan | `#ebe6dd` ivory | `#816729` brass | `#816729` brass | `#ebe6dd` |

`-line` exists because of Darren: his text colour is white (it sits on graphite), so using it for bars would make them invisible on white. `-tint` exists for the same reason: semantic badges need a light background under dark text. In dark mode Darren inverts (light surface, dark text) and the lines turn light.

Each evaluation page declares `--case`, `--case-soft`, `--case-ink`, `--case-line` and `--case-tint` next to where `alpha-eval.css` is linked.

### Semantic states

- Outside the cases: success is ink on mist, warning is brass on ivory, danger is sienna on peach, info is steel on `#efefef`.
- **On a case's pages:** `--danger` and `--warning` take `--case-line` on `--case-tint`, so no case shows another case's colour. For example, the "impaired" bars in Darren's report are graphite, not sienna.

Content warnings for sensitive material (suicide, self-harm, substance use) are **neutral**: mist background, no coloured ribbon or tint.

## 3. Typography

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Display (splash, greeting, hero name) | Newsreader | 40–90px fluid | 400 | −0.025em |
| Page title (h1) | Newsreader | 32–44px | 400 | −0.02em |
| Section (h2) | Newsreader | 24–32px | 400 | −0.015em |
| Card title | Newsreader | 20–24px | 400 | −0.012em |
| Metric | Newsreader | 36–48px | 400 | −0.02em, tabular |
| Body | Inter | 15–17px | 400 | 0 |
| UI / label | Inter | 13–15px | 450–500 | 0 |
| Index, code, figure | DM Mono | 11–13px | 400 | 0 |

- **One italic phrase per headline** is the signature device: *Hello, **Ana**.* / *Three lenses, **one** patient.*
- Eyebrows are sentence case, tertiary grey, and never uppercase-tracked. The mono eyebrows on eval pages are kept as the "precision" voice.
- All three families are self-hosted variable fonts with latin and latin-ext subsets (needed for Romanian diacritics). Newsreader's optical sizing is automatic.

## 4. Shape, space and elevation

- **Radii:** cards 24px, small cards and inputs 16px, images 12px, controls pill.
- **Spacing:** 4px base. Card padding is 24–36px fluid, section gap is 48–80px fluid (`--section-gap`), and element gap is 8–20px.
- **Shadows:**
  - `--shadow-lg`: floating artifacts (hero progress card, chat window, a11y FAB, popovers);
  - `--shadow-md`: modals and the splash form;
  - `--shadow-xs`: a 1px ring for the active sidebar pill only.
  - Content cards: **none**.

## 5. Components

| Component | Spec |
|---|---|
| **Primary button** | Ink pill, 44px, Inter 500. Pairs with a ghost button. |
| **Secondary button** | Transparent pill with a 1px ink border. On hover it fills with ink. |
| **Arrow link** (`.btn-link`) | Text plus `→`, and the arrow slides 3px on hover. The lowest-emphasis action. |
| **Card** | Mist, 24px, flat. Inside it, `--bg-surface-alt` becomes paper, so nested blocks read as white artifacts on mist. |
| **Floating card** (`.card-float`) | Paper, 20px, `--shadow-lg`. |
| **Accent card** (`.card-accent`) | Peach with sienna text, once per page. |
| **Sidebar** | Fog, following the theme (no longer a fixed dark slab). Serif wordmark next to `favicon.svg`, the official app icon (the retired `brain-mark.svg` / `brain-logo-full.png` are not used). The active item is a paper pill. |
| **Topbar** | Translucent paper with blur, hairline bottom, serif title. On evaluation pages a 2px reading-progress line sits on its bottom edge in `--case-line`. |
| **Answer controls** | One geometry on every page: 44px paper circles for numbers, pills for words. The visible control is the outermost element, and its 1.5px border is the outer edge. Selected = mist-strong fill with an ink border. Wrappers are transparent. |
| **Eval overview cards** | The three lenses as postcards: paper with `--shadow-lg`, each tilted differently (−1.6°, 1.1°, −0.7°). The middle card sits on the case surface and number chips wear the case colour. Cards straighten on hover and lie flat on phones and with reduced motion. |
| **Chat** | The window floats (paper and shadow). The patient speaks on mist, the student on ink. |
| **Badges** | Outline pill. "In progress" gets a sienna dot, "Complete" is an ink fill. |
| **Links** | Plain hyperlinks: ink text at weight 500, **no underline at rest**. A 1px underline in the text's own colour appears on hover or focus. No accent underline. |
| **Sidebar icons** | Glyphs only, no circles, all in the accent (sienna in light, peach in dark). The earlier three-colour version (sienna / brass / steel, plus the case colour on Cases) read as mismatched. The active item's glyph is ink. |
| **Active postcard (evaluation items)** | Driven by `eval-focus.js`, and works on every rated instrument (ICD/CDDR, HiTOP, PHQ-9, GAD-7, AUDIT). The first unanswered item is lifted as a paper postcard (`--shadow-lg`, −0.35°, question in serif 20–26px). Numeric options become wide tiles labelled with the scale legend. Answered items fold into one line with the answer as a chip (`--case-soft` / `--case-ink`, mono), and a click reopens them. The Diagnostic Conclusion never folds. Scoring is untouched: the pages still score from their own handlers. On phones the chip sits under the question and nothing is tilted. |
| **Report** | The report is the end of the case, not a step. It has no step rail, and the rail has no Report step. At the bottom, "← Previous page" returns to the last evaluation step and "Dashboard →" leaves; the print button sits in the cover. On screen: a cover on `--case-soft`, then each lens as a paper postcard. Inside a section, numbers sit in serif on `--case-tint` tiles, the categorical verdict is on `--case-soft` with a round mark, pills are on the tint, tables have a mist header strip, figures sit on mist panels, and written answers are quiet serif quotes. |
| **Printed report** | The same look on A4: cover, serif titles with the numbered chip, a case-coloured rule under each heading, tiles, verdict, pills and colour bars, with colours forced to print. Sections stay unboxed so they can run over a page break without being cut. Printing from the dark theme switches the page to light and rebuilds the charts for the length of the print (`beforeprint` / `afterprint` in `eval-focus.js`), with a CSS fallback. |
| **Charts** | Line in `--case-line` (or `--accent` outside cases), the area under it a 16% tint of the same line, a mono axis, and no heavy gridlines. Severity-band labels pick ink or paper, whichever contrasts more with their band. A distribution panel that is alone in its section is centred at a reading width (760px on screen, 150mm in print) and drawn taller; in print, panels are redrawn at a fixed size so the page does not depend on the window. |
| **Progress tracks** | The remainder is hatched in the surrounding text colour at low strength (`currentColor`), not a fixed grey, so it stays visible on paper, mist and every case surface. |
| **Model choice (course instance)** | A two-way segmented pill on a header strip across the top of the chat card; the chosen model is an ink pill. On phones the "Model" label is kept for screen readers only. |
| **Admin console** | Same shell and tokens as the app. Lanes (seminar, demo, admin, own keys) each wear one case-pair colour for identity only - one series per chart, text in text tokens. Live monitoring: lane cards (hero cost in serif, four stat tiles, an area chart with a crosshair tooltip and arrow-key navigation), a participant table with share bars, a detail postcard, a live feed. Seminar settings: mist sections with paper inputs, ink primary buttons, ghost secondary ones, a switch for open/closed. |

## 6. Do / don't

**Do**
- Use `.card` for every content block and let the surface ladder handle nesting.
- Put the case paper on at most one surface per page.
- Pair every ink button with a ghost or arrow link on the same row.
- Use `--font-serif` (not `--font-display`) in shared CSS. Some pages re-map `--font-display` locally.

**Don't**
- Don't bold a serif heading.
- Don't use ember anywhere in the interface (see the stop-signal exception above).
- Don't add shadows to content cards.
- Don't introduce a new hue: the four case pairs and the neutrals are the whole palette.
- Don't uppercase-track labels in new UI.

## 7. Implementation notes

- `tokens.css` is regenerated for alpha, and the dark blocks mirror light role for role.
- `components.css` covers the headings layer, flat cards with a local surface ladder, pills, chat and badges.
- `shell.css` / `shell.js` provide the light sidebar, serif chrome and brand mask.
- `alpha-eval.css` is loaded last on the four eval pages. It re-declares their local aliases inside `.eval-layout`, which flips every panel to flat mist without touching roughly 600 KB of page CSS. It also fixes the progress bar that was hidden (and blurred) under the topbar.
- `a11y.js` and `charts.js` now read tokens instead of hardcoded hex values.
- Dead assets are still present and can be deleted in the alpha cleanup: `styles.css`, `sidebar.js`, `nav.js` (not loaded by any page) and the old static Inter files (already removed).
