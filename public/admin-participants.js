/* ============================================================
   admin-participants.js - Participant Data on the admin console.

   Reads  GET  /api/monitor/study/overview?kind=uvt|demo
              GET  /api/monitor/study/participant?kind=&pid=
              GET  /api/monitor/study/questionnaires
              GET  /api/monitor/study/results?id=
              GET  /api/monitor/study/export?what=&kind=&pseudo=
   Writes POST /api/monitor/study/questionnaire, questionnaire-delete,
              responses-delete, purge;  POST /api/monitor/seminar (op study)
   ============================================================ */
(function () {
  "use strict";

  var CASES = [
    { id: "schizophrenia", name: "Dennis" }, { id: "depression", name: "Darren" },
    { id: "anxiety", name: "Alex" }, { id: "addiction", name: "Jordan" },
  ];
  var STAGES = ["interview", "icd", "dimensional", "cognitive", "report", "complete"];
  var STAGE_LABEL = { interview: "Interview", icd: "ICD-11", dimensional: "Dimensional", cognitive: "Cognitive task", report: "Report", complete: "Complete" };
  var STAGE_SHORT = ["Int", "ICD", "Dim", "Cog", "Rep", "✓"];
  var HOST = { uvt: "uvt.clincog.net", demo: "clincog.net" };
  var S = { tab: "uvt", data: null, sel: null, quests: null, editing: null };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el("button", cls, text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
  function toast(t, d) { if (window.ClinCogToast) window.ClinCogToast.show({ title: t, detail: d || "" }); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDate(ms) { if (!ms) return "-"; var d = new Date(ms); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fmtDay(iso) { var d = new Date(iso + "T00:00:00Z"); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function dur(sec) { sec = Math.round(sec || 0); if (sec < 60) return sec + " s"; var m = Math.round(sec / 60); if (m < 60) return m + " min"; return Math.floor(m / 60) + " h " + pad(m % 60) + " min"; }
  function hours(sec) { return (sec / 3600).toFixed(sec < 36000 ? 1 : 0) + " h"; }
  function median(xs) { if (!xs.length) return 0; var a = xs.slice().sort(function (x, y) { return x - y; }), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function money(v) { return v ? (v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2)) : "-"; }
  function who(pid) { return pid.indexOf("v:") === 0 ? "Visitor " + pid.slice(2, 6) : pid; }
  function toLocalInput(ms) { if (ms == null) return ""; var d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fromLocalInput(v) { if (!v) return null; var t = new Date(v).getTime(); return isNaN(t) ? null : t; }
  function api(path, body) {
    var o = body ? { method: "POST", headers: { "Content-Type": "application/json", "X-ClinCog-Admin": "1" }, body: JSON.stringify(body) } : { cache: "no-store" };
    return fetch("/api/monitor/study/" + path, o).then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || "That did not work."); return j; }); });
  }
  function msgsOf(p) { var n = 0; for (var c in p.msgs) n += p.msgs[c]; return n; }
  function statusOf(p) { return !p.consent ? "none" : p.consent.agreed ? "agreed" : "declined"; }

  // ---------- tabs ----------
  function setTab(t) {
    S.tab = t; S.sel = null;
    [].forEach.call($("pd-tabs").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.tab === t)); });
    $("pd-people").hidden = !(t === "uvt" || t === "demo");
    $("pd-quest").hidden = t !== "quest";
    $("pd-data").hidden = t !== "data";
    try { history.replaceState(null, "", "#" + t); } catch (e) {}
    if (t === "uvt" || t === "demo") loadOverview();
    else if (t === "quest") loadQuests();
    else loadData();
  }
  $("pd-tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setTab(b.dataset.tab); });

  // ---------- participants ----------
  function loadOverview() {
    var kind = S.tab;
    return api("overview?kind=" + kind).then(function (d) { if (S.tab !== kind) return; S.data = d; renderPeople(); })
      .catch(function (e) { toast("Could not load the data", e.message); });
  }
  function renderPeople() {
    var d = S.data, kind = d.kind, ps = d.participants;
    var agreed = ps.filter(function (p) { return statusOf(p) === "agreed"; });
    var declined = ps.filter(function (p) { return statusOf(p) === "declined"; }).length;
    var none = ps.filter(function (p) { return statusOf(p) === "none"; }).length;
    var secs = agreed.map(function (p) { return p.sec; });
    var totalSec = secs.reduce(function (a, b) { return a + b; }, 0);
    var sess = agreed.map(function (p) { return p.sessions; });
    var msgs = agreed.map(msgsOf);
    var completions = 0, anyDone = 0;
    agreed.forEach(function (p) { var k = 0; for (var c in p.stages) if (p.stages[c] === 5) k++; completions += k; if (k) anyDone++; });
    var thisWeek = d.weeks.length ? d.weeks[d.weeks.length - 1] : null;
    var now0 = new Date(), d0 = new Date(now0.getFullYear() + "-" + pad(now0.getMonth() + 1) + "-" + pad(now0.getDate()) + "T00:00:00Z");
    var wkNow = new Date(d0 - ((d0.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
    var activeNow = thisWeek && thisWeek.week === wkNow ? thisWeek.active : 0;
    var sessMs = agreed.reduce(function (a, p) { return a + p.sessionMs; }, 0), sessN = sess.reduce(function (a, b) { return a + b; }, 0);
    var tiles = [
      ["Recorded", String(agreed.length), kind === "uvt" ? "accepted the notice · " + none + " on the list have not opened the app yet" : "visitors who accepted the notice"],
      ["Active time", hours(totalSec), "median " + dur(median(secs)) + " per participant"],
      ["Sessions", String(sessN), "median " + median(sess) + " per participant · typical length " + dur(sessN ? sessMs / sessN / 1000 : 0)],
      ["Messages to patients", String(msgs.reduce(function (a, b) { return a + b; }, 0)), "median " + median(msgs) + " per participant"],
      ["Cases completed", String(completions), anyDone + " of " + agreed.length + " participants finished at least one"],
      ["Active this week", String(activeNow), "of " + agreed.length + " recorded (week of " + fmtDay(wkNow) + ")"],
    ];
    var host = $("pd-tiles"); host.textContent = "";
    tiles.forEach(function (t) { var x = el("div", "tile"); x.appendChild(el("small", "", t[0])); x.appendChild(el("b", "", t[1])); x.appendChild(el("span", "", t[2])); host.appendChild(x); });
    renderWeeks(d.weeks);
    renderFunnel(agreed);
    $("pd-list-title").textContent = kind === "uvt" ? "Participants" : "Visitors";
    $("pd-list-sub").textContent = kind === "uvt"
      ? "Everyone on the class list, by student number. Select a row for that participant's own record."
      : "Anonymous visitors of the public demo, by the code kept in their browser. Select a row for their record.";
    renderTable();
    if (S.sel) openDetail(S.sel);
  }
  function renderWeeks(weeks) {
    var host = $("pd-weeks"); host.textContent = "";
    if (!weeks.length) { host.appendChild(el("div", "empty", "No activity recorded yet.")); return; }
    var W = Math.max(280, host.clientWidth || 700), H = 170, padB = 24, padT = 22, n = weeks.length;
    var max = Math.max.apply(null, weeks.map(function (w) { return w.active; })) || 1;
    var bw = Math.min(56, (W - 8) / n - 8), step = (W - 8) / n;
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("height", H); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Active participants per week: " + weeks.map(function (w) { return fmtDay(w.week) + " " + w.active; }).join(", "));
    function add(tag, a, cls, text) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (cls) e.setAttribute("class", cls); if (text != null) e.textContent = text; svg.appendChild(e); return e; }
    add("line", { x1: 0, x2: W, y1: H - padB, y2: H - padB }, "grid");
    weeks.forEach(function (w, i) {
      var h = (H - padB - padT) * w.active / max, x = 4 + i * step + (step - bw) / 2, y = H - padB - h;
      var r = add("rect", { x: x, y: y, width: bw, height: Math.max(1, h), rx: 4 }, "bar");
      var t = document.createElementNS(NS, "title"); t.textContent = "Week of " + fmtDay(w.week) + ": " + w.active + " active, " + hours(w.sec) + ", " + w.msgs + " messages"; r.appendChild(t);
      add("text", { x: x + bw / 2, y: y - 6, "text-anchor": "middle" }, "val", String(w.active));
      if (n <= 16 || i % Math.ceil(n / 12) === 0) add("text", { x: x + bw / 2, y: H - 7, "text-anchor": "middle" }, "axis", fmtDay(w.week));
    });
    host.appendChild(svg);
  }
  function renderFunnel(agreed) {
    var host = $("pd-funnel"); host.textContent = "";
    var t = el("table", "tbl funnel"), hr = el("tr");
    hr.appendChild(el("th", "", "Case"));
    STAGES.forEach(function (s) { hr.appendChild(el("th", "num", STAGE_LABEL[s])); });
    var th = el("thead"); th.appendChild(hr); t.appendChild(th);
    var tb = el("tbody"), N = agreed.length || 1;
    CASES.forEach(function (c) {
      var tr = el("tr"); tr.appendChild(el("td", "", c.name));
      STAGES.forEach(function (s, i) {
        var n = agreed.filter(function (p) { return p.stages[c.id] != null && p.stages[c.id] >= i; }).length;
        var td = el("td", "num"); td.appendChild(document.createTextNode(n + " (" + Math.round(n / N * 100) + "%)"));
        var b = el("div", "fbar"), f = el("i"); f.style.width = (n / N * 100) + "%"; b.appendChild(f); td.appendChild(b);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); host.appendChild(t);
  }
  function renderTable() {
    var d = S.data, f = $("pd-filter").value, q = $("pd-search").value.trim().toLowerCase(), sort = $("pd-sort").value;
    var rows = d.participants.filter(function (p) {
      var st = statusOf(p);
      if (f !== "all" && st !== f) return false;
      return !q || p.pid.toLowerCase().indexOf(q) >= 0 || (p.note || "").toLowerCase().indexOf(q) >= 0;
    });
    rows.sort(function (a, b) {
      if (sort === "pid") return a.pid < b.pid ? -1 : 1;
      if (sort === "sec") return b.sec - a.sec;
      if (sort === "msgs") return msgsOf(b) - msgsOf(a);
      if (sort === "sessions") return b.sessions - a.sessions;
      return (b.last || 0) - (a.last || 0);
    });
    $("pd-count").textContent = rows.length + (rows.length === 1 ? " person" : " people") + (rows.length > 300 ? ", first 300 shown" : "");
    var host = $("pd-table"); host.textContent = "";
    if (!rows.length) { host.appendChild(el("div", "empty", d.participants.length ? "Nobody matches." : "Nobody yet.")); return; }
    var t = el("table", "tbl"), hr = el("tr");
    ["Participant", "Notice", "Active time", "Sessions", "Days", "Messages (" + CASES.map(function (c) { return c.name.slice(0, 2); }).join(" · ") + ")", "Steps reached", "Questionnaires", "Last active", "Cost"].forEach(function (h, i) {
      hr.appendChild(el("th", i >= 2 && i <= 4 || i === 7 || i === 9 ? "num" : "", h));
    });
    var th = el("thead"); th.appendChild(hr); t.appendChild(th);
    var tb = el("tbody");
    rows.slice(0, 300).forEach(function (p) {
      var tr = el("tr", "click" + (S.sel === p.pid ? " sel" : ""));
      tr.tabIndex = 0;
      var id = el("td", "mono", who(p.pid)); if (p.note) id.appendChild(el("span", "muted", " " + p.note)); tr.appendChild(id);
      var st = statusOf(p), ct = el("td"); ct.appendChild(el("span", "pill" + (st === "agreed" ? " agree" : st === "declined" ? " off" : ""), st === "agreed" ? "Accepted" : st === "declined" ? "Declined" : "Not yet")); tr.appendChild(ct);
      tr.appendChild(el("td", "num", p.sec ? dur(p.sec) : "-"));
      tr.appendChild(el("td", "num", String(p.sessions || "-")));
      tr.appendChild(el("td", "num", String(p.days || "-")));
      var mc = el("td"), ch = el("span", "chips"); CASES.forEach(function (c) { ch.appendChild(el("span", "", String(p.msgs[c.id] || 0))); }); mc.appendChild(ch); tr.appendChild(mc);
      var sc = el("td"), ch2 = el("span", "chips");
      CASES.forEach(function (c) { var i = p.stages[c.id]; var s = el("span", "st" + (i === 5 ? " done" : i == null ? " free" : ""), i == null ? "-" : STAGE_SHORT[i]); s.title = c.name + ": " + (i == null ? "not started" : STAGE_LABEL[STAGES[i]]); ch2.appendChild(s); });
      sc.appendChild(ch2); tr.appendChild(sc);
      tr.appendChild(el("td", "num", String(p.responses || "-")));
      var lt = el("td", "muted", p.last ? fmtDate(p.last).replace(/ \d{4},/, ",") : "-"); lt.style.whiteSpace = "nowrap"; tr.appendChild(lt);
      tr.appendChild(el("td", "num", money(p.cost)));
      function open() { S.sel = p.pid; renderTable(); openDetail(p.pid); }
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); host.appendChild(t);
  }
  ["pd-filter", "pd-sort"].forEach(function (id) { $(id).addEventListener("change", renderTable); });
  $("pd-search").addEventListener("input", renderTable);

  function openDetail(pid) {
    var kind = S.data.kind, box = $("pd-detail");
    box.hidden = false; box.textContent = ""; box.appendChild(el("p", "sub", "Loading…"));
    api("participant?kind=" + kind + "&pid=" + encodeURIComponent(pid)).then(function (d) {
      box.textContent = "";
      var top = el("div", "row-actions"); top.style.marginTop = "0"; top.style.justifyContent = "space-between";
      var h = el("div"); h.appendChild(el("h3", "", who(pid)));
      h.appendChild(el("p", "sub", d.consent ? (d.consent.agreed ? "Accepted the notice" : "Declined") + " on " + fmtDate(d.consent.ts) + (d.consent.first !== d.consent.ts ? " (first answered " + fmtDate(d.consent.first) + ")" : "") : "Has not opened the app since recording began."));
      top.appendChild(h);
      var acts = el("div", "row-actions"); acts.style.marginTop = "0";
      acts.appendChild(btn("btn-ghost btn-sm danger", "Delete this person's data", function () {
        if (!confirm("Delete everything recorded about " + who(pid) + " (activity, messages, steps, answers)? Their consent answer is kept. This cannot be undone.")) return;
        api("purge", { kind: kind, pid: pid }).then(function () { toast("Deleted"); loadOverview(); }).catch(function (e) { toast("Not deleted", e.message); });
      }));
      acts.appendChild(btn("btn-ghost btn-sm", "Close", function () { S.sel = null; box.hidden = true; renderTable(); }));
      top.appendChild(acts);
      box.appendChild(top);

      // minutes per day, last 60 days with activity
      var byDay = {}; d.days.forEach(function (r) { byDay[r.day] = (byDay[r.day] || 0) + r.sec; });
      var msgDay = {}; d.msgs.forEach(function (r) { msgDay[r.day] = (msgDay[r.day] || 0) + r.n; });
      var days = Object.keys(byDay).sort().slice(-60);
      var chart = el("div", "wk"); box.appendChild(chart);
      if (days.length) dayChart(chart, days.map(function (k) { return { day: k, sec: byDay[k], msgs: msgDay[k] || 0 }; }));
      else chart.appendChild(el("p", "sub", "No active time recorded."));

      var g = el("div", "detail-grid");
      var pages = {}; d.days.forEach(function (r) { pages[r.page] = (pages[r.page] || 0) + r.sec; });
      var b1 = el("div", "dbox"); b1.appendChild(el("h4", "", "Where the time went")); var u1 = el("ul");
      [["chat", "Interviews"], ["eval", "Evaluations"], ["dashboard", "Dashboard"], ["progress", "My progress"], ["resources", "Resources and other pages"]].forEach(function (x) { u1.appendChild(el("li", "", x[1] + ": " + dur(pages[x[0]] || 0))); });
      b1.appendChild(u1); g.appendChild(b1);
      var b2 = el("div", "dbox"); b2.appendChild(el("h4", "", "Each case")); var u2 = el("ul");
      CASES.forEach(function (c) {
        var steps = d.progress.filter(function (r) { return r.cs === c.id; });
        var n = d.msgs.filter(function (r) { return r.cs === c.id; }).reduce(function (a, r) { return a + r.n; }, 0);
        var ch = d.msgs.filter(function (r) { return r.cs === c.id; }).reduce(function (a, r) { return a + r.chars; }, 0);
        var t = d.days.filter(function (r) { return r.cs === c.id; }).reduce(function (a, r) { return a + r.sec; }, 0);
        var li = el("li"); li.appendChild(el("b", "", c.name + " "));
        li.appendChild(document.createTextNode(n + " messages" + (n ? " (~" + Math.round(ch / n) + " characters each)" : "") + ", " + dur(t)));
        if (steps.length) li.appendChild(el("div", "muted", steps.map(function (r) { return STAGE_LABEL[r.stage] + " " + fmtDate(r.ts).replace(/ \d{4},/, ","); }).join(" → ")));
        u2.appendChild(li);
      });
      b2.appendChild(u2); g.appendChild(b2);
      var b3 = el("div", "dbox"); b3.appendChild(el("h4", "", "Sessions (latest " + d.sessions.length + ")")); var u3 = el("ul");
      if (!d.sessions.length) u3.appendChild(el("li", "muted", "None yet."));
      d.sessions.slice(0, 15).forEach(function (s) { u3.appendChild(el("li", "", fmtDate(s.start) + " · " + dur((s.last - s.start) / 1000) + " · " + s.device)); });
      b3.appendChild(u3); g.appendChild(b3);
      var b4 = el("div", "dbox"); b4.appendChild(el("h4", "", "Questionnaire answers")); var u4 = el("ul");
      if (!d.responses.length) u4.appendChild(el("li", "muted", "None yet."));
      d.responses.forEach(function (r) {
        var li = el("li"); li.appendChild(el("b", "", r.title + " "));
        li.appendChild(el("span", "muted", (CASES.filter(function (c) { return c.id === r.round; })[0] || { name: r.round }).name + " · " + fmtDate(r.ts)));
        if (r.skipped) li.appendChild(el("div", "muted", "Skipped"));
        else r.items.forEach(function (it, i) { var v = r.answers[it.id]; if (v == null || v === "") return; li.appendChild(el("div", "", (i + 1) + ". " + (it.type === "scale" ? v + " / " + it.max : v))); });
        u4.appendChild(li);
      });
      b4.appendChild(u4); g.appendChild(b4);
      box.appendChild(g);
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }).catch(function (e) { box.textContent = ""; box.appendChild(el("p", "err", e.message)); });
  }
  function dayChart(host, days) {
    var W = Math.max(280, host.clientWidth || 700), H = 120, padB = 22, padT = 18, n = days.length;
    var max = Math.max.apply(null, days.map(function (x) { return x.sec; })) || 1, step = (W - 4) / n, bw = Math.max(3, Math.min(28, step - 4));
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("height", H); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Active minutes per day");
    function add(tag, a, cls, text) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (cls) e.setAttribute("class", cls); if (text != null) e.textContent = text; svg.appendChild(e); return e; }
    add("line", { x1: 0, x2: W, y1: H - padB, y2: H - padB }, "grid");
    days.forEach(function (x, i) {
      var h = (H - padB - padT) * x.sec / max, X = 2 + i * step + (step - bw) / 2;
      var r = add("rect", { x: X, y: H - padB - h, width: bw, height: Math.max(1, h), rx: 3 }, "bar");
      var t = document.createElementNS(NS, "title"); t.textContent = fmtDay(x.day) + ": " + dur(x.sec) + ", " + x.msgs + " messages"; r.appendChild(t);
    });
    [0, n - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i, k) { add("text", { x: k ? W - 2 : 2, y: H - 6, "text-anchor": k ? "end" : "start" }, "axis", fmtDay(days[i].day)); });
    add("text", { x: W - 2, y: 11, "text-anchor": "end" }, "axis", "busiest day " + dur(max));
    host.appendChild(svg);
  }

  // ---------- questionnaires ----------
  var TEMPLATES = {
    blank: function () { return { title: "", intro: "", kind: "uvt", active: false, required: false, trigger: "window", cases: [], rounds: [{ label: "Once", from: null, until: null }], items: [{ type: "scale", text: "", min: 1, max: 5, minLabel: "", maxLabel: "", required: true }] }; },
    confidence: function () {
      var lbl = { min: 0, max: 10, minLabel: "Not at all confident", maxLabel: "Completely confident", required: true, type: "scale" };
      return { title: "Confidence in clinical interviewing", kind: "uvt", active: false, required: false, trigger: "window",
        intro: "Rate how confident you are that you could do each of the following in an interview with a real patient today, from 0 (not at all confident) to 10 (completely confident). There are no right answers.",
        rounds: [{ label: "Before", from: null, until: null }, { label: "After", from: Date.now() + 42 * 86400e3, until: null }], cases: [],
        items: ["Open the interview and put the patient at ease.", "Ask open questions about what brought the patient here.", "Explore a symptom in enough depth to judge how severe it is.",
          "Ask about risk, such as thoughts of self-harm, calmly and directly.", "Respond well to a patient who is suspicious, withdrawn or plays things down.",
          "Summarise what you heard and check it with the patient.", "Judge which diagnostic criteria the information supports.", "Close the interview and explain the next steps."]
          .map(function (t) { return Object.assign({ text: t }, lbl); }) };
    },
    patient: function () {
      var ag = { type: "scale", min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree", required: true };
      return { title: "Your experience with {patient}", kind: "uvt", active: false, required: false, trigger: "afterCase", cases: [], rounds: [],
        intro: "You have finished the case of {patient}. A few questions about the experience, from 1 (strongly disagree) to 7 (strongly agree).",
        items: ["{patient} felt like a real person.", "{patient}'s answers fitted what I had asked.", "The interview let me practise skills I will need with real patients.",
          "I felt engaged during the conversation.", "The case was difficult.", "Evaluating the case through the three lenses helped me understand it.", "I would like more cases like this one."]
          .map(function (t) { return Object.assign({ text: t }, ag); })
          .concat([{ type: "text", text: "What was the most useful part of this case?", required: false }, { type: "text", text: "What would you change?", required: false }]) };
    },
    sus: function () {
      var ag = { type: "scale", min: 1, max: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree", required: true };
      return { title: "System Usability Scale", kind: "uvt", active: false, required: false, trigger: "window", scoring: "sus", cases: [],
        intro: "For each statement, choose how much you agree, thinking about ClinCog as a whole. (Brooke, J. (1996). SUS: a quick and dirty usability scale.)",
        rounds: [{ label: "End of semester", from: null, until: null }],
        items: ["I think that I would like to use this system frequently.", "I found the system unnecessarily complex.", "I thought the system was easy to use.",
          "I think that I would need the support of a technical person to be able to use this system.", "I found the various functions in this system were well integrated.",
          "I thought there was too much inconsistency in this system.", "I would imagine that most people would learn to use this system very quickly.",
          "I found the system very cumbersome to use.", "I felt very confident using the system.", "I needed to learn a lot of things before I could get going with this system."]
          .map(function (t) { return Object.assign({ text: t }, ag); }) };
    },
  };
  function trigText(q) {
    if (q.trigger === "window") return q.rounds.map(function (r) { return r.label + (r.from || r.until ? " (" + (r.from ? fmtDate(r.from) : "now") + " – " + (r.until ? fmtDate(r.until) : "no end") + ")" : ""); }).join(", ");
    var cs = q.cases.length ? q.cases.map(function (c) { return CASES.filter(function (x) { return x.id === c; })[0].name; }).join(", ") : "every patient";
    return (q.trigger === "beforeCase" ? "Before the first interview with " : "After finishing the case of ") + cs;
  }
  function loadQuests() {
    return api("questionnaires").then(function (d) { S.quests = d.list; renderQuests(); }).catch(function (e) { toast("Could not load", e.message); });
  }
  function renderQuests() {
    var host = $("q-list"); host.textContent = "";
    if (!S.quests.length) { host.appendChild(el("div", "empty", "No questionnaires yet. Start from a template above.")); return; }
    S.quests.forEach(function (q) {
      var c = el("div", "qcard"), m = el("div", "qmain");
      m.appendChild(el("b", "", q.title.replace(/\{patient\}/g, "[patient]") + " "));
      m.appendChild(el("span", "pill" + (q.active ? " run" : " off"), q.active ? "On" : "Off"));
      m.appendChild(el("div", "meta", HOST[q.kind] + " · " + trigText(q) + " · " + q.items.length + " questions · can be skipped"));
      m.appendChild(el("div", "meta", q.responses + " answered" + (q.skipped ? ", " + q.skipped + " skipped" : "")));
      c.appendChild(m);
      var a = el("div", "acts");
      a.appendChild(btn("btn-ghost btn-sm", q.active ? "Switch off" : "Switch on", function () {
        var nq = Object.assign({}, q, { active: !q.active });
        api("questionnaire", { q: nq }).then(function () { toast(nq.active ? "Switched on" : "Switched off", nq.active ? "Participants see it from their next page." : ""); loadQuests(); }).catch(function (e) { toast("Not saved", e.message); });
      }));
      a.appendChild(btn("btn-ghost btn-sm", "Results", function () { showResults(q.id); }));
      a.appendChild(btn("btn-ghost btn-sm", "Edit", function () { edit(JSON.parse(JSON.stringify(q))); }));
      a.appendChild(btn("btn-ghost btn-sm", "Duplicate", function () { var d = JSON.parse(JSON.stringify(q)); delete d.id; d.title += " (copy)"; d.active = false; edit(d); }));
      a.appendChild(btn("btn-ghost btn-sm danger", "Delete", function () {
        var withAns = q.responses + q.skipped > 0;
        if (!confirm("Delete “" + q.title + "”" + (withAns ? " and its " + (q.responses + q.skipped) + " answers? Export them first if you need them." : "?") + " This cannot be undone.")) return;
        api("questionnaire-delete", { id: q.id, responses: withAns }).then(function () { toast("Deleted"); $("q-results-sec").hidden = true; loadQuests(); }).catch(function (e) { toast("Not deleted", e.message); });
      }));
      c.appendChild(a);
      host.appendChild(c);
    });
  }
  $("q-new").addEventListener("click", function () { edit(TEMPLATES[$("q-template").value]()); });

  function field(label, input, note) { var f = el("label", "field"); f.appendChild(el("span", "", label)); f.appendChild(input); if (note) f.appendChild(el("small", "", note)); return f; }
  function inp(v, ph) { var i = el("input", "inp"); i.value = v == null ? "" : v; if (ph) i.placeholder = ph; return i; }
  function edit(q) {
    S.editing = q;
    $("q-results-sec").hidden = true;
    var sec = $("q-editor-sec"), box = $("q-editor");
    sec.hidden = false; box.textContent = "";
    $("q-editor-title").textContent = q.id ? "Edit questionnaire" : "New questionnaire";
    var g = el("div", "grid2");
    var title = inp(q.title, "e.g. Confidence in clinical interviewing"); g.appendChild(field("Title", title));
    var kind = el("select", "sel"); kind.appendChild(new Option("Seminar (uvt.clincog.net)", "uvt")); kind.appendChild(new Option("Public demo (clincog.net)", "demo")); kind.value = q.kind;
    g.appendChild(field("Shown on", kind));
    var intro = el("textarea", "inp"); intro.value = q.intro || ""; intro.placeholder = "What it is about, how to answer.";
    var fi = field("Introduction", intro); fi.style.gridColumn = "1 / -1"; g.appendChild(fi);
    var trig = el("select", "sel");
    [["window", "In a period (once per round)"], ["beforeCase", "Before the first interview with a patient"], ["afterCase", "After finishing a case"]].forEach(function (x) { trig.appendChild(new Option(x[1], x[0])); });
    trig.value = q.trigger; g.appendChild(field("When", trig));
    var flags = el("div", "field"); flags.appendChild(el("span", "", "Options"));
    var reqI = { checked: false };
    var act = el("label", "check"), actI = el("input"); actI.type = "checkbox"; actI.checked = !!q.active; act.appendChild(actI); act.appendChild(document.createTextNode(" On"));
    var ch = el("div", "checks"); ch.appendChild(act); ch.appendChild(el("span", "note", "Participants can always skip it.")); flags.appendChild(ch); g.appendChild(flags);
    box.appendChild(g);

    // rounds or cases
    var when = el("div"); when.style.marginTop = "16px"; box.appendChild(when);
    var rounds = (q.rounds || []).map(function (r) { return Object.assign({}, r); }), cases = (q.cases || []).slice();
    function drawWhen() {
      when.textContent = "";
      if (trig.value === "window") {
        when.appendChild(el("p", "note", "Each round is answered once by each participant, while it is open; when a later round opens, it replaces the earlier one (someone who missed Before is not asked for it after). Two rounds, such as Before and After, are compared per person in the results. Empty dates: open now / no end; every round after the first needs an opening date."));
        var list = el("div", "rounds");
        rounds.forEach(function (r, i) {
          var row = el("div", "round");
          var l = inp(r.label, "Round name"); l.addEventListener("input", function () { r.label = l.value; });
          var f = inp(toLocalInput(r.from)); f.type = "datetime-local"; f.setAttribute("aria-label", "Opens"); f.addEventListener("change", function () { r.from = fromLocalInput(f.value); });
          var u = inp(toLocalInput(r.until)); u.type = "datetime-local"; u.setAttribute("aria-label", "Closes"); u.addEventListener("change", function () { r.until = fromLocalInput(u.value); });
          row.appendChild(l); row.appendChild(f); row.appendChild(u);
          row.appendChild(btn("btn-ghost btn-sm danger", "Remove", function () { rounds.splice(i, 1); drawWhen(); }));
          list.appendChild(row);
        });
        when.appendChild(list);
        var add = btn("btn-ghost btn-sm", "Add a round", function () { rounds.push({ label: rounds.length ? "After" : "Before", from: rounds.length ? Date.now() + 28 * 86400e3 : null, until: null }); drawWhen(); }); add.style.marginTop = "8px";
        when.appendChild(add);
      } else {
        when.appendChild(el("p", "note", "Patients (none ticked: all of them). Each participant answers once per patient."));
        var cc = el("div", "checks");
        CASES.forEach(function (c) {
          var l = el("label", "check"), i = el("input"); i.type = "checkbox"; i.checked = cases.indexOf(c.id) >= 0;
          i.addEventListener("change", function () { if (i.checked) cases.push(c.id); else cases.splice(cases.indexOf(c.id), 1); });
          l.appendChild(i); l.appendChild(document.createTextNode(" " + c.name)); cc.appendChild(l);
        });
        when.appendChild(cc);
      }
    }
    trig.addEventListener("change", drawWhen); drawWhen();

    // items
    var itemsHost = el("div"); itemsHost.style.marginTop = "18px"; box.appendChild(itemsHost);
    var items = q.items.map(function (it) { return Object.assign({}, it, { options: Array.isArray(it.options) ? it.options.join("\n") : it.options || "" }); });
    function drawItems() {
      itemsHost.textContent = "";
      itemsHost.appendChild(el("h3", "", "Questions"));
      items.forEach(function (it, i) {
        var b = el("div", "qitem"), row = el("div", "qrow");
        var type = el("select", "sel"); [["scale", "Scale"], ["choice", "One choice"], ["text", "Written answer"]].forEach(function (x) { type.appendChild(new Option(x[1], x[0])); }); type.value = it.type || "scale";
        type.addEventListener("change", function () { it.type = type.value; if (it.type === "scale" && it.min == null) { it.min = 1; it.max = 5; } drawItems(); });
        var text = el("textarea", "inp"); text.rows = 2; text.value = it.text || ""; text.placeholder = "Question " + (i + 1); text.setAttribute("aria-label", "Question " + (i + 1));
        text.addEventListener("input", function () { it.text = text.value; });
        var tools = el("div", "tools");
        tools.appendChild(btn("btn-ghost btn-sm", "↑", function () { if (i) { items.splice(i - 1, 0, items.splice(i, 1)[0]); drawItems(); } }));
        tools.appendChild(btn("btn-ghost btn-sm", "↓", function () { if (i < items.length - 1) { items.splice(i + 1, 0, items.splice(i, 1)[0]); drawItems(); } }));
        tools.appendChild(btn("btn-ghost btn-sm danger", "Remove", function () { items.splice(i, 1); drawItems(); }));
        tools.children[0].setAttribute("aria-label", "Move up"); tools.children[1].setAttribute("aria-label", "Move down");
        row.appendChild(type); row.appendChild(text); row.appendChild(tools); b.appendChild(row);
        if (it.type === "scale") {
          var s4 = el("div", "scale4");
          var mn = inp(it.min, "From"); mn.type = "number"; mn.min = 0; mn.max = 10; mn.setAttribute("aria-label", "From"); mn.addEventListener("input", function () { it.min = Number(mn.value); });
          var mx = inp(it.max, "To"); mx.type = "number"; mx.min = 1; mx.max = 20; mx.setAttribute("aria-label", "To"); mx.addEventListener("input", function () { it.max = Number(mx.value); });
          var ml = inp(it.minLabel, "Label at the low end"); ml.addEventListener("input", function () { it.minLabel = ml.value; });
          var xl = inp(it.maxLabel, "Label at the high end"); xl.addEventListener("input", function () { it.maxLabel = xl.value; });
          [mn, mx, ml, xl].forEach(function (x) { s4.appendChild(x); }); b.appendChild(s4);
        } else if (it.type === "choice") {
          var op = el("textarea", "inp"); op.rows = 3; op.value = it.options || ""; op.placeholder = "One option per line"; op.addEventListener("input", function () { it.options = op.value; }); b.appendChild(op);
        }
        var fl = el("div", "checks");
        var rq = el("label", "check"), rqI = el("input"); rqI.type = "checkbox"; rqI.checked = it.required !== false && !(it.type === "text" && !it.required); rqI.addEventListener("change", function () { it.required = rqI.checked; });
        rq.appendChild(rqI); rq.appendChild(document.createTextNode(" Answer required")); fl.appendChild(rq);
        if (it.type === "scale") {
          var rv = el("label", "check"), rvI = el("input"); rvI.type = "checkbox"; rvI.checked = !!it.reverse; rvI.addEventListener("change", function () { it.reverse = rvI.checked; });
          rv.appendChild(rvI); rv.appendChild(document.createTextNode(" Reverse-scored in the results")); fl.appendChild(rv);
        }
        b.appendChild(fl);
        itemsHost.appendChild(b);
      });
      var add = btn("btn-ghost", "Add a question", function () { items.push({ type: "scale", text: "", min: 1, max: 5, required: true }); drawItems(); }); add.style.marginTop = "10px";
      itemsHost.appendChild(add);
    }
    drawItems();

    var err = el("span", "err"), row = el("div", "row-actions");
    row.appendChild(btn("btn-ink", "Save", function () {
      var out = { id: q.id, title: title.value, intro: intro.value, kind: kind.value, trigger: trig.value, required: reqI.checked, active: actI.checked, scoring: q.scoring || null,
        rounds: rounds, cases: cases, items: items.map(function (it) { return Object.assign({}, it, { options: String(it.options || "").split("\n") }); }) };
      err.textContent = "";
      api("questionnaire", { q: out }).then(function () { toast("Questionnaire saved", out.active ? "It is on." : "It is off: switch it on when you are ready."); sec.hidden = true; loadQuests(); })
        .catch(function (e) { err.textContent = e.message; });
    }));
    row.appendChild(btn("btn-ghost", "Cancel", function () { sec.hidden = true; }));
    if (q.scoring === "sus") row.appendChild(el("span", "note", "Scored as the SUS (0-100): keep the ten items in their order."));
    row.appendChild(err);
    box.appendChild(row);
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function num(v, d) { return v == null ? "-" : v.toFixed(d == null ? 2 : d); }
  function showResults(id) {
    var sec = $("q-results-sec"), box = $("q-results");
    $("q-editor-sec").hidden = true;
    sec.hidden = false; box.textContent = ""; box.appendChild(el("p", "note", "Loading…"));
    api("results?id=" + id).then(function (d) {
      var q = d.q, st = d.stats;
      $("q-results-title").textContent = q.title.replace(/\{patient\}/g, "[patient]");
      $("q-results-sub").textContent = HOST[q.kind] + " · " + trigText(q) + " · " + d.total + " answers in all.";
      box.textContent = "";
      var top = el("div", "row-actions"); top.style.marginTop = "0";
      var ps = el("label", "check"), psI = el("input"); psI.type = "checkbox"; psI.checked = true; ps.appendChild(psI); ps.appendChild(document.createTextNode(" Pseudonymise"));
      top.appendChild(btn("btn-ghost btn-sm", "Export answers (CSV)", function () { location.href = "/api/monitor/study/export?what=responses&kind=" + q.kind + "&pseudo=" + (psI.checked ? 1 : 0); }));
      top.appendChild(ps);
      top.appendChild(btn("btn-ghost btn-sm danger", "Delete the answers", function () {
        if (!confirm("Delete every answer to “" + q.title + "”? Participants will be asked again while it is on. This cannot be undone.")) return;
        api("responses-delete", { id: q.id, title: q.title }).then(function () { toast("Answers deleted"); showResults(q.id); loadQuests(); }).catch(function (e) { toast("Not deleted", e.message); });
      }));
      box.appendChild(top);
      if (st.paired && st.paired.items.some(function (x) { return x.n; })) {
        var pb = el("div", "res-item"); pb.appendChild(el("div", "q", "Change from " + st.paired.from + " to " + st.paired.to + " (the same people, scale questions)"));
        var ul = el("ul", "texts"); ul.style.maxHeight = "none";
        st.paired.items.forEach(function (x) { var it = q.items.filter(function (i) { return i.id === x.id; })[0]; ul.appendChild(el("li", "", it.text.replace(/[.?!:]$/, "") + ": " + (x.n ? (x.mean >= 0 ? "+" : "") + num(x.mean) + " (SD " + num(x.sd) + ", n = " + x.n + ")" : "no pairs yet"))); });
        pb.appendChild(ul); box.appendChild(pb);
      }
      st.rounds.forEach(function (r) {
        var h = el("h3", "", r.label); h.style.margin = "18px 0 2px"; box.appendChild(h);
        box.appendChild(el("p", "note", r.n + " answered" + (r.skipped ? ", " + r.skipped + " skipped" : "") +
          (r.scaleMean ? " · mean of the scale questions " + num(r.scaleMean.mean) + " (SD " + num(r.scaleMean.sd) + ")" : "") +
          (r.sus && r.sus.n ? " · SUS score " + num(r.sus.mean, 1) + " (SD " + num(r.sus.sd, 1) + ", n = " + r.sus.n + ")" : "")));
        if (!r.n) return;
        r.items.forEach(function (x, i) {
          var it = q.items.filter(function (y) { return y.id === x.id; })[0]; if (!it) return;
          var b = el("div", "res-item"); b.appendChild(el("div", "q", (i + 1) + ". " + it.text));
          if (it.type === "scale") {
            b.appendChild(el("div", "", "Mean " + num(x.mean) + (it.reverse ? " (reverse-scored)" : "") + ", SD " + num(x.sd) + ", n = " + x.n));
            var dist = el("div", "dist"), mx = Math.max.apply(null, Object.keys(x.dist).map(function (k) { return x.dist[k]; })) || 1;
            Object.keys(x.dist).forEach(function (k) { var c = el("div"); var bar = el("i"); bar.style.height = (x.dist[k] / mx * 30) + "px"; bar.title = k + ": " + x.dist[k]; c.appendChild(bar); c.appendChild(el("span", "", k)); dist.appendChild(c); });
            b.appendChild(dist);
          } else if (it.type === "choice") {
            Object.keys(x.counts).forEach(function (o) { var row = el("div", "", o + ": " + x.counts[o]); var fb = el("div", "fbar"), f = el("i"); f.style.width = (x.n ? x.counts[o] / x.n * 100 : 0) + "%"; fb.appendChild(f); row.appendChild(fb); b.appendChild(row); });
          } else {
            var ul2 = el("ul", "texts"); if (!x.texts.length) ul2.appendChild(el("li", "", "No written answers."));
            x.texts.forEach(function (t) { ul2.appendChild(el("li", "", t)); }); b.appendChild(ul2);
          }
          box.appendChild(b);
        });
      });
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function (e) { box.textContent = ""; box.appendChild(el("p", "err", e.message)); });
  }

  // ---------- consent & data ----------
  function loadData() {
    return api("overview?kind=uvt").then(function (d) { renderConsent(d); }).catch(function (e) { toast("Could not load", e.message); });
  }
  function renderConsent(d) {
    var host = $("c-forms"); host.textContent = "";
    ["uvt", "demo"].forEach(function (k) {
      var st = d.settings[k], cn = d.counts[k];
      var b = el("div", "qitem"); b.style.marginTop = "12px";
      b.appendChild(el("h3", "", HOST[k]));
      var sw = el("label", "switch"), swI = el("input"); swI.type = "checkbox"; swI.checked = st.enabled; sw.appendChild(swI); sw.appendChild(el("i")); sw.appendChild(el("span", "", "Collect study data here"));
      b.appendChild(sw);
      b.appendChild(el("p", "note", cn.agreed + " accepted · notice version " + st.version + (st.custom ? " · your own text" : " · the default text")));
      var ta = el("textarea", "inp consent-text"); ta.value = st.text; ta.setAttribute("aria-label", "Notice for " + HOST[k]);
      b.appendChild(field("What participants read (blank line = new paragraph)", ta));
      var err = el("span", "err"), row = el("div", "row-actions");
      function save(reask) {
        if (reask && !confirm("Show this notice to everyone on " + HOST[k] + " again? Until they accept it, nothing more is recorded about them.")) return;
        fetch("/api/monitor/seminar", { method: "POST", headers: { "Content-Type": "application/json", "X-ClinCog-Admin": "1" },
          body: JSON.stringify({ op: "study", args: { kind: k, enabled: swI.checked, text: ta.value, reask: !!reask } }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j.error) { err.textContent = j.error; return; } toast(reask ? "Saved, everyone sees it again" : "Saved"); loadData(); });
      }
      row.appendChild(btn("btn-ink", "Save", function () { save(false); }));
      row.appendChild(btn("btn-ghost", "Save and show it to everyone again", function () { save(true); }));
      row.appendChild(btn("btn-ghost", "Default text", function () { ta.value = d.defaults[k]; }));
      row.appendChild(err);
      b.appendChild(row);
      host.appendChild(b);
    });
  }
  var EXPORTS = [["participants", "Participants (one row each)"], ["activity", "Active time by day and page"], ["sessions", "Sessions"], ["messages", "Messages by day and case"], ["progress", "Case steps"], ["responses", "Questionnaire answers"], ["consent", "Notice accepted (when)"]];
  EXPORTS.forEach(function (x) {
    $("x-buttons").appendChild(btn("btn-ghost", x[1], function () { location.href = "/api/monitor/study/export?what=" + x[0] + "&kind=" + $("x-kind").value + "&pseudo=" + ($("x-pseudo").checked ? 1 : 0); }));
  });
  $("d-purge").addEventListener("click", function () {
    var k = $("d-kind").value, withC = $("d-consent").checked;
    var typed = prompt("Delete all recorded data of " + HOST[k] + (withC ? ", and show the notice to everyone again" : "") + "? This cannot be undone.\n\nType DELETE to confirm.");
    if (typed !== "DELETE") return;
    $("d-err").textContent = "";
    api("purge", { kind: k, consent: withC }).then(function () { toast("Study data deleted", HOST[k]); loadData(); }).catch(function (e) { $("d-err").textContent = e.message; });
  });

  var t0 = (location.hash || "").slice(1);
  setTab(["uvt", "demo", "quest", "data"].indexOf(t0) >= 0 ? t0 : "uvt");
  setInterval(function () { if ((S.tab === "uvt" || S.tab === "demo") && document.visibilityState === "visible") loadOverview(); }, 60000);
})();
