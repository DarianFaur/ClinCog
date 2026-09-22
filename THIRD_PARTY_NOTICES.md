# Third-party notices

ClinCog reproduces clinical instruments, classification text, fonts and
libraries that are **not** covered by this project's own licenses. Each item
below stays under its own terms. Copying this repository does not grant you
rights over any of them.

If you fork ClinCog and deploy it, these obligations travel with you.

---

## Not affiliated, not endorsed

ClinCog is an independent teaching project. It is **not** approved,
endorsed, certified or reviewed by the World Health Organization. WHO is not
responsible for the content of this platform, for how the CDDR text is
presented here, or for any conclusion a student draws from it.

ClinCog is **not** affiliated with, endorsed by, or connected to the MATRICS
initiative or the MATRICS Consensus Cognitive Battery (MCCB), nor to
Cambridge Cognition or CANTAB. Those names appear only to describe which
batteries the cognitive tasks in this platform are modelled on and to point
students at the primary literature. No MCCB or CANTAB test, item, stimulus,
scoring algorithm or norm is reproduced here.

Everything in ClinCog is for education. It is not a diagnostic instrument and
must not be used to assess real people.

---

## Clinical classification

### ICD-11 Clinical Descriptions and Diagnostic Requirements (CDDR)

World Health Organization. *Clinical descriptions and diagnostic requirements
for ICD-11 mental, behavioural and neurodevelopmental disorders (CDDR)*.
Geneva: World Health Organization; 2024.

Licensed under [CC BY-NC-ND 3.0 IGO](https://creativecommons.org/licenses/by-nc-nd/3.0/igo/).

Diagnostic requirements for 6A20 Schizophrenia, 6A70 Depressive episode,
6B04 Social anxiety disorder and 6C40.2 Alcohol dependence are reproduced
**verbatim**, without alteration, as the NoDerivatives term requires. Lines
marked "↳" next to the criteria are the commentary of this project's author,
are visually and textually distinguished from the WHO text, and are not part
of the CDDR.

ICD-11 classification content (code titles and hierarchy) is licensed under
CC BY-ND 3.0 IGO.

### WHO ICD-11 Embedded Classification Tool (ECT)

Used in `public/cddr-guide.html` and `public/icd-select.js`, loaded at runtime
from `icdcdn.who.int`. Provided by WHO. Access to the ICD-11 API is subject to
WHO's API terms; this project proxies token requests and does not redistribute
the API or the widget.

---

## Clinical instruments

### PHQ-9 (Patient Health Questionnaire-9) — `depression-eval.html`

Items, response anchors and the functional-impairment question are reproduced
from the official form, which carries the statement:

> Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and
> colleagues, with an educational grant from Pfizer Inc. No permission
> required to reproduce, translate, display or distribute.

Severity levels (0–4 minimal, 5–9 mild, 10–14 moderate, 15–19 moderately
severe, 20–27 severe) and the reference means by diagnostic group are from:
Kroenke K, Spitzer RL, Williams JBW. The PHQ-9: validity of a brief depression
severity measure. *J Gen Intern Med*. 2001;16(9):606–613.

### GAD-7 (Generalized Anxiety Disorder-7) — `anxiety-eval.html`

Items, response anchors and severity bands reproduced from the official form.
Scale developed and validated in: Spitzer RL, Kroenke K, Williams JBW, Löwe B.
A brief measure for assessing generalized anxiety disorder: the GAD-7. *Arch
Intern Med*. 2006;166(10):1092–1097.

### AUDIT (Alcohol Use Disorders Identification Test) — `addiction-eval.html`

Babor TF, Higgins-Biddle JC, Saunders JB, Monteiro MG. *AUDIT: The Alcohol Use
Disorders Identification Test — Guidelines for Use in Primary Care*. 2nd ed.
Geneva: World Health Organization; 2001. WHO/MSD/MSB/01.6a.

Questions and response options from Box 4 (p. 17) and Appendix B (p. 31);
conceptual domains from Box 2 (p. 11); cut-off and risk zones from pp. 19–22.

The document states that it may be freely reviewed, abstracted, reproduced and
translated, in part or in whole, **but not for sale or for use in conjunction
with commercial purposes**. This is why the content license for this project is
NonCommercial.

### HiTOP-SR (Hierarchical Taxonomy of Psychopathology — Self Report)

Used in all four cases. Items reproduced verbatim from HiTOP-SR version 1.0.
Licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/).
Distributed by the HiTOP Consortium.

Only complete subscales are used; items are not reworded, merged, or presented
with altered response anchors, as the NoDerivatives term requires.

Community norms (means and standard deviations per subscale) are from the
HiTOP-SR scoring workbook, sheet "Descriptives prolific final" (Prolific
community sample, N = 780).

### HiTOP Harmful Substance Use Module (HSUM) — `addiction-eval.html`

Alcohol-wording items reproduced verbatim from the HSUM workbook, sheet
"revised SUD module-August 2024". Same CC BY-NC-ND 4.0 terms as HiTOP-SR.

Norms for the substance subscales are **not** available in English. The
T-scores shown are computed from the German adaptation: Zimmermann J, Wendt LP,
et al. *Development and initial evaluation of the German version of the HiTOP
Self-Report*. PsyArXiv, 2024. doi:10.31234/osf.io/dc8u6, Supplementary Table S1
(German general-population sample, N = 1,049; experimental version of the
module). Those reference distributions sit against the floor of the response
scale, so the interface displays a caution wherever a T derived from them
appears.

---

## Cognitive tasks

The cognitive tasks in ClinCog are **re-implementations** written for this
project. They are modelled on published paradigms and are not the original
instruments.

### Dot-probe — `anxiety-eval.html`

Paradigm after: MacLeod C, Mathews A, Tata P. Attentional bias in emotional
disorders. *J Abnorm Psychol*. 1986;95(1):15–20. © American Psychological
Association.

The 24 socially threatening words are the social subset of Table 2 (p. 17).
The paper pairs each threat word with a neutral word matched for length and
frequency but **does not publish the neutral list**; the neutral words used
here were selected by this project's author, matched on length only, and are
not part of the validated stimulus set. The implementation is original code.

### Stop-signal task — `addiction-eval.html`

Original implementation, after the stop-signal paradigm of Logan, G. D., &
Cowan, W. B. (1984). On the ability to inhibit thought and action: A theory of
an act of control. *Psychological Review*, 91(3), 295–327.
doi:10.1037/0033-295X.91.3.295. Not derived from any commercial battery.

### "Try the tasks yourself" — `try-tasks.js`

Four optional, ungraded tasks on the Dennis and Darren cognitive pages:
trail-making (part A style), letter–number sequencing, spatial working memory
and the Tower of London. All four are original code written for this project.
They follow the general design of the published paradigms but reproduce no
MCCB or CANTAB item, stimulus, timing, scoring rule or norm. The letter–number
task is presented on screen rather than read aloud, and the Tower of London is
the move-by-move version, not CANTAB's One Touch Stockings; both differences
are stated on the page. A student's results are never stored, sent, added to
the report or compared with the patient.

The trail-making task places its circles at random positions on every run, so
it does not reproduce the layout of the standard Trail Making Test forms.

Paradigms, verified against the published record:

* Trail-making — Reitan, R. M. (1958). Validity of the Trail Making Test as an
  indicator of organic brain damage. *Perceptual and Motor Skills*, 8(3),
  271–276. doi:10.2466/pms.1958.8.3.271
* Letter–number sequencing — Gold, J. M., Carpenter, C., Randolph, C.,
  Goldberg, T. E., & Weinberger, D. R. (1997). Auditory working memory and
  Wisconsin Card Sorting Test performance in schizophrenia. *Archives of
  General Psychiatry*, 54(2), 159–165.
* Spatial working memory — Owen, A. M., Downes, J. J., Sahakian, B. J.,
  Polkey, C. E., & Robbins, T. W. (1990). Planning and spatial working memory
  following frontal lobe lesions in man. *Neuropsychologia*, 28(10), 1021–1034.
* Tower of London — Shallice, T. (1982). Specific impairments of planning.
  *Philosophical Transactions of the Royal Society of London B*, 298(1089),
  199–209. doi:10.1098/rstb.1982.0082

### MATRICS / MCCB and CANTAB

Referenced by name in `cognitive-tests.html` and in the case reports as the
batteries the fictional patient results are framed against. No MCCB or CANTAB
material is reproduced. See the non-affiliation statement above.

---

## Fonts

### Inter

Copyright (c) 2016 The Inter Project Authors. Licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/).
Self-hosted in `public/fonts/`.

### DM Mono

Copyright (c) 2019 The DM Mono Project Authors. Licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/).
Self-hosted in `public/fonts/`.

---

## Libraries

### Plotly.js

Copyright (c) Plotly, Inc. Licensed under the MIT License. Loaded at runtime
from `cdn.plot.ly` in `addiction-eval.html`; not bundled in this repository.

---

## Instruments deliberately not included

The following were removed from earlier versions of this project because they
are proprietary and this repository is public:

* **BDI-II** (Beck Depression Inventory-II) — Pearson. Replaced by the PHQ-9.
* **STAI-Y1 / Y2** (State-Trait Anxiety Inventory) — Mind Garden. Replaced by
  the GAD-7 and the HiTOP-SR Social Anxiety subscale.
* **SPIN** (Social Phobia Inventory) — © Jonathan Davidson; all rights
  reserved. **Not in this repository.** The original author's own deployment
  uses it under a written licence that restricts it to a password-protected
  instance; the items are supplied to that instance as a server secret and
  are never committed. The code that requests them contains no SPIN text and
  does nothing on an instance without the licence. A written licence does not
  transfer to forks: to use the SPIN you need your own permission from the
  rights holder.
* **CRAFFT** — Boston Children's Hospital. Replaced by the AUDIT.

If you fork this project, do not add them back without written permission from
the rights holders.
