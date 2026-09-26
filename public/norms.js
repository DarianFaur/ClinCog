/* ClinCog — published norm defaults, in one place.
   ------------------------------------------------------------------
   The evaluation pages read these through ClinCog.getBenchmark(), so an
   instructor's edits on the benchmarks page override them; the benchmarks
   page builds its editing form from the same object, so the defaults and
   the form can never drift apart. Edit a value here only to change the
   published default, not to adapt it for a course.

   Every value is a per-item mean and standard deviation on the 1-4 HiTOP
   response scale, except where noted. Sources are given per group and are
   shown to instructors next to the fields. */
window.CLINCOG_NORMS = {
  hitopScz: {
    title: 'HiTOP-SR — Detachment and Thought Disorder',
    usedIn: [{ name: 'Dennis', color: 'var(--domain-psychosis)' }],
    citation: 'HiTOP-SR scoring workbook, "Descriptives prolific final" (Prolific community sample, N = 780).',
    subscales: {
      'Restricted Affectivity': { mean: 1.7991, sd: 0.7164 },
      'Social Aloofness':       { mean: 2.4932, sd: 0.8989 },
      'Reality Distortion':     { mean: 1.1915, sd: 0.3720 },
      'Mistrust':               { mean: 2.1358, sd: 0.8400 },
    },
  },
  hitopDep: {
    title: 'HiTOP-SR — Distress subscales',
    usedIn: [{ name: 'Darren', color: 'var(--domain-mood)' }],
    citation: 'HiTOP-SR scoring workbook, "Descriptives prolific final" (Prolific community sample, N = 772–780).',
    subscales: {
      'Cognitive Problems':  { mean: 1.9743, sd: 0.8190 },
      'Distress–Dysphoria':  { mean: 2.1919, sd: 0.8719 },
      'Emotionality':        { mean: 1.6983, sd: 0.6626 },
      'Insomnia':            { mean: 2.3249, sd: 0.9305 },
      'NSSI':                { mean: 1.1794, sd: 0.3940 },
      'Suicidality':         { mean: 1.3631, sd: 0.5317 },
    },
  },
  hitopFear: {
    title: 'HiTOP-SR — Fear subscales',
    usedIn: [{ name: 'Alex', color: 'var(--domain-anxiety)' }],
    citation: 'HiTOP-SR scoring workbook, "Descriptives prolific final" (Prolific community sample, N = 780).',
    subscales: {
      'Social Anxiety':  { mean: 2.0573, sd: 0.8943 },
      'Agoraphobia':     { mean: 1.6224, sd: 0.7746 },
      'Hypervigilance':  { mean: 1.9213, sd: 0.7287 },
      'Panic':           { mean: 1.5278, sd: 0.6331 },
    },
  },
  hitopExt: {
    title: 'HiTOP-SR — Disinhibited Externalizing subscales',
    usedIn: [{ name: 'Jordan', color: 'var(--domain-substance)' }],
    citation: 'HiTOP-SR scoring workbook, "Descriptives prolific final" (Prolific community sample, N = 780).',
    subscales: {
      'Non-planfulness': { mean: 1.6097, sd: 0.6456 },
      'Risk Taking':     { mean: 1.3851, sd: 0.5864 },
      'Restlessness':    { mean: 1.4646, sd: 0.6091 },
    },
  },
  hitopSud: {
    title: 'HiTOP Harmful Substance Use Module — alcohol subscales',
    usedIn: [{ name: 'Jordan', color: 'var(--domain-substance)' }],
    citation: 'Zimmermann J, Wendt LP, et al. Development and initial evaluation of the German version of the ' +
      'HiTOP Self-Report. PsyArXiv, 2024. doi:10.31234/osf.io/dc8u6, Supplementary Table S1 (German general-population ' +
      'sample, N = 1,049; experimental version of the module). These reference distributions sit against the floor of ' +
      'the response scale, so a single endorsed item produces a very high T. The report says so wherever one appears.',
    subscales: {
      'Impaired Control':  { mean: 1.131, sd: 0.353 },
      'Role Interference': { mean: 1.047, sd: 0.243 },
      'Tolerance':         { mean: 1.092, sd: 0.326 },
    },
  },
  /* ------------------------------------------------------------------
     PHQ-9 and GAD-7 population norms.

     Both come from the same representative German survey (N = 2,519,
     Leipzig University, Dec 2020 - Mar 2021) and both papers publish
     CUMULATIVE PERCENTILES rather than a total-score mean and SD. The
     tables below are transcribed verbatim from those papers and are what
     the reports standardise against: a raw total is looked up in the
     table to get the percentile of the reference population scoring at or
     below it, and the normalized T is 50 + 10 * the normal quantile of
     that percentile.

     That is deliberate. Both distributions are heavily floor-weighted -
     41% of the PHQ-9 sample and 48% of the GAD-7 sample score zero - so a
     linear T from a mean and an SD would assume a normal shape the data
     plainly do not have. The percentile is exact; the T derived from it
     is the same number expressed on the familiar 50/10 scale.

     The mean and SD fields are editable and start empty for the PHQ-9,
     because its paper does not report a total-score mean and SD in the
     main text (item-level values are in its Supplementary Tables C5/C6).
     Filling them in switches that instrument to a linear T. The GAD-7's
     fields are pre-filled with the values its paper does state.
     ------------------------------------------------------------------ */
  phq9: {
    title: 'PHQ-9 — German population norms',
    usedIn: [{ name: 'Darren', color: 'var(--domain-mood)' }],
    citation: 'Kliem, S., Sachser, C., Lohmann, A., Baier, D., Brähler, E., Gündel, H., & Fegert, J. M. (2024). ' +
      'Psychometric evaluation and community norms of the PHQ-9, based on a representative German sample. ' +
      'Frontiers in Psychiatry, 15, 1483782. https://doi.org/10.3389/fpsyt.2024.1483782 — cumulative percentiles ' +
      'from Table 2 (total sample) and Supplementary Tables C8 and C9 (male and female subsamples); severity ' +
      'frequencies from Table 3; total-score mean and SD from Supplementary Table C5 (total 2.69/3.87, ' +
      'male 2.38/3.68, female 2.95/3.98), N = 2,519.',
    params: [
      { key: 'mean',   label: 'Reference mean' },
      { key: 'sd',     label: 'Reference SD' },
      { key: 'cutoff', label: 'Screening cut-off' },
    ],
    mean: 2.69,
    sd: 3.87,
    cutoff: 10,
    /* Table 2 and Supplementary Tables C8/C9, verbatim, total column of
       each. Keys are the raw total. The published tables omit some rows
       entirely (no row for 24 in the total sample, none for 17/22/24/26 in
       the male table, none for 18/24/25 in the female one); a total that
       falls on a missing row takes the nearest published lower score and
       the report says which. ">99.9" is stored as 99.9. */
    percentiles: {
      0: 41.0,  1: 52.3,  2: 64.3,  3: 72.9,  4: 79.2,  5: 83.8,  6: 87.5,
      7: 89.4,  8: 92.1,  9: 93.9, 10: 95.0, 11: 95.9, 12: 96.4, 13: 97.2,
      14: 97.8, 15: 98.3, 16: 98.8, 17: 99.0, 18: 99.0, 19: 99.3, 20: 99.5,
      21: 99.6, 22: 99.7, 23: 99.8, 25: 99.8, 26: 99.9, 27: 99.9,
    },
    percentilesBySex: {
      male: {
        0: 44.9,  1: 56.7,  2: 68.1,  3: 76.2,  4: 82.2,  5: 86.5,  6: 89.8,
        7: 91.5,  8: 93.7,  9: 94.8, 10: 95.6, 11: 96.4, 12: 96.8, 13: 97.5,
        14: 98.0, 15: 98.5, 16: 99.0, 18: 99.1, 19: 99.3, 20: 99.4, 21: 99.6,
        23: 99.7, 25: 99.8, 27: 99.9,
      },
      female: {
        0: 37.4,  1: 48.5,  2: 61.1,  3: 70.1,  4: 76.9,  5: 81.5,  6: 85.6,
        7: 88.0,  8: 90.8,  9: 93.1, 10: 94.4, 11: 95.3, 12: 96.0, 13: 97.0,
        14: 97.6, 15: 98.0, 16: 98.6, 17: 98.9, 19: 99.2, 20: 99.5, 21: 99.6,
        22: 99.8, 23: 99.8, 26: 99.9, 27: 99.9,
      },
    },
    momentsBySex: {
      male:   { mean: 2.38, sd: 3.68 },
      female: { mean: 2.95, sd: 3.98 },
    },
    severity: [
      { label: 'Minimal (0–4)',            pct: 79.24 },
      { label: 'Mild (5–9)',               pct: 14.69 },
      { label: 'Moderate (10–14)',         pct: 3.85 },
      { label: 'Moderately severe (15–19)', pct: 1.51 },
      { label: 'Severe (20–27)',           pct: 0.71 },
    ],
    sample: 'Representative German adult sample, N = 2,519',
  },
  gad7: {
    title: 'GAD-7 — German population norms',
    usedIn: [{ name: 'Alex', color: 'var(--domain-anxiety)' }],
    citation: 'Kliem, S., Sachser, C., Lohmann, A., Baier, D., Brähler, E., Fegert, J. M., & Gündel, H. (2025). ' +
      'Psychometric evaluation and community norms of the GAD-7, based on a representative German sample. ' +
      'Frontiers in Psychology, 16, 1526181. https://doi.org/10.3389/fpsyg.2025.1526181 — cumulative percentiles ' +
      'from Table 3 (total sample) and Supplementary Tables A9 and A11 (male and female subsamples); severity ' +
      'frequencies from Table 2; total-score mean and SD from Supplementary Table A3 (total 2.18/3.28, ' +
      'male 1.97/3.21, female 2.35/3.32), confirmed in Supplementary Table A5; N = 2,519. Supplementary Table C7 ' +
      'of the companion PHQ-9 paper gives the GAD-7 as 2.17/3.26 for the same survey — a last-digit difference, ' +
      'and the value from the GAD-7 paper and its own supplement is the one used here.',
    params: [
      { key: 'mean',   label: 'Reference mean' },
      { key: 'sd',     label: 'Reference SD' },
      { key: 'cutoff', label: 'Screening cut-off' },
    ],
    mean: 2.18,
    sd: 3.28,
    cutoff: 10,
    /* Table 3 and Supplementary Tables A9/A11, verbatim, total column of
       each. The published tables omit a row here and there (none for 15 in
       the male table, none for 20 in the female one); a total that falls on
       a missing row takes the nearest published lower score and the report
       says which. ">99.9" is stored as 99.9. The smoothed (SCAM) variants
       in Tables A10/A12 are deliberately not used: the observed tables are
       what the paper presents as the norms. */
    percentiles: {
      0: 47.8,  1: 60.5,  2: 70.1,  3: 76.7,  4: 81.3,  5: 85.9,  6: 89.4,
      7: 93.2,  8: 94.7,  9: 95.7, 10: 96.7, 11: 97.5, 12: 98.0, 13: 98.5,
      14: 99.0, 15: 99.2, 16: 99.4, 17: 99.6, 18: 99.7, 19: 99.8, 20: 99.8,
      21: 99.9,
    },
    percentilesBySex: {
      male: {
        0: 51.6,  1: 63.5,  2: 73.5,  3: 79.0,  4: 83.4,  5: 87.4,  6: 90.7,
        7: 94.0,  8: 95.4,  9: 96.2, 10: 97.1, 11: 98.1, 12: 98.2, 13: 98.7,
        14: 99.0, 16: 99.2, 17: 99.4, 18: 99.6, 19: 99.7, 20: 99.7, 21: 99.9,
      },
      female: {
        0: 44.3,  1: 57.9,  2: 67.0,  3: 74.6,  4: 79.5,  5: 84.6,  6: 88.4,
        7: 92.5,  8: 94.1,  9: 95.2, 10: 96.4, 11: 97.1, 12: 97.8, 13: 98.4,
        14: 99.0, 15: 99.5, 16: 99.6, 17: 99.7, 18: 99.8, 19: 99.9, 21: 99.9,
      },
    },
    momentsBySex: {
      male:   { mean: 1.97, sd: 3.21 },
      female: { mean: 2.35, sd: 3.32 },
    },
    severity: [
      { label: 'Minimal (0–4)',  pct: 81.30 },
      { label: 'Mild (5–9)',     pct: 14.37 },
      { label: 'Moderate (10–14)', pct: 3.29 },
      { label: 'Severe (15–21)', pct: 1.03 },
    ],
    sample: 'Representative German adult sample, N = 2,519',
  },
  dotProbe: {
    title: 'Dot-probe — group bias reference values',
    usedIn: [{ name: 'Alex', color: 'var(--domain-anxiety)' }],
    citation: 'Computed from the group mean latencies in Table 3 (p. 17) of MacLeod, C., Mathews, A., & Tata, P. ' +
      '(1986). Attentional bias in emotional disorders. Journal of Abnormal Psychology, 95(1), 15–20, using the bias ' +
      'equation on p. 18 with the sign reversed so that attention toward threat is positive. The paper reports no ' +
      'standard deviations, so no z-score or percentile can be derived from these.',
    params: [
      { key: 'anxiousBias', label: 'Anxious patients — bias index (ms)' },
      { key: 'controlBias', label: 'Controls — bias index (ms)' },
    ],
    anxiousBias: 91,
    controlBias: -49,
  },
};
