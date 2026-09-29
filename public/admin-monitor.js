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
    if (pid && pid.indexOf("v:") === 0) return "Visitor " + pid.slice(2, 6);
    return pid;
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function when(t, range) {
    var d = new Date(t);
    if (range === "30d") return d.getDate() + " " + MONTHS[d.getMonth()];
    if (range === "7d") return DAYS[d.getDay()] + " " + pad(d.getHours()) + ":00";
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
      t.textContent = when(series[i].t, range);
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
      tip.appendChild(el("div", "when", when(b.t, range) + " – " + when(b.t + bucket, range)));
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
    else if (state.lane === "seminar" && state.quotas) sub.textContent = "The whole class, " + state.quotas.students.length + " students, period " + state.quotas.period + ". Limits are set on the Seminar settings page. Select a row for their chart and to reset a quota.";
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

  // ---------- feed ----------
  function feedRow(e) {
    var row = el("div", "feed-row lane-" + e.lane + (e.ok ? "" : " fail"));
    row.appendChild(el("span", "t", clock(e.ts)));
    var l = el("span", "l"); l.appendChild(el("i")); l.appendChild(el("span", "", LANES[e.lane] ? LANES[e.lane].name : e.lane)); row.appendChild(l);
    var p = el("span", "p", who(e.lane, e.participant)); p.appendChild(el("small", "", caseName(e.caseId) + " · " + (e.model || ""))); row.appendChild(p);
    row.appendChild(el("span", "n tok", e.ok ? compact(e.tin) + " / " + compact(e.tout) + " tok" : "failed"));
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

  // ---------- live events ----------
  function apply(e) {
    var d = state.data;
    if (!d) return;
    var L = d.lanes[e.lane];
    if (!L) return;
    // roll the buckets forward if the event is past the last one
    var idx = Math.floor((e.ts - d.from) / d.bucket);
    while (idx >= L.series.length) {
      ORDER.forEach(function (k) {
        var s = d.lanes[k].series, last = s[s.length - 1];
        s.push({ t: last.t + d.bucket, req: 0, tok: 0, cost: 0 });
        s.shift();
      });
      d.from += d.bucket;
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
      try { var msg = JSON.parse(m.data); if (msg.type === "event") apply(msg.event); } catch (e) {}
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
  segment("people-lane", "data-lane", function (v) { state.lane = v; renderPeople(); });

  var resizeT = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (state.data) { renderLanes(); if (state.sel) loadDetail(); } }, 150);
  });
  // Charts use theme colours through CSS, so a theme switch needs nothing.

  load().then(connect);
  setInterval(load, 60000);
})();
