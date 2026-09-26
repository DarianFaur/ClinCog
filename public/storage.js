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
    // Every real save of a conversation IS an activity event, by
    // definition - tracked here, in one place, so nothing that calls
    // setHistory ever has to remember to also log it separately.
    if (history.length > 0) this.touchActivity(moduleId);
  },
  clearHistory(moduleId) {
    localStorage.removeItem(this.historyKey(moduleId));
    localStorage.removeItem(this.activityKey(moduleId));
  },

  // ---- last time a student exchanged a message with this case's
  // patient - the most common real activity on the whole platform,
  // and previously the one thing missing from "Recent activity". ----
  activityKey(moduleId) {
    return `clincog_activity_${moduleId}`;
  },
  touchActivity(moduleId) {
    localStorage.setItem(this.activityKey(moduleId), String(Date.now()));
  },
  getLastActivity(moduleId) {
    const raw = localStorage.getItem(this.activityKey(moduleId));
    if (raw) return Number(raw);
    // Backfill for conversations that happened before this tracking
    // existed: we genuinely don't know exactly when those messages were
    // sent, so rather than inventing a false historical time, we record
    // "now" the first time we notice real, untracked engagement - a
    // one-time, honest catch-up rather than a fabricated date.
    if (this.getHistory(moduleId).length > 0) {
      this.touchActivity(moduleId);
      return Date.now();
    }
    return null;
  },

  // ---- evaluation progress: written by each eval page the moment a
  // student reaches its Report screen. This is the only honest signal
  // we have that the evaluation was substantially worked through. ----
  // ---- stage within a case ------------------------------------------
  // The dashboard used to know only "evaluation reached", a flag set when
  // the student opened the report, and it drew a percentage from the
  // number of chat exchanges alone (exchanges / 20), so a finished case
  // could sit at 35% forever. Progress is now the furthest stage reached.
  STAGES: [
    { id: "not-started", label: "Not started",      pct: 0 },
    { id: "interview",   label: "Interview",        pct: 20 },
    { id: "icd",         label: "ICD-11 criteria",  pct: 40 },
    { id: "dimensional", label: "Dimensional",      pct: 60 },
    { id: "cognitive",   label: "Cognitive task",   pct: 80 },
    { id: "report",      label: "Report",           pct: 95 },
    { id: "complete",    label: "Complete",         pct: 100 },
  ],
  stageKey(moduleId) {
    return `clincog_stage_${moduleId}`;
  },
  stageIndex(id) {
    const i = this.STAGES.findIndex(s => s.id === id);
    return i < 0 ? 0 : i;
  },
  setStage(moduleId, stageId) {
    // only ever moves forward, so going back to re-read a step does not
    // make the dashboard say the student has lost ground
    const current = localStorage.getItem(this.stageKey(moduleId)) || "not-started";
    if (this.stageIndex(stageId) <= this.stageIndex(current)) return;
    localStorage.setItem(this.stageKey(moduleId), stageId);
  },
  getStage(moduleId) {
    return localStorage.getItem(this.stageKey(moduleId)) || "not-started";
  },

  evalKey(moduleId) {
    return `clincog_eval_${moduleId}`;
  },
  markEvalReached(moduleId) {
    this.setStage(moduleId, "report");
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

    // Derive the stage from what actually exists, then take whichever is
    // furthest: the stored marker, or what the data implies. A case
    // completed before stages were recorded still reads as complete.
    let stageId = this.getStage(moduleId);
    if (exchanges > 0 && this.stageIndex(stageId) < this.stageIndex("interview")) stageId = "interview";
    if (evalReached && this.stageIndex(stageId) < this.stageIndex("report")) stageId = "report";
    if (complete) stageId = "complete";

    const stage = this.STAGES[this.stageIndex(stageId)];
    let pct = stage.pct;
    // within the interview, creep from 20 to 40 with the conversation
    if (stage.id === "interview") pct = Math.min(38, 20 + exchanges * 3);

    let state = "not-started";
    if (complete) state = "complete";
    else if (exchanges > 0 || evalReached || stage.id !== "not-started") state = "in-progress";

    return {
      state,               // "not-started" | "in-progress" | "complete"
      exchanges,           // real count of chat exchanges
      stage: stage.id,
      stageLabel: complete ? "Complete" : stage.label,
      pct,                 // 0-100, whole case
      conceptPct: Math.min(exchanges / 8, 1),  // interview depth only
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
      localStorage.removeItem(this.stageKey(m.id));
      localStorage.removeItem(this.completeKey(m.id));
      localStorage.removeItem(this.hypothesisKey(m.id));
      // The answers themselves (see eval-memory.js). Without this a reset
      // case came back with every item still filled in.
      localStorage.removeItem("clincog_answers_" + m.id);
      localStorage.removeItem("clincog_step_" + m.id);
      localStorage.removeItem("clincog_session_" + m.id);
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

  // ---- Instructor/student-editable normative benchmarks (mean, SD,
  // clinical cutoffs, citation) used to convert raw scores to T-scores
  // and percentiles across the evaluation pages. Per-browser, same as
  // everything else here - an instructor sets these once on their own
  // device and their own report generation uses them from then on. ----
  // ---- Export / import -------------------------------------------------
  // All state lives in localStorage under one prefix, so a backup is just
  // every key that starts with it. That keeps the export exhaustive without
  // a hand-maintained list that would silently go stale the next time a
  // feature adds a key.
  //
  // BYOK is deliberately left out. Those are live API credentials, and an
  // export is a file people mail to themselves or drop in a shared folder;
  // a progress backup is not a place to put a secret. An instructor moving
  // machines re-enters them on the Adopt page, which takes a minute.
  EXPORT_PREFIX: "clincog_",
  EXPORT_SCHEMA: 1,
  EXPORT_EXCLUDE: ["clincog_byok"],

  exportAll() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(this.EXPORT_PREFIX)) continue;
      if (this.EXPORT_EXCLUDE.includes(key)) continue;
      data[key] = localStorage.getItem(key);
    }
    return {
      app: "clincog",
      schema: this.EXPORT_SCHEMA,
      exportedAt: new Date().toISOString(),
      name: this.getName(),
      note: "ClinCog progress backup. API keys are not included.",
      data,
    };
  },

  // What the file contains, in the terms a person actually cares about, so
  // the import screen can say what is about to happen rather than asking
  // them to trust a filename.
  summariseExport(payload) {
    if (!payload || payload.app !== "clincog" || typeof payload.data !== "object") {
      return { valid: false, error: "This does not look like a ClinCog backup file." };
    }
    if (payload.schema > this.EXPORT_SCHEMA) {
      return { valid: false, error: "This backup was made by a newer version of ClinCog." };
    }
    const keys = Object.keys(payload.data);
    const cases = (this.MODULES || []).map((m) => {
      const history = payload.data[`clincog_chat_${m.id}`];
      let exchanges = 0;
      try {
        const parsed = JSON.parse(history || "[]");
        exchanges = Array.isArray(parsed) ? parsed.filter((x) => x.role === "user").length : 0;
      } catch { exchanges = 0; }
      return {
        id: m.id,
        label: m.patient ? `${m.patient}, ${m.age}` : m.id,
        exchanges,
        evalReached: !!payload.data[`clincog_eval_${m.id}`],
        complete: !!payload.data[`clincog_complete_${m.id}`],
      };
    }).filter((c) => c.exchanges || c.evalReached || c.complete);

    return {
      valid: true,
      name: payload.name || "",
      exportedAt: payload.exportedAt || null,
      keyCount: keys.length,
      cases,
    };
  },

  // Replaces rather than merges. Two devices with different chat histories
  // for the same case cannot be reconciled into one coherent transcript,
  // and a half-merged conversation is worse than either original - so the
  // choice is made explicitly by the person, on a screen that tells them
  // what they currently have and what the file holds.
  importAll(payload) {
    const summary = this.summariseExport(payload);
    if (!summary.valid) return summary;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.EXPORT_PREFIX) && !this.EXPORT_EXCLUDE.includes(key)) {
        localStorage.removeItem(key);
      }
    }
    for (const [key, value] of Object.entries(payload.data)) {
      // Never trust the file to name its own keys: a crafted export could
      // otherwise write outside the app's namespace.
      if (!key.startsWith(this.EXPORT_PREFIX)) continue;
      if (this.EXPORT_EXCLUDE.includes(key)) continue;
      if (typeof value !== "string") continue;
      localStorage.setItem(key, value);
    }
    return { valid: true, imported: Object.keys(payload.data).length };
  },

  benchmarkKey(testId) {
    return `clincog_benchmark_${testId}`;
  },
  getBenchmark(testId, defaults) {
    try {
      const raw = localStorage.getItem(this.benchmarkKey(testId));
      if (!raw) return JSON.parse(JSON.stringify(defaults));
      const saved = JSON.parse(raw);
      // shallow-merge so a benchmark saved before a new field existed
      // still falls back to that field's default rather than showing "undefined"
      return { ...JSON.parse(JSON.stringify(defaults)), ...saved };
    } catch {
      return JSON.parse(JSON.stringify(defaults));
    }
  },
  setBenchmark(testId, value) {
    localStorage.setItem(this.benchmarkKey(testId), JSON.stringify(value));
  },
  resetBenchmark(testId) {
    localStorage.removeItem(this.benchmarkKey(testId));
  },
};
