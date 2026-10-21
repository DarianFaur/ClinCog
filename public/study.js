/* ============================================================
   study.js - the participants' side of the feasibility study.

   Loaded by shell.js on the seminar instance (uvt) and on the public
   site, never on the admin console. It shows a short notice once, with a
   single Accept button; once it is accepted it:
     - counts active time (page visible and touched in the last minute),
       per kind of page and case, sent every 30 seconds;
     - reports the steps of each case reached (from this browser's own
       progress record);
     - shows the questionnaires the seminar leader switched on.
   It never sends what anyone wrote. The number and length of messages are
   counted on the server when a patient answers.
   ============================================================ */
(function () {
  "use strict";
  if (location.hostname === "admin.clincog.net") return;

  var TICK = 5, FLUSH = 30, IDLE = 60;
  var STAGES = ["interview", "icd", "dimensional", "cognitive", "report", "complete"];
  var state = null, acc = 0, lastInput = Date.now(), flushing = false;

  function visitorId() {
    try {
      var v = localStorage.getItem("clincog_visitor");
      if (!v) {
        v = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(4)), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
        localStorage.setItem("clincog_visitor", v);
      }
      return v;
    } catch (e) { return ""; }
  }
  var V = visitorId();
  function pageInfo() {
    var p = location.pathname.replace(/\.html$/, "");
    var m = /^\/(schizophrenia|depression|anxiety|addiction)-(chat|eval)$/.exec(p);
    if (m) return { page: m[2], case: m[1] };
    if (p === "/dashboard") return { page: "dashboard", case: "" };
    if (p === "/progress") return { page: "progress", case: "" };
    return { page: "resources", case: "" };
  }
  var PAGE = pageInfo();
  function device() {
    var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    if (!coarse) return "computer";
    return Math.min(screen.width, screen.height) < 600 ? "phone" : "tablet";
  }
  function post(what, body, beacon) {
    body.v = V;
    var data = JSON.stringify(body);
    if (beacon && navigator.sendBeacon) { try { if (navigator.sendBeacon("/api/study/" + what, new Blob([data], { type: "text/plain" }))) return Promise.resolve({}); } catch (e) {} }
    return fetch("/api/study/" + what, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "text/plain" }, body: data, keepalive: !!beacon })
      .then(function (r) { return r.json(); });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- steps of each case, from this browser's progress ----------
  function newStages() {
    if (typeof ClinCog === "undefined" || !ClinCog.MODULES) return {};
    var sent = {};
    try { sent = JSON.parse(localStorage.getItem("clincog_study_stages") || "{}"); } catch (e) {}
    var out = {}, any = false;
    ClinCog.MODULES.forEach(function (m) {
      var st = ClinCog.getCaseStatus(m.id).stage, i = STAGES.indexOf(st);
      var done = sent[m.id] == null ? -1 : sent[m.id];
      if (i > done) { out[m.id] = STAGES.slice(done + 1, i + 1); any = true; }
    });
    return any ? out : {};
  }
  function markSent(stages) {
    var sent = {};
    try { sent = JSON.parse(localStorage.getItem("clincog_study_stages") || "{}"); } catch (e) {}
    for (var c in stages) sent[c] = STAGES.indexOf(stages[c][stages[c].length - 1]);
    try { localStorage.setItem("clincog_study_stages", JSON.stringify(sent)); } catch (e) {}
  }

  // ---------- active time ----------
  function flush(beacon) {
    if (!state || !state.consent.agreed || (flushing && !beacon)) return;
    var stages = newStages();
    if (!acc && !Object.keys(stages).length) return;
    var sec = acc; acc = 0;
    flushing = !beacon;
    post("beat", { page: PAGE.page, case: PAGE.case, sec: sec, device: device(), stages: stages }, beacon)
      .then(function () { markSent(stages); })
      .catch(function () { acc += sec; })
      .then(function () { flushing = false; });
    if (beacon) markSent(stages);
  }
  function startTracking() {
    ["pointerdown", "keydown", "scroll", "touchstart", "wheel"].forEach(function (ev) {
      window.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true });
    });
    var moved = 0;
    window.addEventListener("pointermove", function () { var t = Date.now(); if (t - moved > 2000) { moved = t; lastInput = t; } }, { passive: true });
    var n = 0;
    setInterval(function () {
      if (document.visibilityState === "visible" && Date.now() - lastInput < IDLE * 1000) acc += TICK;
      if (++n % (FLUSH / TICK) === 0) flush(false);
    }, TICK * 1000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(true); });
    window.addEventListener("pagehide", function () { flush(true); });
    flush(false); // steps reached before this page
  }

  // ---------- dialogs ----------
  var openDialog = null;
  function dialog(build, dismissible) {
    if (openDialog) openDialog.close();
    var back = el("div", "study-backdrop"), box = el("div", "study-dialog");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    back.appendChild(box);
    var before = document.activeElement;
    var api = {
      box: box,
      close: function () { back.remove(); document.documentElement.classList.remove("study-open"); openDialog = null; if (before && before.focus) try { before.focus(); } catch (e) {} },
    };
    build(box, api);
    document.body.appendChild(back);
    document.documentElement.classList.add("study-open");
    openDialog = api;
    back.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dismissible) { e.preventDefault(); api.close(); }
      if (e.key === "Tab") { // keep the focus inside
        var f = box.querySelectorAll("button, input, textarea, a[href]");
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    setTimeout(function () { var h = box.querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } }, 30);
    return api;
  }
  // A general notice, shown once, with one button. Read again from
  // "Your data" at the bottom of every page.
  function showConsent(again) {
    dialog(function (box, api) {
      box.appendChild(el("p", "study-eyebrow", "ClinCog"));
      box.appendChild(el("h2", "study-title", "About your data"));
      var body = el("div", "study-text");
      String(state.text || "").split(/\n{2,}/).forEach(function (para) { body.appendChild(el("p", "", para)); });
      box.appendChild(body);
      var row = el("div", "study-actions");
      var ok = el("button", "btn btn-primary", again && state.consent.agreed ? "Close" : "Accept"); ok.type = "button";
      ok.addEventListener("click", function () {
        if (again && state.consent.agreed) { api.close(); return; }
        ok.disabled = true;
        post("consent", { agree: true })
          .then(function () { api.close(); return load(); })
          .catch(function () { ok.disabled = false; });
      });
      row.appendChild(ok);
      box.appendChild(row);
    }, !!again && state.consent.agreed);
  }
  function snoozed(p) { try { return sessionStorage.getItem("clincog_study_later_" + p.q.id + "_" + p.round) === "1"; } catch (e) { return false; } }
  function showQuestionnaire(p) {
    var q = p.q;
    dialog(function (box, api) {
      box.classList.add("study-q");
      box.appendChild(el("p", "study-eyebrow", "Questionnaire" + (p.caseName ? " · " + p.caseName : "")));
      box.appendChild(el("h2", "study-title", q.title));
      if (q.intro) { var it = el("div", "study-text"); q.intro.split(/\n{2,}/).forEach(function (para) { it.appendChild(el("p", "", para.replace(/\{patient\}/g, p.caseName || "the patient"))); }); box.appendChild(it); }
      var answers = {}, form = el("div", "study-items");
      q.items.forEach(function (item, idx) {
        var f = el("fieldset", "study-item"); f.dataset.id = item.id;
        var lg = el("legend", "", (idx + 1) + ". " + item.text.replace(/\{patient\}/g, p.caseName || "the patient"));
        if (!item.required && item.type !== "text") lg.appendChild(el("span", "study-opt", " (optional)"));
        f.appendChild(lg);
        if (item.type === "scale") {
          var sc = el("div", "study-scale");
          for (var v = item.min; v <= item.max; v++) (function (v) {
            var b = el("button", "study-pt", String(v)); b.type = "button"; b.setAttribute("aria-pressed", "false");
            b.setAttribute("aria-label", v + (v === item.min && item.minLabel ? " - " + item.minLabel : v === item.max && item.maxLabel ? " - " + item.maxLabel : ""));
            b.addEventListener("click", function () {
              answers[item.id] = v;
              [].forEach.call(sc.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
              f.classList.remove("missing");
            });
            sc.appendChild(b);
          })(v);
          f.appendChild(sc);
          if (item.minLabel || item.maxLabel) { var ends = el("div", "study-ends"); ends.appendChild(el("span", "", item.minLabel || "")); ends.appendChild(el("span", "", item.maxLabel || "")); f.appendChild(ends); }
        } else if (item.type === "choice") {
          var ch = el("div", "study-choices");
          item.options.forEach(function (o) {
            var b = el("button", "study-choice", o); b.type = "button"; b.setAttribute("aria-pressed", "false");
            b.addEventListener("click", function () { answers[item.id] = o; [].forEach.call(ch.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); f.classList.remove("missing"); });
            ch.appendChild(b);
          });
          f.appendChild(ch);
        } else {
          var ta = el("textarea", "study-textarea"); ta.rows = 3; ta.maxLength = 4000;
          ta.setAttribute("aria-label", item.text);
          ta.addEventListener("input", function () { answers[item.id] = ta.value; });
          f.appendChild(ta);
        }
        form.appendChild(f);
      });
      box.appendChild(form);
      var err = el("p", "study-err");
      var row = el("div", "study-actions");
      // Every questionnaire can be skipped; a skip is recorded, so it is not
      // asked again (that round, or that patient).
      var skip = el("button", "btn btn-secondary", "Skip"); skip.type = "button";
      skip.addEventListener("click", function () {
        skip.disabled = true;
        post("respond", { qid: q.id, round: p.round, skip: true })
          .then(function () { api.close(); state.pending = state.pending.filter(function (x) { return !(x.q.id === q.id && x.round === p.round); }); next(); })
          .catch(function () { skip.disabled = false; err.textContent = "No connection. Try again in a moment."; });
      });
      row.appendChild(skip);
      var send = el("button", "btn btn-primary", "Send answers"); send.type = "button";
      send.addEventListener("click", function () {
        var missing = q.items.filter(function (item) { return item.required && (answers[item.id] == null || answers[item.id] === ""); });
        form.querySelectorAll(".study-item").forEach(function (f) { f.classList.toggle("missing", missing.some(function (m) { return m.id === f.dataset.id; })); });
        if (missing.length) { err.textContent = "Please answer the questions marked in red."; var m0 = form.querySelector(".missing"); if (m0) m0.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        send.disabled = true; err.textContent = "";
        post("respond", { qid: q.id, round: p.round, answers: answers })
          .then(function (r) {
            if (r && r.error) { err.textContent = r.error; send.disabled = false; return; }
            api.close();
            if (window.ClinCogToast) window.ClinCogToast.show({ title: "Thank you", detail: "Your answers were saved." });
            state.pending = state.pending.filter(function (x) { return !(x.q.id === q.id && x.round === p.round); });
            next();
          })
          .catch(function () { err.textContent = "No connection. Try again in a moment."; send.disabled = false; });
      });
      row.appendChild(err); row.appendChild(send);
      box.appendChild(row);
    }, false);
  }
  function next() {
    if (!state || !state.consent.agreed) return;
    var p = state.pending.filter(function (x) { return !snoozed(x); })[0];
    if (p) setTimeout(function () { showQuestionnaire(p); }, 400);
  }

  // ---------- start ----------
  var tracking = false;
  function load() {
    return fetch("/api/study/state?v=" + encodeURIComponent(V) + "&page=" + PAGE.page + "&case=" + PAGE.case, { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s || !s.enabled) return;
        state = s;
        addFooterLink();
        if (!s.consent.asked) { showConsent(false); return; }
        if (s.consent.agreed && !tracking) { tracking = true; startTracking(); }
        next();
      })
      .catch(function () {});
  }
  function addFooterLink() {
    var f = document.querySelector(".shell-footer");
    if (!f || f.querySelector(".study-link")) return;
    f.appendChild(document.createTextNode(" "));
    var a = el("a", "study-link", "Your data"); a.href = "#study";
    a.addEventListener("click", function (e) { e.preventDefault(); showConsent(true); });
    f.appendChild(a);
  }
  // A visitor on the public site who has not started (no name yet) is on
  // the landing page only; the question waits until they are in the app.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
