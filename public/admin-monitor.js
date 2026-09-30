/* ============================================================
   admin-monitor.js - the admin console's live monitoring page.

   Draws from two sources:
     GET /api/monitor/summary?range=…   totals, time series, participants
                                        and the latest events per lane
     WS  /api/monitor/live              every new reply, as it finishes
   The summary is the frame; live events are folded into it in place, and
   the frame is refetched once a minute so the time buckets keep rolling.
   Costs are the worker's estimate: provider-reported tokens x price.
   ============================================================ */
(function () {
  "use strict";

  var LANES = {
    demo:    { name: "Demo", where: "clincog.net · Gemini", priced: true },
    seminar: { name: "Seminar", where: "uvt.clincog.net · Anthropic", priced: true },
    admin:   { name: "Admin (you)", where: "admin.clincog.net · Gemini", priced: true },
    byok:    { name: "Own keys", where: "clincog.net · instructors' keys", priced: false },
  };
  var ORDER = ["seminar", "demo", "admin", "byok"];
  var CASES = [
    { id: "schizophrenia", name: "Dennis" }, { id: "depression", name: "Darren" },
    { id: "anxiety", name: "Alex" }, { id: "addiction", name: "Jordan" },
  ];

  var state = { range: "24h", data: null, quotas: null, lane: "seminar", sel: null };

  // ---------- formatting ----------
  function money(v) {
    if (v == null) return "-";
    if (v === 0) return "$0.00";
    if (v < 0.01) return "$" + v.toFixed(4);
    if (v < 1) return "$" + v.toFixed(3);
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(v) { return (v || 0).toLocaleString("en-US"); }
  function compact(v) {
    v = v || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
    if (v >= 1e4) return Math.round(v / 1e3) + "k";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
    return String(v);
  }
  function who(lane, pid) {
    if (lane === "admin") return "You";
    if (pid === "key test") return "Key test (console)";
    if (pid && pid.indexOf("v:") === 0) return "Visitor " + pid.slice(2, 6);
    return pid;
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function when(t, range, bucket) {
    var d = new Date(t);
    if (range === "since") range = bucket >= 86400e3 ? "30d" : bucket >= 3 * 3600e3 ? "7d" : bucket >= 3600e3 ? "day" : "1h";
    if (range === "30d") return d.getDate() + " " + MONTHS[d.getMonth()];
    if (range === "7d") return DAYS[d.getDay()] + " " + pad(d.getHours()) + ":00";
    if (range === "day") return d.getDate() + " " + MONTHS[d.getMonth()] + " " + pad(d.getHours()) + ":00";
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function clock(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function ago(t) {
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " d ago";
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function caseName(id) { for (var i = 0; i < CASES.length; i++) if (CASES[i].id === id) return CASES[i].name; return id || "-"; }

  // ---------- chart ----------
  // One series, one lane colour: area at low strength under a 2px line.
  // A crosshair snaps to the nearest bucket; arrow keys move it too.
  function chart(host, series, key, fmt, range, bucket) {
    host.textContent = "";
    host.classList.add("chart");
    var W = Math.max(240, host.clientWidth || 480), H = 128, padL = 4, padR = 4, padT = 18, padB = 22;
    var n = series.length;
    var max = 0;
    series.forEach(function (b) { if (b[key] > max) max = b[key]; });
    var top = max > 0 ? max * 1.15 : 1;
    var xw = (W - padL - padR) / Math.max(1, n - 1);
    function X(i) { return padL + i * xw; }
    function Y(v) { return padT + (H - padT - padB) * (1 - v / top); }
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("height", H);
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("role", "img");
    var total = series.reduce(function (a, b) { return a + (b[key] || 0); }, 0);
    svg.setAttribute("aria-label", "Over the selected range: " + fmt(total) + " in total, highest " + fmt(max) + " per interval.");
    function add(tag, attrs, cls) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (cls) e.setAttribute("class", cls);
      svg.appendChild(e);
      return e;
    }
    add("line", { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0) }, "grid");
    add("line", { x1: padL, x2: W - padR, y1: Y(max || 0), y2: Y(max || 0), "stroke-dasharray": "2 4" }, "grid");
    var peak = add("text", { x: W - padR, y: Y(max || 0) - 5, "text-anchor": "end" }, "axis");
    peak.textContent = max > 0 ? "peak " + fmt(max) : "no activity yet";
    var pts = series.map(function (b, i) { return X(i).toFixed(1) + "," + Y(b[key] || 0).toFixed(1); });
    if (n > 1) {
      add("path", { d: "M" + X(0) + "," + Y(0) + " L" + pts.join(" L") + " L" + X(n - 1) + "," + Y(0) + " Z" }, "area");
      add("path", { d: "M" + pts.join(" L") }, "line");
    }
    [0, Math.floor((n - 1) / 2), n - 1].forEach(function (i, k) {
      if (!series[i]) return;
      var t = add("text", { x: X(i), y: H - 5, "text-anchor": k === 0 ? "start" : k === 2 ? "end" : "middle" }, "axis");
      t.textContent = when(series[i].t, range, bucket);
    });
    var cross = add("line", { y1: padT - 6, y2: Y(0), visibility: "hidden" }, "cross");
    var dot = add("circle", { r: 4.5, visibility: "hidden" }, "dot");
    host.appendChild(svg);
    var tip = el("div", "tip"); tip.hidden = true; host.appendChild(tip);
    var at = -1;
    function show(i) {
      if (i < 0 || i >= n) return;
      at = i;
      var b = series[i], x = X(i), y = Y(b[key] || 0);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("visibility", "visible");
      tip.textContent = "";
      tip.appendChild(el("div", "when", when(b.t, range, bucket) + " – " + when(b.t + bucket, range, bucket)));
      tip.appendChild(el("strong", "", fmt(b[key] || 0)));
      tip.appendChild(el("div", "", num(b.req) + " replies · " + compact(b.tok) + " tokens"));
      tip.hidden = false;
      var scale = host.clientWidth / W;
      var left = x * scale + 12, tw = tip.offsetWidth;
      if (left + tw > host.clientWidth) left = x * scale - tw - 12;
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = "0px";
    }
    function hide() { at = -1; tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); }
    svg.addEventListener("pointermove", function (e) {
      var r = svg.getBoundingClientRect();
      var x = (e.clientX - r.left) * (W / r.width);
      show(Math.round((x - padL) / xw));
    });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        show(Math.min(n - 1, Math.max(0, (at < 0 ? n - 1 : at) + (e.key === "ArrowLeft" ? -1 : 1))));
      } else if (e.key === "Escape") hide();
    });
  }

  // ---------- lanes ----------
  function laneCard(key) {
    var L = state.data.lanes[key], meta = LANES[key];
    var card = document.getElementById("lane-" + key);
    if (!card) {
      card = el("article", "lane-card lane-" + key);
      card.id = "lane-" + key;
      document.getElementById("lanes").appendChild(card);
    }
    card.textContent = "";
    var top = el("div", "lane-top");
    var nm = el("div", "lane-name"); nm.appendChild(el("i")); nm.appendChild(el("span", "", meta.name));
    top.appendChild(nm); top.appendChild(el("span", "lane-where", meta.where));
    card.appendChild(top);

    var hero = el("div", "lane-hero");
    var free = (key === "demo" || key === "admin") && state.data.freeTierGemini;
    if (free) {
      // Free tier: nothing is billed. The paid-tier equivalent stays in the
      // note, the chart and the table, as a measure of how much is used.
      hero.appendChild(el("span", "big", "$0"));
      hero.appendChild(el("span", "unit", "free tier · " + money(L.cost) + " at paid-tier prices"));
    } else if (meta.priced) {
      hero.appendChild(el("span", "big", money(L.cost)));
      hero.appendChild(el("span", "unit", "estimated cost"));
    } else {
      hero.appendChild(el("span", "big", num(L.req)));
      hero.appendChild(el("span", "unit", "replies · billed to the instructors"));
    }
    hero.id = "hero-" + key;
    card.appendChild(hero);

    var note = [];
    if (free) note.push("Gemini free tier, no billing: the chart and table show what the same use would cost on the paid tier.");
    if (meta.priced && !L.priced) note.push("Some replies used a model with no price set.");
    if (L.fail) note.push(L.fail + (L.fail === 1 ? " reply" : " replies") + " failed (not counted in tokens).");
    card.appendChild(el("div", "lane-note", note.join(" ")));

    var stats = el("div", "lane-stats");
    [[num(L.req), "replies"], [compact(L.tin), "tokens in"], [compact(L.tout), "tokens out"], [num(L.participants), key === "seminar" ? "students" : key === "admin" ? "you" : "visitors"]]
      .forEach(function (s) { var d = el("div"); d.appendChild(el("b", "", s[0])); d.appendChild(el("span", "", s[1])); stats.appendChild(d); });
    card.appendChild(stats);

    var ch = el("div"); card.appendChild(ch);
    chart(ch, L.series, meta.priced ? "cost" : "req", meta.priced ? money : function (v) { return num(v) + " replies"; }, state.data.range, state.data.bucket);
  }
  function renderLanes() { ORDER.forEach(laneCard); }

  // ---------- participants ----------
  function studentQ(id) {
    if (!state.quotas || !state.quotas.students) return null;
    for (var i = 0; i < state.quotas.students.length; i++) if (state.quotas.students[i].id === id) return state.quotas.students[i];
    return null;
  }
  function quotaFor(id) { var s = studentQ(id); return s ? (s.used || {}) : null; }
  // A student's limit for one case: a number, or null for no limit.
  function limitFor(id, caseId) {
    var s = studentQ(id);
    if (s && s.limits && caseId in s.limits) return s.limits[caseId];
    if (state.quotas && state.quotas.limits && caseId in state.quotas.limits) return state.quotas.limits[caseId];
    return state.quotas ? state.quotas.limit : 20;
  }
  function limitText(v) { return v === null ? "no limit" : String(v); }
  function renderPeople() {
    var host = document.getElementById("people");
    host.className = "ptable-wrap lane-" + state.lane;
    host.textContent = "";
    var L = state.data.lanes[state.lane], meta = LANES[state.lane];
    var rows = L.people.slice();
    // The seminar table lists the whole class, including who has not started.
    if (state.lane === "seminar" && state.quotas && state.quotas.students) {
      var seen = {};
      rows.forEach(function (r) { seen[r.pid] = 1; });
      state.quotas.students.forEach(function (s) { if (!seen[s.id]) rows.push({ pid: s.id, req: 0, tin: 0, tout: 0, cost: 0, last: 0 }); });
    }
    var sub = document.getElementById("people-sub");
    if (state.lane === "seminar" && state.quotas && !state.quotas.configured) sub.textContent = "No class list yet: set the STUDENT_IDS secret to open the seminar chat.";
    else if (state.lane === "seminar" && state.quotas) sub.textContent = "The whole class, " + state.quotas.students.length + " students, period " + state.quotas.period + ". Limits are set on the Students page. Select a row for their chart and to reset a quota.";
    else sub.textContent = "Who has used how much in the selected range. Select a row for their own chart.";
    if (!rows.length) { host.appendChild(el("div", "empty", "Nobody yet in this range.")); return; }
    var maxv = 0;
    rows.forEach(function (r) { var v = meta.priced ? r.cost : r.req; if (v > maxv) maxv = v; });
    var t = el("table", "ptable"), th = el("thead"), hr = el("tr");
    var cols = [["Participant", ""], ["Replies", "num"], ["Tokens", "num"], [meta.priced ? "Cost" : "", "num"], ["Share", "share"]];
    if (state.lane === "seminar") cols.push(["Quota used (Dennis · Darren · Alex · Jordan)", ""]);
    cols.push(["Last active", ""]);
    cols.forEach(function (c) { hr.appendChild(el("th", c[1], c[0])); });
    th.appendChild(hr); t.appendChild(th);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.tabIndex = 0;
      if (state.sel && state.sel.pid === r.pid && state.sel.lane === state.lane) tr.className = "sel";
      tr.appendChild(el("td", "who", who(state.lane, r.pid)));
      tr.appendChild(el("td", "num", num(r.req)));
      tr.appendChild(el("td", "num", compact(r.tin + r.tout)));
      tr.appendChild(el("td", "num", meta.priced ? money(r.cost) : ""));
      var sh = el("td", "share"), bar = el("div", "sharebar"), fill = el("i");
      var v = meta.priced ? r.cost : r.req;
      fill.style.width = (maxv ? Math.max(v > 0 ? 3 : 0, (v / maxv) * 100) : 0) + "%";
      bar.appendChild(fill); sh.appendChild(bar); tr.appendChild(sh);
      if (state.lane === "seminar") {
        var q = quotaFor(r.pid) || {}, qc = el("td"), box = el("span", "qcell");
        CASES.forEach(function (c) {
          var used = q[c.id] || 0, lim = limitFor(r.pid, c.id);
          var s = el("span", lim !== null && used >= lim ? "full" : "", String(used));
          s.title = c.name + ": " + used + " of " + limitText(lim);
          box.appendChild(s);
        });
        qc.appendChild(box); tr.appendChild(qc);
      }
      tr.appendChild(el("td", "", r.last ? ago(r.last) : "not yet"));
      function pick() { openDetail(state.lane, r.pid); }
      tr.addEventListener("click", pick);
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      tb.appendChild(tr);
    });
    t.appendChild(tb); host.appendChild(t);
  }

  // ---------- participant detail ----------
  function openDetail(lane, pid) {
    state.sel = { lane: lane, pid: pid };
    renderPeople();
    loadDetail();
  }
  function loadDetail() {
    var sel = state.sel;
    if (!sel) return;
    fetch("/api/monitor/participant?lane=" + encodeURIComponent(sel.lane) + "&pid=" + encodeURIComponent(sel.pid) + "&range=" + state.range, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (state.sel === sel) renderDetail(d); })
      .catch(function () {});
  }
  function renderDetail(d) {
    var box = document.getElementById("detail");
    box.hidden = false;
    box.className = "detail lane-" + d.lane;
    box.textContent = "";
    var meta = LANES[d.lane];
    var tot = d.series.reduce(function (a, b) { return { req: a.req + b.req, tok: a.tok + b.tok, cost: a.cost + b.cost }; }, { req: 0, tok: 0, cost: 0 });
    var top = el("div", "detail-top"), left = el("div");
    left.appendChild(el("h3", "", who(d.lane, d.pid)));
    left.appendChild(el("p", "", meta.name + " · " + num(tot.req) + " replies · " + compact(tot.tok) + " tokens" + (meta.priced ? " · " + money(tot.cost) : "")));
    top.appendChild(left);
    var close = el("button", "btn-ghost", "Close");
    close.type = "button";
    close.addEventListener("click", function () { state.sel = null; box.hidden = true; renderPeople(); });
    top.appendChild(close);
    box.appendChild(top);
    var ch = el("div"); box.appendChild(ch);
    chart(ch, d.series, meta.priced ? "cost" : "req", meta.priced ? money : function (v) { return num(v) + " replies"; }, state.range, d.bucket);

    var q = d.lane === "seminar" ? (quotaFor(d.pid) || {}) : null;
    var cases = el("div", "cases");
    CASES.forEach(function (c) {
      var bc = null;
      d.byCase.forEach(function (x) { if (x.caseId === c.id) bc = x; });
      var card = el("div", "case");
      card.appendChild(el("b", "", c.name));
      card.appendChild(el("small", "", bc ? num(bc.req) + " replies · " + compact((bc.tin || 0) + (bc.tout || 0)) + " tokens" : "no replies in range"));
      if (meta.priced) card.appendChild(el("small", "", bc ? money(bc.cost) : ""));
      if (q) {
        card.appendChild(el("small", "", "Quota: " + (q[c.id] || 0) + " of " + limitText(limitFor(d.pid, c.id))));
        var b = el("button", "btn-ghost", "Reset");
        b.type = "button";
        b.disabled = !(q[c.id] > 0);
        b.addEventListener("click", function () { resetQuota(d.pid, c.id, c.name); });
        card.appendChild(b);
      }
      cases.appendChild(card);
    });
    box.appendChild(cases);
    if (q) {
      var all = el("button", "btn-ghost", "Reset all four cases");
      all.type = "button";
      all.style.marginTop = "14px";
      all.addEventListener("click", function () { resetQuota(d.pid, null, "all four cases"); });
      box.appendChild(all);
    }
  }
  function resetQuota(id, caseId, label) {
    if (!confirm("Reset " + id + "'s quota for " + label + "? They get their exchanges back.")) return;
    fetch("/api/monitor/quota-reset?student=" + encodeURIComponent(id) + (caseId ? "&case=" + caseId : ""), {
      method: "POST", headers: { "X-ClinCog-Admin": "1" },
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (state.quotas) state.quotas.students.forEach(function (s) { if (s.id === res.id) s.used = res.used; });
      renderPeople(); loadDetail();
    }).catch(function () { alert("The reset did not go through. Try again."); });
  }

  // ---------- billed by Anthropic ----------
  // Two series on one axis, both in dollars: what Anthropic billed per day
  // (solid, lane colour) and this console's estimate (dashed, grey). A
  // crosshair shows both for the day under the pointer.
  function billChart(host, days) {
    host.textContent = "";
    host.classList.add("chart");
    var W = Math.max(260, host.clientWidth || 600), H = 150, padL = 4, padR = 4, padT = 18, padB = 22, n = days.length;
    var max = 0;
    days.forEach(function (d) { max = Math.max(max, d.billed, d.estimate); });
    var top = max > 0 ? max * 1.15 : 1, xw = (W - padL - padR) / Math.max(1, n - 1);
    function X(i) { return padL + i * xw; }
    function Y(v) { return padT + (H - padT - padB) * (1 - v / top); }
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("height", H); svg.setAttribute("tabindex", "0"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Billed " + money(days.reduce(function (a, d) { return a + d.billed; }, 0)) + ", estimated " + money(days.reduce(function (a, d) { return a + d.estimate; }, 0)) + " over " + n + " days.");
    function add(tag, attrs, cls) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (cls) e.setAttribute("class", cls); svg.appendChild(e); return e; }
    add("line", { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0) }, "grid");
    var pk = add("text", { x: W - padR, y: Y(max) - 5, "text-anchor": "end" }, "axis"); pk.textContent = max > 0 ? "peak " + money(max) : "nothing billed yet";
    function path(key) { return "M" + days.map(function (d, i) { return X(i).toFixed(1) + "," + Y(d[key]).toFixed(1); }).join(" L"); }
    add("path", { d: "M" + X(0) + "," + Y(0) + " L" + days.map(function (d, i) { return X(i).toFixed(1) + "," + Y(d.billed).toFixed(1); }).join(" L") + " L" + X(n - 1) + "," + Y(0) + " Z" }, "area");
    add("path", { d: path("billed") }, "line");
    add("path", { d: path("estimate") }, "line est");
    (n >= 5 ? [0, Math.floor((n - 1) / 2), n - 1] : n > 1 ? [0, n - 1] : [0]).forEach(function (i, k, all) {
      var t = add("text", { x: X(i), y: H - 5, "text-anchor": k === 0 ? "start" : k === all.length - 1 ? "end" : "middle" }, "axis");
      var dd = new Date(days[i].date + "T00:00:00Z"); t.textContent = dd.getUTCDate() + " " + MONTHS[dd.getUTCMonth()];
    });
    var cross = add("line", { y1: padT - 6, y2: Y(0), visibility: "hidden" }, "cross");
    var dot = add("circle", { r: 4.5, visibility: "hidden" }, "dot");
    host.appendChild(svg);
    var tip = el("div", "tip"); tip.hidden = true; host.appendChild(tip);
    var at = -1;
    function show(i) {
      if (i < 0 || i >= n) return; at = i;
      var d = days[i], x = X(i);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x); dot.setAttribute("cy", Y(d.billed)); dot.setAttribute("visibility", "visible");
      tip.textContent = "";
      var dd = new Date(d.date + "T00:00:00Z");
      tip.appendChild(el("div", "when", dd.getUTCDate() + " " + MONTHS[dd.getUTCMonth()] + " (UTC)"));
      tip.appendChild(el("strong", "", money(d.billed) + " billed"));
      tip.appendChild(el("div", "", money(d.estimate) + " estimated"));
      tip.hidden = false;
      var scale = host.clientWidth / W, left = x * scale + 12;
      if (left + tip.offsetWidth > host.clientWidth) left = x * scale - tip.offsetWidth - 12;
      tip.style.left = Math.max(0, left) + "px"; tip.style.top = "0px";
    }
    function hide() { at = -1; tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); }
    svg.addEventListener("pointermove", function (e) { var r = svg.getBoundingClientRect(); show(Math.round(((e.clientX - r.left) * (W / r.width) - padL) / xw)); });
    svg.addEventListener("pointerleave", hide); svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); show(Math.min(n - 1, Math.max(0, (at < 0 ? n - 1 : at) + (e.key === "ArrowLeft" ? -1 : 1)))); }
      else if (e.key === "Escape") hide();
    });
  }
  var billing = null;
  function dayLabel(iso) { var d = new Date(iso + "T00:00:00Z"); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function utcDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
  // The billed period: a preset or two days chosen here. Remembered in this
  // browser only; the same days are used for the bill and the estimate.
  var BILL_KEY = "clincog_admin_billing_period";
  var billPeriod = { preset: "30d" };
  try { var saved = JSON.parse(localStorage.getItem(BILL_KEY) || "null"); if (saved && saved.preset) billPeriod = saved; } catch (e) {}
  function periodDays() {
    var today = utcDay(Date.now()), DAY = 86400e3;
    switch (billPeriod.preset) {
      case "month": return { from: today.slice(0, 8) + "01", to: today };
      case "7d": return { from: utcDay(Date.now() - 6 * DAY), to: today };
      case "since": return { from: state.data && state.data.counterFrom ? utcDay(state.data.counterFrom) : (billing && billing.monitoringSince ? utcDay(billing.monitoringSince) : utcDay(Date.now() - 29 * DAY)), to: today };
      case "custom": return { from: billPeriod.from || utcDay(Date.now() - 29 * DAY), to: billPeriod.to || today };
      default: return { from: utcDay(Date.now() - 29 * DAY), to: today };
    }
  }
  function setPeriod(p) {
    billPeriod = p;
    try { localStorage.setItem(BILL_KEY, JSON.stringify(p)); } catch (e) {}
    loadBilling();
  }
  function periodControls() {
    var row = el("div", "bill-from");
    var seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Billed period");
    [["month", "This month"], ["7d", "7 days"], ["30d", "30 days"], ["since", "Since restart"], ["custom", "Custom"]].forEach(function (x) {
      var b = el("button", "", x[1]); b.type = "button"; b.setAttribute("aria-pressed", String(billPeriod.preset === x[0]));
      b.addEventListener("click", function () {
        if (x[0] === "custom") { billPeriod = { preset: "custom", from: billing.from, to: billing.to }; renderBilling(); return; }
        setPeriod({ preset: x[0] });
      });
      seg.appendChild(b);
    });
    row.appendChild(seg);
    // On a narrow screen the choice row scrolls; keep the chosen one in view.
    setTimeout(function () { var on = seg.querySelector('[aria-pressed="true"]'); if (on && seg.scrollWidth > seg.clientWidth) seg.scrollLeft = on.offsetLeft - 8; }, 0);
    if (billPeriod.preset === "custom") {
      var f = el("input", "bill-date"), t = el("input", "bill-date");
      f.type = t.type = "date"; f.value = billPeriod.from || billing.from; t.value = billPeriod.to || billing.to;
      f.setAttribute("aria-label", "From (UTC day)"); t.setAttribute("aria-label", "To (UTC day)");
      var go = el("button", "btn-ghost", "Show"); go.type = "button";
      go.addEventListener("click", function () { if (f.value && t.value) setPeriod({ preset: "custom", from: f.value, to: t.value }); });
      row.appendChild(f); row.appendChild(el("span", "dash", "to")); row.appendChild(t); row.appendChild(go);
    }
    return row;
  }
  function renderBilling() {
    var sec = document.getElementById("billing"), body = document.getElementById("billing-body");
    if (!billing || !billing.configured) { sec.hidden = true; return; }
    sec.hidden = false; body.textContent = "";
    body.appendChild(periodControls());
    if (billing.error) { body.appendChild(el("p", "bill-err", billing.error)); return; }
    var scope = billing.workspaceName ? "workspace " + billing.workspaceName : "whole organization";
    var span = billing.from === billing.to ? dayLabel(billing.from) : dayLabel(billing.from) + " - " + dayLabel(billing.to);
    document.getElementById("billing-sub").textContent = "What Anthropic charged (" + scope + ") and what this console estimated for the seminar, over the same UTC days: " + span + ".";
    var diff = billing.billed - billing.estimate;
    // A percentage of a few cents says nothing; below a dollar the gap is in dollars.
    var diffText = billing.estimate >= 1 ? (diff >= 0 ? "+" : "") + (diff / billing.estimate * 100).toFixed(0) + "%" : (diff >= 0 ? "+" : "-") + money(Math.abs(diff));
    var tiles = el("div", "bill-tiles");
    [[money(billing.billed), "billed by Anthropic"], [money(billing.estimate), "estimated here (seminar)"],
     [diffText, billing.estimate >= 1 ? "billed vs estimate" : "billed minus estimate"]].forEach(function (t) {
      var d = el("div"); d.appendChild(el("b", "", t[0])); d.appendChild(el("span", "", t[1])); tiles.appendChild(d);
    });
    body.appendChild(tiles);
    if (billing.days.length >= 2) {
      var lg = el("div", "legend"), a = el("span"), b = el("span");
      a.appendChild(el("i")); a.appendChild(document.createTextNode("Billed")); b.appendChild(el("i", "est")); b.appendChild(document.createTextNode("Estimated here"));
      lg.appendChild(a); lg.appendChild(b); body.appendChild(lg);
      var ch = el("div"); body.appendChild(ch); billChart(ch, billing.days);
    }
    // Why the two can differ in this period.
    var ms = billing.monitoringSince, msDay = ms ? utcDay(ms) : null;
    if (!ms) body.appendChild(el("p", "bill-note", "No seminar reply has been recorded here yet, so there is no estimate to set against the bill."));
    else if (billing.from < msDay || (billing.from === msDay && ms % 86400e3 > 3600e3)) {
      var pre = billing.days.filter(function (d) { return d.date < msDay; }).reduce(function (x, d) { return x + d.billed; }, 0);
      body.appendChild(el("p", "bill-note", "This period starts before this console began recording (" + fmtWhen(ms) + "), so the bill includes use it never saw" + (pre > 0 ? " (" + money(pre) + " before " + dayLabel(msDay) + ")" : "") + ". Choose a later start for the two to match."));
    }
    body.appendChild(el("p", "bill-note", "Days are UTC, as Anthropic bills them; the estimate uses the same days. Anthropic adds costs within minutes; this is refreshed every 10 minutes. A difference in a period this console watched means use outside the seminar, or a price here out of date."));
  }
  function fmtWhen(ms) { var d = new Date(ms); return d.getDate() + " " + MONTHS[d.getMonth()] + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function loadBilling() {
    var p = periodDays();
    return fetch("/api/monitor/billing?from=" + p.from + "&to=" + p.to, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (b) { billing = b; renderBilling(); })
      .catch(function () {});
  }

  // ---------- now: the strip at the top ----------
  var overview = null;
  function post(op, args, okText) {
    return fetch("/api/monitor/seminar", { method: "POST", headers: { "Content-Type": "application/json", "X-ClinCog-Admin": "1" }, body: JSON.stringify({ op: op, args: args || {} }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (window.ClinCogToast) window.ClinCogToast.show(j.ok ? { title: okText } : { title: "Not changed", detail: j.error || "" });
        return loadOverview();
      });
  }
  function fmtShort(ms) { var d = new Date(ms); return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function nowCard(label, on, big, sub, extra, acts) {
    var c = el("div", "now-card");
    c.appendChild(el("small", "", label));
    var b = el("b"); b.appendChild(el("i", on ? "on" : "")); b.appendChild(document.createTextNode(big)); c.appendChild(b);
    c.appendChild(el("span", "", sub));
    if (extra) c.appendChild(extra);
    var a = el("div", "acts");
    acts.forEach(function (x) {
      var n = x.href ? el("a", "btn-ghost", x.label) : el("button", "btn-ghost", x.label);
      if (x.href) n.href = x.href; else { n.type = "button"; n.addEventListener("click", function () { if (!x.confirm || confirm(x.confirm)) x.run(); }); }
      a.appendChild(n);
    });
    c.appendChild(a);
    return c;
  }
  function bar(v, max, warnAt) {
    var b = el("div", "bar" + (v >= warnAt ? " warn" : "")), i = el("i"); i.style.width = Math.min(100, max ? v / max * 100 : 0) + "%"; b.appendChild(i); return b;
  }
  function renderOverview() {
    var host = document.getElementById("now"), o = overview;
    if (!o) return;
    host.textContent = "";
    var iv = o.interviews;
    var closedCases = CASES.filter(function (c) { return o.cases[c.id] && o.cases[c.id].open === false; }).map(function (c) { return c.name; });
    host.appendChild(nowCard("Seminar interviews", iv.open, iv.open ? "Open" : "Closed",
      iv.open ? (iv.period || "") + " \u00b7 " + o.provider + (closedCases.length ? " \u00b7 not yet: " + closedCases.join(", ") : "") : iv.text,
      null, iv.blocked ? [{ label: "Reopen past the budget", confirm: "Reopen the interviews for the rest of this month? Spending continues past the budget.", run: function () { post("reopenBudget", {}, "Interviews reopened"); } }, { label: "Budget", href: "/admin/provider#sec-budget" }]
        : [{ label: iv.closedByYou ? "Open the interviews" : "Close the interviews", confirm: iv.closedByYou ? null : "Close the interviews for every student now?", run: function () { post("general", { open: iv.closedByYou }, iv.closedByYou ? "Interviews open" : "Interviews closed"); } },
           { label: "Course", href: "/admin/course" }]));
    var d = o.demo;
    host.appendChild(nowCard("Public demo", d.open, !d.enabled ? "Off" : d.open ? "On" : "Paused",
      !d.enabled ? "Switched off" : !d.open ? "Until " + fmtShort(d.pausedUntil) : d.today + (d.dailyCap ? " of " + d.dailyCap : "") + " replies today",
      d.dailyCap && d.enabled && d.open ? bar(d.today, d.dailyCap, d.dailyCap * 0.8) : null,
      [!d.enabled ? { label: "Switch on", run: function () { post("demo", { enabled: true }, "Demo on"); } }
        : !d.open ? { label: "Resume now", run: function () { post("demo", { pausedUntil: null }, "Demo resumed"); } }
        : { label: "Switch off", confirm: "Switch the public demo off? Visitors with their own key are not affected.", run: function () { post("demo", { enabled: false }, "Demo off"); } },
       { label: "Demo", href: "/admin/demo" }]));
    var b = o.budget, spent = b.spent || 0;
    host.appendChild(nowCard("Seminar spend this month", !iv.blocked, money(spent),
      b.monthly ? "of " + money(b.monthly) + " (" + Math.round(spent / b.monthly * 100) + "%)" : "No monthly budget set",
      b.monthly ? bar(spent, b.monthly, b.monthly * b.alertPct / 100) : null, [{ label: "Budget and alerts", href: "/admin/provider#sec-budget" }]));
    host.appendChild(nowCard("Announcements", o.announcements > 0, String(o.announcements), o.announcements === 1 ? "showing to students now" : "showing to students now",
      null, [{ label: o.announcements ? "Manage" : "Write one", href: "/admin/course#sec-announce" }]));
  }
  function loadOverview() {
    return fetch("/api/monitor/overview", { cache: "no-store" }).then(function (r) { return r.json(); })
      .then(function (o) { overview = o; renderOverview(); }).catch(function () {});
  }

  // ---------- health ----------
  var health = null;
  function secs(ms) { return ms == null ? "-" : (ms / 1000).toFixed(1) + " s"; }
  function renderHealth() {
    var box = document.getElementById("health");
    if (!health) return;
    box.textContent = "";
    // The verdict: any lane with at least 3 replies and a fifth of them failing.
    var bad = ORDER.filter(function (k) { var L = health.lanes[k]; return L && L.req >= 3 && L.fail / L.req >= 0.2; });
    var b = health.budget || {};
    var v = el("div", "health-verdict" + (bad.length || b.blocked ? "" : " ok"));
    v.appendChild(el("i"));
    v.appendChild(el("span", "", b.blocked ? "Seminar closed: the monthly budget ran out"
      : bad.length ? bad.map(function (k) { return LANES[k].name; }).join(", ") + ": replies are failing" : "Working normally"));
    v.appendChild(el("small", "", "Checked " + clock(health.now)));
    box.appendChild(v);

    var grid = el("div", "hlanes");
    ORDER.forEach(function (k) {
      var L = health.lanes[k] || { req: 0, fail: 0 };
      var c = el("div", "hlane lane-" + k), nm = el("div", "nm");
      nm.appendChild(el("i")); nm.appendChild(el("span", "", LANES[k].name)); c.appendChild(nm);
      var dl = el("dl");
      var rate = L.req ? Math.round(L.fail / L.req * 100) : null;
      [["Replies", num(L.req), ""], ["Failed", L.req ? L.fail + " (" + rate + "%)" : "-", rate >= 20 && L.req >= 3 ? "bad" : ""],
       ["Typical", secs(L.p50), ""], ["Slowest 10%", secs(L.p90), L.p90 > 30000 ? "bad" : ""]].forEach(function (r) {
        dl.appendChild(el("dt", "", r[0])); dl.appendChild(el("dd", r[2], r[1]));
      });
      c.appendChild(dl); grid.appendChild(c);
    });
    box.appendChild(grid);

    var month = (health.lanes.seminar || {}).month || 0;
    var hb = el("div", "hbudget");
    if (b.monthly) {
      var pct = month / b.monthly * 100;
      hb.appendChild(el("span", "", "Seminar this month: " + money(month) + " of the " + money(b.monthly) + " budget (" + Math.round(pct) + "%)" +
        (b.blocked ? " - interviews closed." : (b.state && b.state.reopened && pct >= 100) ? " - reopened by you past the budget." : b.autoClose ? " - closes at 100%." : " - stays open past it.")));
      var bar = el("div", "bar" + (pct >= b.alertPct ? " warn" : "")), i = el("i"); i.style.width = Math.min(100, pct) + "%";
      bar.appendChild(i); hb.appendChild(bar);
    } else {
      hb.appendChild(el("span", "", "Seminar this month: " + money(month) + ". No monthly budget is set (AI provider > Budget and alerts)."));
    }
    box.appendChild(hb);

    var errs = el("div", "herrors");
    errs.appendChild(el("h3", "", "Recent failures"));
    if (!health.errors.length) errs.appendChild(el("div", "empty", "None in the last 90 days."));
    health.errors.forEach(function (e) {
      var r = el("div", "herr lane-" + e.lane);
      r.appendChild(el("span", "t", ago(e.ts)));
      var l = el("span", "l"); l.appendChild(el("i")); l.appendChild(el("span", "", LANES[e.lane] ? LANES[e.lane].name : e.lane)); r.appendChild(l);
      var why = el("span", "r", e.err || "No reason recorded");
      why.appendChild(el("small", "", who(e.lane, e.participant) + " · " + caseName(e.caseId) + (e.model ? " · " + e.model : "")));
      r.appendChild(why);
      errs.appendChild(r);
    });
    box.appendChild(errs);
  }
  function loadHealth() {
    return fetch("/api/monitor/health", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (h) { health = h; renderHealth(); })
      .catch(function () {});
  }


  // ---------- feed ----------
  function feedRow(e) {
    var row = el("div", "feed-row lane-" + e.lane + (e.ok ? "" : " fail"));
    row.appendChild(el("span", "t", clock(e.ts)));
    var l = el("span", "l"); l.appendChild(el("i")); l.appendChild(el("span", "", LANES[e.lane] ? LANES[e.lane].name : e.lane)); row.appendChild(l);
    var p = el("span", "p", who(e.lane, e.participant)); p.appendChild(el("small", "", caseName(e.caseId) + " · " + (e.model || ""))); row.appendChild(p);
    var tok = el("span", "n tok", e.ok ? compact(e.tin) + " / " + compact(e.tout) + " tok" : "failed");
    if (!e.ok && e.err) tok.title = e.err;
    row.appendChild(tok);
    row.appendChild(el("span", "n", (e.ms / 1000).toFixed(1) + " s"));
    row.appendChild(el("span", "c", e.lane === "byok" ? "-" : money(e.cost)));
    return row;
  }
  function renderFeed() {
    var f = document.getElementById("feed");
    f.textContent = "";
    if (!state.data.feed.length) { f.appendChild(el("div", "empty", "No replies yet. They will appear here as they happen.")); return; }
    state.data.feed.slice(0, 20).forEach(function (e) { f.appendChild(feedRow(e)); });
  }

  // ---------- usage records: counts and deleting ----------
  function loadRecords() {
    return fetch("/api/monitor/records", { cache: "no-store" }).then(function (r) { return r.json(); }).then(renderRecords).catch(function () {});
  }
  function renderRecords(d) {
    var host = document.getElementById("records"); host.textContent = "";
    ORDER.forEach(function (k) {
      var c = d.lanes[k] || { n: 0 }, card = el("div", "rec lane-" + k), nm = el("div", "nm");
      nm.appendChild(el("i")); nm.appendChild(el("span", "", LANES[k].name)); card.appendChild(nm);
      card.appendChild(el("b", "", num(c.n)));
      card.appendChild(el("span", "", c.n ? "records since " + fmtWhen(c.first) : "no records"));
      var b = el("button", "btn-ghost danger", "Delete"); b.type = "button"; b.disabled = !c.n;
      b.addEventListener("click", function () { purge([k], LANES[k].name); });
      card.appendChild(b);
      host.appendChild(card);
    });
  }
  function beforeValue() {
    var v = document.getElementById("rec-before").value;
    return v ? new Date(v + "T00:00:00").getTime() : null;
  }
  function purge(lanes, label) {
    var before = beforeValue();
    var what = (label || "all") + " usage records" + (before ? " from before " + document.getElementById("rec-before").value : "");
    if (lanes.length === ORDER.length && !before) {
      var typed = prompt("Delete every usage record, in every lane? The estimates, charts, health and this month's spend start again from zero. This cannot be undone.\n\nType DELETE to confirm.");
      if (typed !== "DELETE") return;
    } else if (!confirm("Delete " + what + "? This cannot be undone.")) return;
    fetch("/api/monitor/purge", { method: "POST", headers: { "Content-Type": "application/json", "X-ClinCog-Admin": "1" }, body: JSON.stringify({ lanes: lanes, before: before }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (window.ClinCogToast) window.ClinCogToast.show(j.ok ? { title: "Deleted " + num(j.deleted) + " record" + (j.deleted === 1 ? "" : "s") } : { title: "Not deleted", detail: j.error || "" });
        refreshAll();
      });
  }
  function refreshAll() { return Promise.all([load(), loadRecords(), loadHealth(), loadOverview()]).then(loadBilling); }
  document.getElementById("rec-all").addEventListener("click", function () { purge(ORDER.slice(), "all"); });

  // ---------- live events ----------
  var healthT = null;
  function apply(e) {
    // A failure should show in Health straight away, not at the next minute.
    if (!e.ok) { clearTimeout(healthT); healthT = setTimeout(loadHealth, 800); }
    var d = state.data;
    if (!d) return;
    var L = d.lanes[e.lane];
    if (!L) return;
    // roll the buckets forward if the event is past the last one
    var idx = Math.floor((e.ts - d.from) / d.bucket);
    // "Since restart" keeps growing from its start; the other ranges roll.
    while (idx >= L.series.length) {
      ORDER.forEach(function (k) {
        var s = d.lanes[k].series, last = s[s.length - 1];
        s.push({ t: last.t + d.bucket, req: 0, tok: 0, cost: 0 });
        if (d.range !== "since") s.shift();
      });
      if (d.range !== "since") d.from += d.bucket;
      idx = Math.floor((e.ts - d.from) / d.bucket);
    }
    var b = L.series[idx];
    L.req++;
    if (!e.ok) L.fail++;
    L.tin += e.tin; L.tout += e.tout; L.cost += e.cost || 0;
    if (b) { b.req++; b.tok += e.tin + e.tout; b.cost += e.cost || 0; }
    var person = null;
    L.people.forEach(function (p) { if (p.pid === e.participant) person = p; });
    if (!person) { person = { pid: e.participant, req: 0, tin: 0, tout: 0, cost: 0, last: 0 }; L.people.push(person); L.participants++; }
    person.req++; person.tin += e.tin; person.tout += e.tout; person.cost += e.cost || 0; person.last = e.ts;
    L.people.sort(function (a, b2) { return (b2.cost - a.cost) || (b2.req - a.req); });
    if (e.lane === "seminar" && e.ok && state.quotas) {
      state.quotas.students.forEach(function (s) { if (s.id === e.participant) { s.used = s.used || {}; s.used[e.caseId] = (s.used[e.caseId] || 0) + 1; } });
    }
    d.feed.unshift(e);
    if (d.feed.length > 40) d.feed.pop();

    laneCard(e.lane);
    var hero = document.getElementById("hero-" + e.lane);
    if (hero) { hero.classList.remove("flash"); void hero.offsetWidth; hero.classList.add("flash"); }
    if (state.lane === e.lane) renderPeople();
    renderFeed();
    var first = document.querySelector("#feed .feed-row");
    if (first) first.classList.add("flash");
    if (state.sel && state.sel.lane === e.lane && state.sel.pid === e.participant) loadDetail();
  }

  var ws = null, retry = 1000, pingTimer = null;
  function setLive(on, text) {
    document.getElementById("live-pill").classList.toggle("on", on);
    document.getElementById("live-text").textContent = text;
  }
  function connect() {
    try {
      ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/monitor/live");
    } catch (e) { setLive(false, "Live updates unavailable"); return; }
    ws.onopen = function () {
      retry = 1000;
      setLive(true, "Live");
      clearInterval(pingTimer);
      pingTimer = setInterval(function () { try { ws.send("ping"); } catch (e) {} }, 25000);
    };
    ws.onmessage = function (m) {
      if (m.data === "pong") return;
      try {
        var msg = JSON.parse(m.data);
        if (msg.type === "event") apply(msg.event);
        else if (msg.type === "reset") refreshAll(); // records deleted, here or in another window
      } catch (e) {}
    };
    ws.onclose = function () {
      clearInterval(pingTimer);
      setLive(false, "Reconnecting…");
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 30000);
    };
  }

  // ---------- loading ----------
  function load() {
    var cards = document.querySelectorAll(".lane-card");
    cards.forEach(function (c) { c.classList.add("stale"); });
    return Promise.all([
      fetch("/api/monitor/summary?range=" + state.range, { cache: "no-store" }).then(function (r) { return r.json(); }),
      fetch("/api/monitor/quotas", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return null; }),
    ]).then(function (res) {
      state.data = res[0];
      renderSince();
      LANES.seminar.where = "uvt.clincog.net · " + (res[0].seminarProvider || "Anthropic");
      state.quotas = res[1];
      renderLanes(); renderPeople(); renderFeed();
      document.querySelectorAll(".lane-card").forEach(function (c) { c.classList.remove("stale"); });
      if (state.sel) loadDetail();
    }).catch(function () {
      cards.forEach(function (c) { c.classList.remove("stale"); });
      setLive(false, "Could not load the data");
    });
  }

  function segment(id, attr, onPick) {
    var g = document.getElementById(id);
    g.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      g.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      onPick(b.getAttribute(attr));
    });
    g.querySelectorAll("button").forEach(function (x) { if (!x.hasAttribute("aria-pressed")) x.setAttribute("aria-pressed", "false"); });
  }
  segment("range", "data-range", function (v) { state.range = v; load(); });
  // The estimate counter: "Since restart" counts from the last restart (or
  // the oldest record kept). Restarting deletes nothing.
  function renderSince() {
    var box = document.getElementById("since-box"), d = state.data;
    box.hidden = state.range !== "since";
    if (box.hidden || !d) return;
    document.getElementById("since-text").textContent = d.counterFrom ? "since " + fmtWhen(d.counterFrom) : "since the first record" + (d.since ? ", " + fmtWhen(d.since) : "");
  }
  document.getElementById("since-restart").addEventListener("click", function () {
    if (!confirm("Start the estimate counter from zero now? Nothing is deleted: the other ranges, the bill comparison and the monthly budget stay as they are.")) return;
    fetch("/api/monitor/seminar", { method: "POST", headers: { "Content-Type": "application/json", "X-ClinCog-Admin": "1" }, body: JSON.stringify({ op: "restartCounter", args: {} }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (window.ClinCogToast) window.ClinCogToast.show(j.ok ? { title: "Counter restarted" } : { title: "Not restarted", detail: j.error || "" });
        return load().then(function () { if (billPeriod.preset === "since") loadBilling(); });
      });
  });
  segment("people-lane", "data-lane", function (v) { state.lane = v; renderPeople(); });

  var resizeT = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (state.data) { renderLanes(); renderBilling(); if (state.sel) loadDetail(); } }, 150);
  });
  // Charts use theme colours through CSS, so a theme switch needs nothing.

  var firstLoad = load();
  firstLoad.then(connect);
  setInterval(load, 60000);
  firstLoad.then(loadBilling);
  loadRecords();
  setInterval(loadRecords, 60000);
  setInterval(loadBilling, 600000);
  loadHealth();
  setInterval(loadHealth, 60000);
  loadOverview();
  setInterval(loadOverview, 60000);
  if (typeof ClinIcons !== "undefined") document.getElementById("export-ico").innerHTML = ClinIcons.get("download", 15);
})();
