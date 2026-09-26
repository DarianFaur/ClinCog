/* ============================================================
   eval-memory.js — keeps a student's answers across visits.

   The evaluation pages stored the stage they had reached and whether
   the case was finished, but never the answers themselves: those lived
   only in the DOM. Moving between steps worked because it is the same
   document, but leaving for the dashboard and coming back reloaded the
   page with every radio cleared, so a finished evaluation looked
   untouched.

   This records what was answered and replays it on load by clicking the
   same control the student clicked. Replaying the click rather than
   setting .checked matters: each case computes its own counts, totals,
   severity bands and report from its own change handlers, and those only
   run on a real event. Every page is therefore rehydrated by its own
   code, and nothing here needs to know how any individual case scores.

   Set window.CLINCOG_EVAL = "<module id>" before loading this file.
   ============================================================ */
(function () {
  "use strict";

  var MODULE = window.CLINCOG_EVAL;
  if (!MODULE) return;
  var KEY = "clincog_answers_" + MODULE;
  /* Selection that is carried by a class rather than by a checked radio -
     the addiction case sets these from its own setAnswer(). */
  var CLASS_SEL = ".radio-option.selected, .radio-option.selected-yes, .likert-btn.selected";
  var restoring = false;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : { radios: {}, clicked: [], text: {} };
    } catch (e) {
      return { radios: {}, clicked: [], text: {} };
    }
  }

  function save() {
    if (restoring) return;
    var state = { radios: {}, clicked: [], text: {} };
    document.querySelectorAll("input[type=radio]:checked").forEach(function (r) {
      if (r.name) state.radios[r.name] = r.value;
    });
    document.querySelectorAll(CLASS_SEL).forEach(function (el) {
      if (el.id) state.clicked.push(el.id);
    });
    document.querySelectorAll("textarea[id], input[type=text][id]").forEach(function (el) {
      if (el.value) state.text[el.id] = el.value;
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* Quota or a private window: losing the answers is bad but breaking
         the page the student is working in is worse. */
    }
  }

  function restore() {
    var state = read();
    var radios = state.radios || {};
    var clicked = state.clicked || [];
    var text = state.text || {};
    if (!Object.keys(radios).length && !clicked.length && !Object.keys(text).length) return;

    restoring = true;

    Object.keys(text).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = text[id];
    });

    Object.keys(radios).forEach(function (name) {
      var input = document.querySelector(
        'input[type=radio][name="' + CSS.escape(name) + '"][value="' + CSS.escape(radios[name]) + '"]'
      );
      if (!input || input.checked) return;
      /* Click the label where there is one: several cases hide the input
         itself (display:none) and drive everything from the label. */
      var label = input.closest("label") ||
        (input.id ? document.querySelector('label[for="' + CSS.escape(input.id) + '"]') : null);
      (label || input).click();
      if (!input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    clicked.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.click();
    });

    restoring = false;
    save();
  }

  /* Anything that changes an answer goes through one of these. The click
     listener is capture-phase so it still fires for controls whose own
     handler stops propagation. */
  document.addEventListener("change", save);
  document.addEventListener("input", save);
  document.addEventListener("click", function () { setTimeout(save, 0); }, true);

  /* The question lists on some pages are built by script after DOMContentLoaded,
     so restoring once on load can run before the controls exist. Retry until the
     DOM stops growing, then stop: this is a page that is finished rendering. */
  function restoreWhenReady() {
    var tries = 0;
    var lastCount = -1;
    (function attempt() {
      var count = document.querySelectorAll("input[type=radio], " + CLASS_SEL + ", .radio-option, .likert-btn").length;
      if (count > 0 && count === lastCount) { restore(); return; }
      lastCount = count;
      if (++tries > 40) { if (count > 0) restore(); return; }
      setTimeout(attempt, 50);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", restoreWhenReady);
  } else {
    restoreWhenReady();
  }

  /* Restarting all progress must clear the answers too, or a reset case
     comes back fully filled in. */
  /* How far through the case the student actually got. The answers were
     being restored but this was not, so the step rail came back with every
     step locked and the only way to reach the report again was to walk
     through all six pages. Each case keeps its own furthest-step counter
     under a different name (maxStepReached, S.maxPage, maxViewIndexReached),
     so the number is stored here and each page seeds its own variable from
     it. */
  var STEP_KEY = "clincog_step_" + MODULE;

  window.ClinCogEvalMemory = {
    clear: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem(STEP_KEY); } catch (e) {}
    },
    /* step() reads; step(n) records a new high-water mark and returns it. */
    step: function (n) {
      var cur = 0;
      try { cur = parseInt(localStorage.getItem(STEP_KEY), 10) || 0; } catch (e) { cur = 0; }
      if (typeof n === "number" && n > cur) {
        cur = n;
        try { localStorage.setItem(STEP_KEY, String(cur)); } catch (e) {}
      }
      return cur;
    },
    key: KEY,
  };
})();
