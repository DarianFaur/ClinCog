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
    { id: "depression", week: 1, domain: "Mood", patient: "Darren", age: 34,
      role: "High school English teacher",
      quote: "\u201cWhat's the point? Nothing I do matters.\u201d",
      chat: "/depression-chat.html", eval: "/depression-eval.html" },
    { id: "anxiety", week: 2, domain: "Anxiety", patient: "Alex", age: 24,
      role: "Undergraduate student",
      quote: "\u201cI just feel like everyone is watching me.\u201d",
      chat: "/anxiety-chat.html", eval: "/anxiety-eval.html" },
    { id: "addiction", week: 3, domain: "Substance use", patient: "Jordan", age: 25,
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
