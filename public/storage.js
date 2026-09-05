// ============================================================
// storage.js — everything here lives only in this browser, on
// this device. Nothing is ever sent to a server except the chat
// messages themselves (to generate the patient's replies).
// ============================================================

const ClinCog = {
  NAME_KEY: "clincog_name",

  getName() {
    return localStorage.getItem(this.NAME_KEY) || "";
  },
  setName(name) {
    localStorage.setItem(this.NAME_KEY, name.trim());
  },
  clearName() {
    localStorage.removeItem(this.NAME_KEY);
  },

  historyKey(moduleId) {
    return `clincog_chat_${moduleId}`;
  },
  getHistory(moduleId) {
    try {
      const raw = localStorage.getItem(this.historyKey(moduleId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  setHistory(moduleId, history) {
    localStorage.setItem(this.historyKey(moduleId), JSON.stringify(history));
  },
  clearHistory(moduleId) {
    localStorage.removeItem(this.historyKey(moduleId));
  },

  // ---- evaluation progress: written by each eval page the moment a
  // student reaches its Report screen. This is the only honest signal
  // we have that the evaluation was substantially worked through. ----
  evalKey(moduleId) {
    return `clincog_eval_${moduleId}`;
  },
  markEvalReached(moduleId) {
    if (this.getEvalStatus(moduleId)) return; // don't overwrite an earlier timestamp
    localStorage.setItem(this.evalKey(moduleId), JSON.stringify({ reachedAt: Date.now() }));
  },
  getEvalStatus(moduleId) {
    try {
      const raw = localStorage.getItem(this.evalKey(moduleId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  // ---- case completion: written once a student submits their
  // end-of-case reflection. ----
  completeKey(moduleId) {
    return `clincog_complete_${moduleId}`;
  },
  markCaseComplete(moduleId, reflection) {
    localStorage.setItem(
      this.completeKey(moduleId),
      JSON.stringify({ completedAt: Date.now(), reflection: (reflection || "").trim() })
    );
  },
  getCaseComplete(moduleId) {
    try {
      const raw = localStorage.getItem(this.completeKey(moduleId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  // ---- derived status, used by the dashboard. Every value here is
  // computed from the real data above - nothing is invented. ----
  MODULES: [
    { id: "schizophrenia", week: 1, domain: "Psychosis", patient: "Dennis", age: 25,
      role: "College student",
      quote: "\u201cThey planted cameras. Nobody believes me.\u201d",
      chat: "/schizophrenia-chat.html", eval: "/schizophrenia-eval.html" },
    { id: "depression", week: 2, domain: "Mood", patient: "Darren", age: 34,
      role: "High school English teacher",
      quote: "\u201cWhat's the point? Nothing I do matters.\u201d",
      chat: "/depression-chat.html", eval: "/depression-eval.html" },
    { id: "anxiety", week: 3, domain: "Anxiety", patient: "Alex", age: 24,
      role: "Undergraduate student",
      quote: "\u201cI just feel like everyone is watching me.\u201d",
      chat: "/anxiety-chat.html", eval: "/anxiety-eval.html" },
    { id: "addiction", week: 4, domain: "Substance use", patient: "Jordan", age: 25,
      role: "Software engineer",
      quote: "\u201cI just need to dial it back a little.\u201d",
      chat: "/addiction-chat.html", eval: "/addiction-eval.html" },
  ],

  getCaseStatus(moduleId) {
    const history = this.getHistory(moduleId);
    const exchanges = Math.floor(history.length / 2);
    const evalReached = !!this.getEvalStatus(moduleId);
    const complete = this.getCaseComplete(moduleId);
    let state = "not-started";
    if (complete) state = "complete";
    else if (exchanges > 0 || evalReached) state = "in-progress";
    return {
      state,               // "not-started" | "in-progress" | "complete"
      exchanges,           // real count of chat exchanges (0-10)
      conceptPct: Math.min(exchanges / 10, 1),
      evalReached,
      complete: !!complete,
    };
  },

  // The case the dashboard should feature: the first not-complete case,
  // in week order. Returns null once every case is complete.
  getCurrentCase() {
    for (const m of this.MODULES) {
      if (this.getCaseStatus(m.id).state !== "complete") return m;
    }
    return null;
  },

  // Wipes all case progress (chat history, evaluation-reached markers,
  // completion + reflections) across every case, for a student who wants
  // to start the whole term over. Deliberately leaves the student's name
  // and any display preferences (theme, zoom, sidebar state) untouched -
  // this is a progress reset, not a "forget me" action.
  resetAllProgress() {
    for (const m of this.MODULES) {
      this.clearHistory(m.id);
      localStorage.removeItem(this.evalKey(m.id));
      localStorage.removeItem(this.completeKey(m.id));
      localStorage.removeItem(this.hypothesisKey(m.id));
    }
  },

  // ---- the student's probable-diagnosis guess, chosen via the ICD-11
  // search widget after the conceptualization chat, before the structured
  // evaluation. Not graded - purely for the later self-comparison step. ----
  hypothesisKey(moduleId) {
    return `clincog_hypothesis_${moduleId}`;
  },
  setDiagnosisHypothesis(moduleId, { foundationUri, label }) {
    localStorage.setItem(
      this.hypothesisKey(moduleId),
      JSON.stringify({ foundationUri, label, chosenAt: Date.now() })
    );
  },
  getDiagnosisHypothesis(moduleId) {
    try {
      const raw = localStorage.getItem(this.hypothesisKey(moduleId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  // ---- BYOK: an instructor's own LLM credentials (any of the three
  // major providers) + WHO ICD-API credentials. Lives only in this
  // browser (see adopt.html) - sent with each request to the Worker,
  // used for that single call, never stored server-side. The LLM key
  // and the ICD credentials are independent: an instructor can BYOK
  // just the model key and still ride on the shared demo WHO
  // credentials, or vice versa.
  BYOK_KEY: "clincog_byok",
  setByok({ llmProvider, llmKey, llmModel, icdClientId, icdClientSecret }) {
    const current = this.getByok() || {};
    const next = {
      llmProvider: llmProvider !== undefined ? llmProvider : current.llmProvider,
      llmKey: llmKey !== undefined ? llmKey : current.llmKey,
      llmModel: llmModel !== undefined ? llmModel : current.llmModel,
      icdClientId: icdClientId !== undefined ? icdClientId : current.icdClientId,
      icdClientSecret: icdClientSecret !== undefined ? icdClientSecret : current.icdClientSecret,
    };
    localStorage.setItem(this.BYOK_KEY, JSON.stringify(next));
  },
  getByok() {
    try {
      const raw = localStorage.getItem(this.BYOK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  hasByokLlm() {
    const b = this.getByok();
    return !!(b && b.llmProvider && b.llmKey);
  },
  hasByokIcd() {
    const b = this.getByok();
    return !!(b && b.icdClientId && b.icdClientSecret);
  },
  clearByok() {
    localStorage.removeItem(this.BYOK_KEY);
  },

  // ---- Student model choice (uvt.clincog.net only) - deliberately just
  // two options, Haiku or Sonnet. Global across cases, not per-case,
  // since a student's preference for speed vs. depth is unlikely to
  // change from one week's patient to the next.
  STUDENT_MODEL_KEY: "clincog_student_model",
  STUDENT_MODEL_OPTIONS: ["claude-haiku-4-5-20251001", "claude-sonnet-5"],
  setStudentModel(model) {
    if (!this.STUDENT_MODEL_OPTIONS.includes(model)) return;
    localStorage.setItem(this.STUDENT_MODEL_KEY, model);
  },
  getStudentModel() {
    const saved = localStorage.getItem(this.STUDENT_MODEL_KEY);
    return this.STUDENT_MODEL_OPTIONS.includes(saved) ? saved : this.STUDENT_MODEL_OPTIONS[0];
  },

  // Honest, derived-only metrics for the dashboard's "clinical thinking"
  // section - every number here is a direct count of real local data.
  getMetrics() {
    let casesExplored = 0, casesCompleted = 0, totalExchanges = 0, evalsReached = 0;
    for (const m of this.MODULES) {
      const s = this.getCaseStatus(m.id);
      if (s.state !== "not-started") casesExplored++;
      if (s.complete) casesCompleted++;
      if (s.evalReached) evalsReached++;
      totalExchanges += s.exchanges;
    }
    return { casesExplored, casesCompleted, totalExchanges, evalsReached, totalCases: this.MODULES.length };
  },
};
