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
