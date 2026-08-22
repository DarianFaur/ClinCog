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
};
