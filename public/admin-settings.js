/* ============================================================
   admin-settings.js - the settings pages on the admin console:
   Course, Students, Demo, AI models, History & backup. One script for
   all of them; each part draws itself only on the page that has it.

   Reads   GET  /api/monitor/seminar       the whole configuration, the
                                           class list and what each
                                           student has used this period
   Writes  POST /api/monitor/seminar       { op, args } - one change at a
                                           time, validated by the server
           POST /api/monitor/quota-reset   give a student exchanges back
   After every change the page reloads the configuration, so what it shows
   is always what the server holds.
   ============================================================ */
(function () {
  "use strict";

  var CASES = [
    { id: "schizophrenia", name: "Dennis" }, { id: "depression", name: "Darren" },
    { id: "anxiety", name: "Alex" }, { id: "addiction", name: "Jordan" },
  ];
  var S = { data: null, selected: {}, editing: null, search: "" };

  function $(id) { return document.getElementById(id); }
  function on(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function toast(title, detail) { if (window.ClinCogToast) window.ClinCogToast.show({ title: title, detail: detail || "" }); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(ms) {
    if (ms == null) return null;
    var d = new Date(ms);
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function toLocalInput(ms) {
    if (ms == null) return "";
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fromLocalInput(v) { if (!v) return null; var t = new Date(v).getTime(); return isNaN(t) ? null : t; }
  function limitText(v) { return v === null ? "no limit" : String(v); }

  // ---------- server ----------
  var PAGE = (document.querySelector("[data-admin-page]") || { getAttribute: function () { return ""; } }).getAttribute("data-admin-page");
  function load() {
    if (PAGE === "history") { icons(); return loadHistory(); }
    return fetch("/api/monitor/seminar", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { S.data = d; render(); })
      .catch(function () { toast("Could not load the settings", "Reload the page to try again."); });
  }
  function change(op, args, errEl, okText) {
    if (errEl) errEl.textContent = "";
    document.body.classList.add("busy");
    return fetch("/api/monitor/seminar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ClinCog-Admin": "1" },
      body: JSON.stringify({ op: op, args: args || {} }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        document.body.classList.remove("busy");
        if (!res.ok) { if (errEl) errEl.textContent = res.j.error || "That did not work."; else toast("Not saved", res.j.error || ""); return false; }
        if (okText) toast(okText);
        return load().then(function () { return true; });
      })
      .catch(function () { document.body.classList.remove("busy"); if (errEl) errEl.textContent = "No connection to the server."; return false; });
  }
  function resetQuota(id, caseId) {
    return fetch("/api/monitor/quota-reset?student=" + encodeURIComponent(id) + (caseId ? "&case=" + caseId : ""), {
      method: "POST", headers: { "X-ClinCog-Admin": "1" },
    }).then(function (r) { return r.ok; });
  }

  // ---------- helpers ----------
  function periodStatus(p, now) {
    if (p.start != null && p.start > now) return "scheduled";
    if (p.end != null && p.end <= now) return "ended";
    return "running";
  }
  function activePeriod() {
    var d = S.data;
    for (var i = 0; i < d.config.periods.length; i++) if (d.config.periods[i].id === d.activePeriodId) return d.config.periods[i];
    return null;
  }
  // A limit picker: Default / Custom number / No limit.
  function limitPicker(value, withDefault, defaultLabel) {
    var wrap = el("div", "limit-pick");
    var sel = el("select", "sel");
    if (withDefault) sel.appendChild(new Option(defaultLabel || "Default", "default"));
    sel.appendChild(new Option("Custom", "custom"));
    sel.appendChild(new Option("No limit", "unlimited"));
    var num = el("input", "inp");
    num.type = "number"; num.min = 0; num.max = 1000;
    num.setAttribute("aria-label", "Number of exchanges");
    if (value === null || value === undefined) { sel.value = withDefault ? "default" : "custom"; }
    else if (value < 0) sel.value = "unlimited";
    else { sel.value = "custom"; num.value = value; }
    function sync() { num.hidden = sel.value !== "custom"; if (!num.hidden && num.value === "") num.value = 20; }
    sel.addEventListener("change", sync); sync();
    wrap.appendChild(sel); wrap.appendChild(num);
    wrap.read = function () {
      if (sel.value === "default") return null;
      if (sel.value === "unlimited") return -1;
      return num.value === "" ? 0 : Number(num.value);
    };
    return wrap;
  }

  // ---------- render ----------
  // Each part is drawn only where its page has it.
  function render() {
    [["status", renderStatus], ["g-open", renderAccess], ["c-grid", renderCases], ["a-list", renderAnnouncements],
     ["b-now", renderBudget], ["prov-cards", renderProvider], ["p-table", renderPeriods],
     ["l-cases", renderLimits], ["s-table", renderStudents], ["pw-source", renderPassword], ["d-now", renderDemo]]
      .forEach(function (x) { if ($(x[0])) x[1](); });
    if (S.editing && $("s-editor")) renderEditor();
    icons();
  }
  function icons() {
    if (typeof ClinIcons === "undefined") return;
    [].forEach.call(document.querySelectorAll("[data-ico]"), function (e) { if (!e.firstChild) e.innerHTML = ClinIcons.get(e.getAttribute("data-ico"), 16); });
  }

  function renderStatus() {
    var d = S.data, c = d.config, box = $("status");
    box.textContent = "";
    var ap = activePeriod();
    var students = d.students.length, paused = d.students.filter(function (s) { return s.suspended; }).length;
    var blocked = S.data.budget && S.data.budget.blocked;
    var open = c.open && ap && !blocked;
    [
      ["Interviews", (open ? "Open" : "Closed"), (open ? "Students can chat" : (!c.open ? "Closed by you" : !ap ? "No period is running" : "Monthly budget reached")) + " · " + d.providers[d.provider].label + ".", open],
      ["Current period", ap ? ap.name : "None", ap ? (ap.end ? "Until " + fmtDate(ap.end) : "No end set") : "Add or start one below."],
      ["Students", String(students), paused ? paused + " paused" : "All active"],
      ["Class password", d.passwordSource === "console" ? "Set here" : d.passwordSource === "secret" ? "From Cloudflare" : "Not set", d.passwordSource === "none" ? "Nobody can sign in yet." : "Change it below."],
    ].forEach(function (x) {
      var s = el("div", "stat");
      s.appendChild(el("small", "", x[0]));
      var b = el("b"); if (x[3] !== undefined) { var dot = el("span", "dot" + (x[3] ? " on" : "")); b.appendChild(dot); }
      b.appendChild(document.createTextNode(x[1])); s.appendChild(b);
      s.appendChild(el("span", "", x[2]));
      box.appendChild(s);
    });
  }

  function renderAccess() {
    var c = S.data.config;
    $("g-open").checked = !!c.open;
    $("g-open-label").textContent = c.open ? "Interviews open" : "Interviews closed";
    var mods = S.data.providers[S.data.provider].models;
    $("g-fast").checked = c.models.indexOf("fast") >= 0;
    $("g-thoughtful").checked = c.models.indexOf("thoughtful") >= 0;
    $("g-fast-label").textContent = "Fast (" + mods.fast + ")";
    $("g-thoughtful-label").textContent = "Thoughtful (" + mods.thoughtful + ")";
    $("g-msg").value = c.closedMessage || "";
  }

  // ---------- prices ----------
  function shortDate(ms) { var d = new Date(ms); return d.getDate() + " " + MONTHS[d.getMonth()]; }
  function priceSourceText(price) {
    if (!price) return "No price known for this model: type one, or its cost shows as unknown.";
    var base = "$ per million tokens, input / output. ";
    if (price.source === "manual") return base + "Set by you - empty both fields to go back to the automatic price.";
    if (price.source === "built-in") return base + "Built-in price; not found in the public catalogues yet.";
    return base + "Automatic, from " + price.source + (price.at ? " (" + shortDate(price.at) + ")" : "") + ". Type a price to fix it.";
  }
  function renderPriceCheck(box) {
    var pc = S.data.priceCheck, row = el("div", "row-actions");
    var txt = pc
      ? "Prices last checked " + fmtDate(pc.at) + ": " + pc.found + " found" + (pc.openrouter ? " (OpenRouter" + (pc.litellm ? ", LiteLLM" : "") + ")" : pc.litellm ? " (LiteLLM)" : "") +
        (pc.missing && pc.missing.length ? "; not found: " + pc.missing.join(", ") + "." : ".")
      : "Prices have not been checked yet. They are checked once a day.";
    var note = el("span", "note", txt); note.style.margin = "0"; note.style.flex = "1 1 280px";
    var b = el("button", "btn-ghost btn-sm", "Check prices now"); b.type = "button";
    b.addEventListener("click", function () {
      b.disabled = true; b.textContent = "Checking…";
      fetch("/api/monitor/prices-refresh", { method: "POST", headers: { "X-ClinCog-Admin": "1" } })
        .then(function (r) { return r.json(); })
        .then(function () { toast("Prices checked"); return load(); })
        .catch(function () { toast("Could not reach the price catalogues"); b.disabled = false; b.textContent = "Check prices now"; });
    });
    row.appendChild(note); row.appendChild(b);
    box.appendChild(row);
  }

  // ---------- billing (Anthropic Admin key) ----------
  function renderBilling(box) {
    var wrap = el("div", "billing-box");
    wrap.appendChild(el("h4", "", "What Anthropic billed"));
    wrap.appendChild(el("p", "note", "With an Anthropic Admin key, Live monitoring also shows what Anthropic actually billed each day, next to the estimate. The key is used only to read cost reports and is never shown again."));
    var status = el("div", "note", "Checking…"); wrap.appendChild(status);
    var g = el("div", "grid2"); g.style.marginTop = "10px";
    var kf = el("label", "field"); kf.appendChild(el("span", "", "Admin key"));
    var kin = el("input", "inp"); kin.type = "password"; kin.autocomplete = "off"; kin.placeholder = "sk-ant-admin01-…";
    kf.appendChild(kin); g.appendChild(kf);
    var wf = el("label", "field"); wf.appendChild(el("span", "", "Count only this workspace"));
    var wsel = el("select", "sel"); wsel.appendChild(new Option("Whole organization", ""));
    wf.appendChild(wsel); wf.appendChild(el("small", "", "Best: keep the students' key in its own workspace, so other use of your account is not counted."));
    g.appendChild(wf); wrap.appendChild(g);
    var err = el("span", "err");
    var row = el("div", "row-actions");
    var save = el("button", "btn-ghost", "Save admin key"); save.type = "button";
    save.addEventListener("click", function () { change("setAdminKey", { key: kin.value }, err, "Admin key saved").then(function (ok) { if (ok) kin.value = ""; }); });
    var rm = el("button", "btn-ghost danger", "Remove saved admin key"); rm.type = "button"; rm.hidden = true;
    rm.addEventListener("click", function () { if (confirm("Remove the admin key saved here?")) change("clearAdminKey", {}, err, "Admin key removed"); });
    var ws = el("button", "btn-ghost", "Save workspace"); ws.type = "button"; ws.disabled = true;
    ws.addEventListener("click", function () {
      var o = wsel.options[wsel.selectedIndex];
      change("billingWorkspace", { id: wsel.value || null, name: o ? o.text : null }, err, "Saved");
    });
    [save, rm, ws, err].forEach(function (x) { row.appendChild(x); });
    wrap.appendChild(row);
    box.appendChild(wrap);
    fetch("/api/monitor/billing-status", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (b) {
      status.textContent = b.source === "none" ? "No admin key yet." :
        (b.source === "console" ? "Admin key saved here " : "Admin key from Cloudflare (ANTHROPIC_ADMIN_KEY) ") + b.hint +
        (b.error ? " - " + b.error : b.workspaces ? " - working." : "");
      rm.hidden = b.source !== "console";
      if (b.workspaces) {
        b.workspaces.filter(function (w) { return !w.archived; }).forEach(function (w) { wsel.appendChild(new Option(w.name, w.id)); });
        wsel.value = b.workspace || "";
        ws.disabled = false;
      }
    }).catch(function () { status.textContent = "Could not check the admin key."; });
  }

  // ---------- AI models: provider, model and key per address ----------
  var SITE_INFO = {
    uvt: { name: "Seminar", who: "the students", use: "for the students" },
    demo: { name: "Public demo", who: "visitors of the public demo (without their own key)", use: "for the public demo" },
    admin: { name: "Admin console", who: "you, when you chat with the patients on this console", use: "on the admin console" },
  };
  var site = "uvt";
  try { var sv = localStorage.getItem("clincog_admin_site"); if (SITE_INFO[sv]) site = sv; } catch (e) {}
  if (/^#site-(uvt|demo|admin)$/.test(location.hash)) site = location.hash.slice(6);
  var provView = null; // which provider's details are open (defaults to the one in use)
  window.addEventListener("hashchange", function () {
    var m = /^#site-(uvt|demo|admin)$/.exec(location.hash);
    if (m && m[1] !== site && S.data) { site = m[1]; provView = null; renderProvider(); }
  });
  function hostOf(st) { return S.data.sites[st].host; }
  function keyText(k) {
    var t;
    if (k.source === "console") t = "Key saved here " + k.hint;
    else if (k.source === "secret") t = "Key from Cloudflare (" + k.secret + ") " + k.hint;
    else t = "No key";
    if (k.shared) t = "Borrowed from " + hostOf(k.shared) + ": " + (k.source === "none" ? "it has no key" : t.charAt(0).toLowerCase() + t.slice(1));
    else if (k.source === "none" && k.ownSecretOff) t += " (the Cloudflare key " + k.ownSecret + " is switched off)";
    return t;
  }
  function renderSitePick() {
    var host = $("site-pick"); host.textContent = "";
    var seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Address");
    ["uvt", "demo", "admin"].forEach(function (st) {
      var b = el("button"); b.type = "button"; b.setAttribute("aria-pressed", String(st === site));
      b.appendChild(document.createTextNode(SITE_INFO[st].name));
      var sp = S.data.sites[st];
      b.appendChild(el("small", "", sp.host + " · " + S.data.providers[sp.provider].label));
      b.addEventListener("click", function () {
        site = st; provView = null;
        try { localStorage.setItem("clincog_admin_site", st); } catch (e) {}
        history.replaceState(null, "", "#site-" + st);
        renderProvider();
      });
      seg.appendChild(b);
    });
    host.appendChild(seg);
    var aff = el("div", "affects");
    aff.appendChild(document.createTextNode("Changes below affect "));
    aff.appendChild(el("b", "", hostOf(site)));
    aff.appendChild(document.createTextNode(" only: " + SITE_INFO[site].who + "."));
    host.appendChild(aff);
    // The budget belongs to the seminar alone.
    var bs = $("sec-budget"); if (bs) bs.hidden = site !== "uvt";
  }
  function renderProvider() {
    var d = S.data, host = $("prov-cards"), sp = d.sites[site];
    if (!provView || !d.providers[provView]) provView = sp.provider;
    renderSitePick();
    host.textContent = "";
    Object.keys(d.providers).forEach(function (p) {
      var info = d.providers[p], si = sp.providers[p];
      var card = el("button", "prov-card"); card.type = "button";
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", p === provView ? "true" : "false");
      card.appendChild(el("b", "", info.label));
      if (p === sp.provider) card.appendChild(el("span", "pill run", "In use"));
      card.appendChild(el("small", "", site === "uvt" ? info.models.fast + " · " + info.models.thoughtful : si.model));
      card.appendChild(el("small", "", keyText(si.key)));
      card.addEventListener("click", function () { provView = p; renderProvider(); });
      host.appendChild(card);
    });
    renderProviderDetail();
  }
  function priceInputs(model) {
    var price = S.data.prices[model];
    var pr = el("div", "limit-pick");
    var pi = el("input", "inp"); pi.type = "number"; pi.step = "0.01"; pi.min = 0; pi.placeholder = "in"; pi.setAttribute("aria-label", "Input price per million tokens");
    var po = el("input", "inp"); po.type = "number"; po.step = "0.01"; po.min = 0; po.placeholder = "out"; po.setAttribute("aria-label", "Output price per million tokens");
    // A price typed here is fixed; left empty, the automatic one is used
    // (shown greyed as the placeholder) and follows the daily check.
    if (price && price.source === "manual") { pi.value = price.in; po.value = price.out; }
    else if (price) { pi.placeholder = String(price.in); po.placeholder = String(price.out); }
    pi.style.width = po.style.width = "50%"; pi.style.flex = po.style.flex = "1 1 0";
    pr.appendChild(pi); pr.appendChild(po);
    return { row: pr, pin: pi, pout: po, note: el("small", "", priceSourceText(price)) };
  }
  function priceValue(f) {
    if (f.pin.value !== "" && f.pout.value !== "") return [Number(f.pin.value), Number(f.pout.value)];
    if (f.pin.value === "" && f.pout.value === "") return null; // back to automatic
    return undefined;
  }
  function renderProviderDetail() {
    var d = S.data, p = provView, info = d.providers[p], sp = d.sites[site], si = sp.providers[p], box = $("prov-detail");
    var inUse = p === sp.provider;
    box.textContent = "";
    box.appendChild(el("h3", "", info.label + (inUse ? " - in use on " + sp.host : "")));
    var err = el("span", "err");
    var g = el("div", "grid2"), fields = {};
    var tiers = site === "uvt" ? ["fast", "thoughtful"] : ["one"];
    tiers.forEach(function (t) {
      var f = el("div", "field");
      f.appendChild(el("span", "", t === "one" ? "Model" : (t === "fast" ? "Fast" : "Thoughtful") + " model"));
      var cur = t === "one" ? si.model : info.models[t], def = t === "one" ? si.default : info.defaults[t];
      var inp = el("input", "inp"); inp.value = cur; inp.placeholder = def;
      inp.setAttribute("aria-label", (t === "one" ? "" : t + " ") + "model name");
      f.appendChild(inp);
      var pf = priceInputs(cur);
      f.appendChild(pf.row); f.appendChild(pf.note);
      fields[t] = { model: inp, pin: pf.pin, pout: pf.pout, def: def };
      g.appendChild(f);
    });
    box.appendChild(g);
    if (site !== "uvt") box.appendChild(el("p", "note", "Prices belong to the model, not the address: a price set here is used wherever that model runs."));
    var a1 = el("div", "row-actions");
    var save = el("button", "btn-ghost", site === "uvt" ? "Save models and prices" : "Save model and price"); save.type = "button";
    save.addEventListener("click", function () {
      var prices = {};
      tiers.forEach(function (t) {
        var m = fields[t].model.value.trim() || fields[t].def, v = priceValue(fields[t]);
        if (v !== undefined) prices[m] = v;
      });
      if (site === "uvt") {
        var models = {}; models[p] = {};
        tiers.forEach(function (t) { models[p][t] = fields[t].model.value.trim(); });
        change("provider", { models: models, prices: prices }, err, "Saved");
      } else {
        var mm = {}; mm[p] = fields.one.model.value.trim();
        change("site", { site: site, models: mm, prices: prices }, err, "Saved");
      }
    });
    a1.appendChild(save);
    box.appendChild(a1);

    // ---- the key ----
    var k = si.key;
    var kf = el("div", "grid2"); kf.style.marginTop = "16px";
    var kfield = el("label", "field");
    kfield.appendChild(el("span", "", "API key"));
    var kin = el("input", "inp"); kin.type = "password"; kin.autocomplete = "off"; kin.placeholder = k.saved ? "Paste a new key to replace it" : "Paste the key";
    kfield.appendChild(kin);
    kfield.appendChild(el("small", "", keyText(k)));
    kf.appendChild(kfield);
    box.appendChild(kf);
    var a2 = el("div", "row-actions");
    var sk = el("button", "btn-ghost", "Save key"); sk.type = "button";
    sk.addEventListener("click", function () { change("setKey", { site: site, provider: p, key: kin.value }, err, "Key saved").then(function (ok) { if (ok) kin.value = ""; }); });
    a2.appendChild(sk);
    function leavesNoKey() { return inUse ? " " + info.label + " is in use on " + sp.host + ": without a key, its patients stop answering." : ""; }
    if (k.saved) {
      var rk = el("button", "btn-ghost danger", "Remove saved key"); rk.type = "button";
      rk.addEventListener("click", function () {
        var fallback = k.ownSecretSet && !k.ownSecretOff ? " The one in Cloudflare (" + k.ownSecret + ") will be used instead." : leavesNoKey();
        if (!confirm("Remove the " + info.label + " key saved for " + sp.host + "?" + fallback)) return;
        change("clearKey", { site: site, provider: p }, err, "Key removed");
      });
      a2.appendChild(rk);
    }
    // A Cloudflare secret cannot be deleted from here, but it can be ignored.
    if (k.ownSecretSet) {
      var cs = el("button", "btn-ghost" + (k.ownSecretOff ? "" : " danger"), k.ownSecretOff ? "Use the Cloudflare key again" : "Don't use the Cloudflare key"); cs.type = "button";
      cs.title = k.ownSecret;
      cs.addEventListener("click", function () {
        if (!k.ownSecretOff && !confirm("Stop using the key stored in Cloudflare (" + k.ownSecret + ") for " + info.label + " on " + sp.host + "? It stays in Cloudflare and can be used again from here." + (k.saved || k.shared ? "" : leavesNoKey()))) return;
        change("secretUse", { site: site, provider: p, off: !k.ownSecretOff }, err, k.ownSecretOff ? "Cloudflare key used again" : "Cloudflare key switched off");
      });
      a2.appendChild(cs);
    }
    var tb = el("button", "btn-ghost", "Try the key"); tb.type = "button";
    var out = el("div", "test-out");
    tb.addEventListener("click", function () {
      out.textContent = "Asking " + info.label + "…";
      fetch("/api/monitor/seminar-test?site=" + site + "&provider=" + p, { method: "POST", headers: { "X-ClinCog-Admin": "1" } })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          out.textContent = "";
          if (res.error) { out.appendChild(el("span", "bad", res.error)); return; }
          Object.keys(res.results).forEach(function (t) {
            var r = res.results[t];
            out.appendChild(el("span", r.ok ? "ok" : "bad", (r.ok ? "✓ " : "✗ ") + r.model + ": " + (r.ok ? "answered in " + (r.ms / 1000).toFixed(1) + " s - “" + r.sample + "”" : r.error)));
          });
        })
        .catch(function () { out.textContent = "No answer from the server."; });
    });
    a2.appendChild(tb);
    if (!inUse) {
      var use = el("button", "btn-ink", "Use " + info.label + " " + SITE_INFO[site].use); use.type = "button";
      use.disabled = k.source === "none";
      use.title = use.disabled ? "Give it a key first" : "";
      use.addEventListener("click", function () {
        if (!confirm("Switch " + sp.host + " to " + info.label + "? The next message sent there goes to " + info.label + "." + (site === "demo" && p !== "gemini" ? " Unlike the Gemini free tier, every reply is billed." : ""))) return;
        if (site === "uvt") change("provider", { provider: p }, err, "Now using " + info.label);
        else change("site", { site: site, provider: p }, err, sp.host + " now uses " + info.label);
      });
      a2.appendChild(use);
    }
    a2.appendChild(err);
    box.appendChild(a2);
    // Borrow the key of another address instead of saving it twice.
    var kr = el("div", "key-row");
    kr.appendChild(el("span", "", "Key to use:"));
    var sel = el("select", "sel"); sel.setAttribute("aria-label", "Which key " + sp.host + " uses for " + info.label);
    sel.appendChild(new Option("Its own (saved here or in Cloudflare)", ""));
    ["uvt", "demo", "admin"].forEach(function (st) {
      if (st === site) return;
      var o = d.sites[st].providers[p].key;
      var lbl = "The one " + d.sites[st].host + " uses" + (o.source === "none" || o.shared ? " (it has none of its own)" : "");
      var opt = new Option(lbl, st); opt.disabled = !!o.shared || (o.source === "none" && k.shared !== st); sel.appendChild(opt);
    });
    sel.value = k.shared || "";
    sel.addEventListener("change", function () { change("shareKey", { site: site, provider: p, from: sel.value || null }, err, sel.value ? "Using the key of " + d.sites[sel.value].host : "Using its own key"); });
    kr.appendChild(sel);
    box.appendChild(kr);
    box.appendChild(out);
    if (site === "uvt") renderPriceCheck(box);
    if (site === "uvt" && p === "anthropic") renderBilling(box);
  }

  function renderPeriods() {
    var d = S.data, host = $("p-table"), now = d.now;
    host.textContent = "";
    var ps = d.config.periods.slice().sort(function (a, b) { return (a.start || 0) - (b.start || 0); });
    if (!ps.length) { host.appendChild(el("div", "empty", "No periods. The interviews stay closed until one is added.")); return; }
    var t = el("table", "tbl"), hr = el("tr");
    ["Period", "Starts", "Ends", "Status", ""].forEach(function (h) { hr.appendChild(el("th", "", h)); });
    var th = el("thead"); th.appendChild(hr); t.appendChild(th);
    var tb = el("tbody");
    ps.forEach(function (p) {
      var tr = el("tr"), st = p.id === d.activePeriodId ? "running" : periodStatus(p, now);
      if (st === "running" && p.id !== d.activePeriodId) st = "overlapped";
      tr.appendChild(el("td", "", p.name));
      tr.appendChild(el("td", p.start == null ? "muted" : "", fmtDate(p.start) || "From the beginning"));
      tr.appendChild(el("td", p.end == null ? "muted" : "", fmtDate(p.end) || "No end"));
      var sc = el("td"), pill = el("span", "pill" + (st === "running" ? " run" : st === "ended" ? " off" : ""),
        { running: "Running", scheduled: "Scheduled", ended: "Ended", overlapped: "Overlapped by a later one" }[st]);
      sc.appendChild(pill); tr.appendChild(sc);
      var ac = el("td"); ac.style.textAlign = "right"; ac.style.whiteSpace = "nowrap";
      var edit = el("button", "btn-ghost btn-sm", "Edit"); edit.type = "button";
      edit.addEventListener("click", function () { editPeriod(p); });
      var del = el("button", "btn-ghost btn-sm danger", "Delete"); del.type = "button"; del.style.marginLeft = "6px";
      del.addEventListener("click", function () {
        var msg = st === "running"
          ? "Delete the running period \"" + p.name + "\"? The interviews close until another period is running. Its counts are kept but no longer used."
          : "Delete the period \"" + p.name + "\"?";
        if (confirm(msg)) change("removePeriod", { id: p.id }, $("p-err"), "Period deleted");
      });
      ac.appendChild(edit); ac.appendChild(del); tr.appendChild(ac);
      tb.appendChild(tr);
    });
    t.appendChild(tb); host.appendChild(t);
  }
  function editPeriod(p) {
    var name = prompt("Name of the period", p.name);
    if (name === null) return;
    var start = prompt("Starts (YYYY-MM-DD HH:MM, empty = from the beginning)", p.start == null ? "" : toLocalInput(p.start).replace("T", " "));
    if (start === null) return;
    var end = prompt("Ends (YYYY-MM-DD HH:MM, empty = no end)", p.end == null ? "" : toLocalInput(p.end).replace("T", " "));
    if (end === null) return;
    var sv = start.trim() ? fromLocalInput(start.trim().replace(" ", "T")) : null;
    var ev = end.trim() ? fromLocalInput(end.trim().replace(" ", "T")) : null;
    if ((start.trim() && sv === null) || (end.trim() && ev === null)) { $("p-err").textContent = "Write dates as 2026-10-01 08:00."; return; }
    change("updatePeriod", { id: p.id, name: name, start: sv, end: ev }, $("p-err"), "Period saved");
  }

  function renderLimits() {
    var c = S.data.config;
    $("l-default").value = c.defaultLimit;
    $("l-daily").value = c.dailyCap == null ? "" : c.dailyCap;
    var tz = $("l-tz");
    if (![].some.call(tz.options, function (o) { return o.value === c.timezone; })) tz.appendChild(new Option(c.timezone, c.timezone));
    tz.value = c.timezone;
    var host = $("l-cases");
    host.textContent = "";
    CASES.forEach(function (cs) {
      var f = el("div", "field");
      f.appendChild(el("span", "", cs.name));
      var pick = limitPicker(c.caseLimits[cs.id], true, "Default (" + c.defaultLimit + ")");
      pick.dataset.case = cs.id;
      f.appendChild(pick);
      host.appendChild(f);
    });
  }

  function studentRows() {
    var q = S.search.trim().toUpperCase();
    return S.data.students.filter(function (s) {
      return !q || s.id.indexOf(q.replace(/\s+/g, "")) >= 0 || (s.note || "").toUpperCase().indexOf(q) >= 0;
    });
  }
  function renderStudents() {
    var host = $("s-table"), rows = studentRows();
    host.textContent = "";
    $("s-count").textContent = S.data.students.length + " on the list" + (S.search ? " · " + rows.length + " shown" : "");
    // forget selections that are no longer on the list
    Object.keys(S.selected).forEach(function (id) { if (!S.data.students.some(function (s) { return s.id === id; })) delete S.selected[id]; });
    updateBulk();
    if (!S.data.students.length) { host.appendChild(el("div", "empty", "Nobody on the list yet. Until someone is added, the password alone opens the site and the chat stays closed.")); return; }
    if (!rows.length) { host.appendChild(el("div", "empty", "No student matches that search.")); return; }
    var t = el("table", "tbl"), hr = el("tr");
    var allTh = el("th"), all = el("input"); all.type = "checkbox"; all.setAttribute("aria-label", "Select all shown");
    all.checked = rows.every(function (s) { return S.selected[s.id]; });
    all.addEventListener("change", function () { rows.forEach(function (s) { if (all.checked) S.selected[s.id] = 1; else delete S.selected[s.id]; }); renderStudents(); });
    allTh.appendChild(all); hr.appendChild(allTh);
    ["Student", "Note", "Status", "Used this period (Dennis · Darren · Alex · Jordan)", "Today", ""].forEach(function (h) { hr.appendChild(el("th", "", h)); });
    var th = el("thead"); th.appendChild(hr); t.appendChild(th);
    var tb = el("tbody");
    rows.forEach(function (s) {
      var tr = el("tr" , S.editing === s.id ? "sel" : "");
      var cb = el("td"), box = el("input"); box.type = "checkbox"; box.checked = !!S.selected[s.id]; box.setAttribute("aria-label", "Select " + s.id);
      box.addEventListener("change", function () { if (box.checked) S.selected[s.id] = 1; else delete S.selected[s.id]; updateBulk(); });
      cb.appendChild(box); tr.appendChild(cb);
      tr.appendChild(el("td", "mono", s.id));
      tr.appendChild(el("td", s.note ? "" : "muted", s.note || "-"));
      var stc = el("td"); stc.appendChild(el("span", "pill" + (s.suspended ? " off" : ""), s.suspended ? "Paused" : "Active")); tr.appendChild(stc);
      var uc = el("td"), chips = el("span", "chips");
      CASES.forEach(function (cs) {
        var used = s.used[cs.id] || 0, lim = s.effective[cs.id];
        var chip = el("span", lim === null ? "free" : used >= lim ? "full" : "", used + "/" + (lim === null ? "∞" : lim));
        chip.title = cs.name + ": " + used + " used of " + limitText(lim);
        chips.appendChild(chip);
      });
      uc.appendChild(chips); tr.appendChild(uc);
      tr.appendChild(el("td", "", String(s.today || 0) + (S.data.config.dailyCap ? " / " + S.data.config.dailyCap : "")));
      var ac = el("td"); ac.style.textAlign = "right";
      var ed = el("button", "btn-ghost btn-sm", "Edit"); ed.type = "button";
      ed.addEventListener("click", function () { S.editing = s.id; renderStudents(); renderEditor(); $("s-editor").scrollIntoView({ behavior: "smooth", block: "nearest" }); });
      ac.appendChild(ed); tr.appendChild(ac);
      tb.appendChild(tr);
    });
    t.appendChild(tb); host.appendChild(t);
  }
  function updateBulk() {
    var n = Object.keys(S.selected).length;
    $("s-bulk").classList.toggle("on", n > 0);
    $("s-bulk-n").textContent = n + (n === 1 ? " selected" : " selected");
  }

  function renderEditor() {
    var box = $("s-editor"), s = null;
    S.data.students.forEach(function (x) { if (x.id === S.editing) s = x; });
    if (!s) { box.hidden = true; S.editing = null; return; }
    box.hidden = false;
    box.textContent = "";
    box.appendChild(el("h3", "", s.id));
    box.appendChild(el("p", "sub", "On the list since " + (fmtDate(s.added) || "the start") + ". A limit set here wins over the defaults above."));
    var g = el("div", "grid2");
    var nf = el("label", "field"); nf.appendChild(el("span", "", "Note"));
    var note = el("input", "inp"); note.maxLength = 120; note.value = s.note || ""; nf.appendChild(note); g.appendChild(nf);
    var sf = el("div", "field"); sf.appendChild(el("span", "", "Access"));
    var sw = el("label", "switch"), si = el("input"); si.type = "checkbox"; si.checked = !s.suspended;
    sw.appendChild(si); sw.appendChild(el("i")); var swl = el("span", "", s.suspended ? "Paused" : "Can use the interviews"); sw.appendChild(swl);
    si.addEventListener("change", function () { swl.textContent = si.checked ? "Can use the interviews" : "Paused"; });
    sf.appendChild(sw); sf.appendChild(el("small", "", "Paused students can still open the site and their work, but cannot chat."));
    g.appendChild(sf);
    box.appendChild(g);

    var af = el("div", "field"); af.style.marginTop = "16px";
    af.appendChild(el("span", "", "All patients"));
    var allPick = limitPicker(s.limits.all, true, "Use the defaults");
    af.appendChild(allPick);
    af.appendChild(el("small", "", "One limit for every patient. A patient's own setting below still wins."));
    box.appendChild(af);

    var grid = el("div", "grid4"); grid.style.marginTop = "14px";
    var picks = {};
    CASES.forEach(function (cs) {
      var cb = el("div", "case-box");
      cb.appendChild(el("b", "", cs.name));
      var p = limitPicker(s.limits[cs.id], true, "Inherit");
      picks[cs.id] = p; cb.appendChild(p);
      var used = s.used[cs.id] || 0;
      cb.appendChild(el("small", "", "Used " + used + " of " + limitText(s.effective[cs.id]) + " now"));
      var rb = el("button", "btn-ghost btn-sm", "Reset used"); rb.type = "button"; rb.disabled = !used;
      rb.addEventListener("click", function () {
        if (!confirm("Give " + s.id + " back the " + used + " exchanges used with " + cs.name + "?")) return;
        resetQuota(s.id, cs.id).then(function (ok) { toast(ok ? "Reset done" : "Reset failed"); load(); });
      });
      cb.appendChild(rb);
      grid.appendChild(cb);
    });
    box.appendChild(grid);

    var err = el("span", "err");
    var actions = el("div", "row-actions");
    var save = el("button", "btn-ink", "Save " + s.id); save.type = "button";
    save.addEventListener("click", function () {
      var limits = { all: allPick.read() };
      CASES.forEach(function (cs) { limits[cs.id] = picks[cs.id].read(); });
      change("updateStudent", { id: s.id, note: note.value, suspended: !si.checked, limits: limits }, err, "Saved");
    });
    var resetAll = el("button", "btn-ghost", "Reset all used"); resetAll.type = "button";
    resetAll.addEventListener("click", function () {
      if (!confirm("Give " + s.id + " back everything used this period, with all four patients?")) return;
      resetQuota(s.id, null).then(function (ok) { toast(ok ? "Reset done" : "Reset failed"); load(); });
    });
    var remove = el("button", "btn-ghost danger", "Remove from the list"); remove.type = "button";
    remove.addEventListener("click", function () {
      if (!confirm("Remove " + s.id + "? They can no longer sign in. What they used stays recorded if you add them back.")) return;
      S.editing = null;
      change("removeStudents", { ids: [s.id] }, err, "Removed");
    });
    var close = el("button", "btn-ghost", "Close"); close.type = "button";
    close.addEventListener("click", function () { S.editing = null; box.hidden = true; renderStudents(); });
    [save, resetAll, remove, close, err].forEach(function (x) { actions.appendChild(x); });
    box.appendChild(actions);
  }

  function renderPassword() {
    var src = S.data.passwordSource;
    $("pw-source").textContent = src === "console"
      ? "Set on this page on " + (fmtDate(S.data.config.passwordChanged) || "an earlier date") + ". It replaces the one stored in Cloudflare."
      : src === "secret"
        ? "Currently the one stored in Cloudflare (STUDENT_ACCESS_PASSWORD). Setting one here replaces it."
        : "No class password is set, so nobody can sign in. Set one here.";
    $("pw-clear").hidden = src !== "console";
  }

  // ---------- case schedule ----------
  function renderCases() {
    var d = S.data, sched = d.config.cases || {}, host = $("c-grid");
    host.textContent = "";
    CASES.forEach(function (cs) {
      var cur = sched[cs.id] || { mode: "open" }, state = (d.cases || {})[cs.id] || { open: true };
      var card = el("div", "sched-card"); card.dataset.case = cs.id; card.dataset.mode = cur.mode;
      var top = el("div", "top"); top.appendChild(el("b", "", cs.name));
      var seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", cs.name + ": availability");
      var win = el("div", "win");
      var o = el("label", "field"); o.appendChild(el("span", "", "Opens")); var oi = el("input", "inp"); oi.type = "datetime-local"; oi.value = toLocalInput(cur.opensAt); o.appendChild(oi);
      var c = el("label", "field"); c.appendChild(el("span", "", "Closes")); var ci = el("input", "inp"); ci.type = "datetime-local"; ci.value = toLocalInput(cur.closesAt); c.appendChild(ci);
      win.appendChild(o); win.appendChild(c);
      [["open", "Open"], ["window", "Scheduled"], ["closed", "Closed"]].forEach(function (m) {
        var b = el("button", "", m[1]); b.type = "button"; b.dataset.mode = m[0];
        b.addEventListener("click", function () { card.dataset.mode = m[0]; sync(); });
        seg.appendChild(b);
      });
      function sync() {
        [].forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === card.dataset.mode)); });
        win.hidden = card.dataset.mode !== "window";
      }
      top.appendChild(seg); card.appendChild(top); card.appendChild(win);
      var st = state.open ? (state.closesAt ? "Open now, until " + fmtDate(state.closesAt) + "." : "Open now.") : (state.text || "Closed now.");
      card.appendChild(el("div", "state", "Students see: " + st));
      card.read = function () { return { mode: card.dataset.mode, opensAt: fromLocalInput(oi.value), closesAt: fromLocalInput(ci.value) }; };
      sync();
      host.appendChild(card);
    });
  }

  // ---------- announcements ----------
  function renderAnnouncements() {
    var list = (S.data.config.announcements || []).slice().sort(function (a, b) { return b.created - a.created; }), host = $("a-list"), now = S.data.now;
    host.textContent = "";
    if (!list.length) { host.appendChild(el("div", "empty", "No announcements.")); return; }
    list.forEach(function (a) {
      var row = el("div", "ann-item" + (a.level === "important" ? " is-important" : ""));
      var txt = el("div", "txt", a.text);
      var when = a.until != null && a.until <= now ? "Ended " + fmtDate(a.until)
        : a.from != null && a.from > now ? "Shows from " + fmtDate(a.from) + (a.until ? " until " + fmtDate(a.until) : "")
        : "Showing now" + (a.until ? ", until " + fmtDate(a.until) : "");
      txt.appendChild(el("span", "meta", (a.level === "important" ? "Important - " : "") + when));
      row.appendChild(txt);
      var del = el("button", "btn-ghost btn-sm danger", "Remove"); del.type = "button";
      del.addEventListener("click", function () { change("removeAnnouncement", { id: a.id }, $("a-err"), "Announcement removed"); });
      row.appendChild(del);
      host.appendChild(row);
    });
  }

  // ---------- budget ----------
  function money(v) { return "$" + (v || 0).toFixed(2); }
  function renderBudget() {
    var b = S.data.budget || {}, box = $("b-now");
    box.textContent = "";
    var now = el("div", "budget-now");
    now.appendChild(el("b", "", b.spent == null ? "-" : money(b.spent)));
    now.appendChild(el("span", "", b.monthly ? "of " + money(b.monthly) + " this month (" + Math.round((b.spent || 0) / b.monthly * 100) + "%)" : "spent this month, no budget set"));
    box.appendChild(now);
    if (b.monthly) {
      var pct = Math.min(100, (b.spent || 0) / b.monthly * 100);
      var m = el("div", "meter" + (pct >= b.alertPct ? " warn" : "")), i = el("i"); i.style.width = pct + "%"; m.appendChild(i); box.appendChild(m);
    }
    var st = S.data.config.budgetState || {};
    if (b.blocked) box.appendChild(el("div", "err", "The interviews are closed: this month's budget ran out."));
    else if (st.reopened && st.month === b.month && b.monthly && b.spent >= b.monthly) box.appendChild(el("p", "note", "Reopened by you for the rest of this month, past the budget. Saving a new budget applies it again."));
    $("b-monthly").value = b.monthly == null ? "" : b.monthly;
    $("b-alert").value = b.alertPct;
    $("b-auto").checked = !!b.autoClose;
    $("b-email").checked = !!b.emailAlerts;
    $("b-fail").checked = !!b.failureAlerts;
    $("b-reopen").hidden = !b.blocked;
    var e = S.data.email || {};
    $("b-mail").textContent = e.configured
      ? "Alerts go to " + e.to + ", the address the contact form uses (CONTACT_TO)."
      : "Email is not set up yet: alerts need the CONTACT_TO secret and the send_email binding (see SELF_HOSTING.md). The budget still closes the interviews without it.";
    $("b-test").disabled = !e.configured;
  }

  // ---------- Demo ----------
  function localIn(ms) { return toLocalInput(ms); }
  function renderDemo() {
    var d = S.data.demo, now = $("d-now"); now.textContent = "";
    var st = d.state || {};
    var row = el("div", "status-row demo-now"); row.style.marginBottom = "0";
    [["Demo", !d.enabled ? "Off" : st.open ? "On" : "Paused", !d.enabled ? "Switched off by you" : st.open ? "Visitors can chat" : "Until " + fmtDate(d.pausedUntil), d.enabled && st.open],
     ["Replies today", String(d.today || 0) + (d.dailyCap ? " of " + d.dailyCap : ""), d.dailyCap ? (d.today >= d.dailyCap ? "Cap reached: closed until midnight" : (d.dailyCap - d.today) + " left today") : "No daily cap"],
     ["Model", S.data.providers[S.data.sites.demo.provider].label, S.data.sites.demo.providers[S.data.sites.demo.provider].model + " · change it under AI models"]].forEach(function (x) {
      var s = el("div", "stat"); s.style.background = "var(--paper)";
      s.appendChild(el("small", "", x[0]));
      var b = el("b"); if (x[3] !== undefined) b.appendChild(el("span", "dot" + (x[3] ? " on" : "")));
      b.appendChild(document.createTextNode(x[1])); s.appendChild(b); s.appendChild(el("span", "", x[2])); row.appendChild(s);
    });
    now.appendChild(row);
    if (d.dailyCap) {
      var m = el("div", "meter" + (d.today >= d.dailyCap * 0.8 ? " warn" : "")), i = el("i");
      i.style.width = Math.min(100, (d.today || 0) / d.dailyCap * 100) + "%"; m.appendChild(i); m.style.marginTop = "12px"; now.appendChild(m);
    }
    $("d-on").checked = !!d.enabled; $("d-on-label").textContent = d.enabled ? "Demo on" : "Demo off";
    $("d-cap").value = d.dailyCap == null ? "" : d.dailyCap;
    $("d-msg").value = d.message || "";
    var p = $("d-pause-now"); p.textContent = "";
    if (d.pausedUntil && d.pausedUntil > S.data.now) p.appendChild(el("p", "note", "Paused now. Visitors see: \u201c" + (st.text || "") + "\u201d"));
    $("d-resume").hidden = !(d.pausedUntil && d.pausedUntil > S.data.now);
    var q = $("d-quick"); q.textContent = "";
    [["2 hours", 2], ["Until tomorrow 12:00", "noon"], ["24 hours", 24]].forEach(function (x) {
      var b = el("button", "btn-ghost btn-sm", x[0]); b.type = "button";
      b.addEventListener("click", function () {
        var t = new Date();
        if (x[1] === "noon") { t.setDate(t.getDate() + 1); t.setHours(12, 0, 0, 0); } else t = new Date(Date.now() + x[1] * 3600e3);
        $("d-until").value = localIn(t.getTime());
      });
      q.appendChild(b);
    });
  }
  on("d-on", "change", function () { $("d-on-label").textContent = this.checked ? "Demo on" : "Demo off"; });
  on("d-save", "click", function () {
    var cap = $("d-cap").value.trim();
    change("demo", { enabled: $("d-on").checked, dailyCap: cap === "" ? null : Number(cap), message: $("d-msg").value }, $("d-err"), "Demo settings saved");
  });
  on("d-pause", "click", function () {
    var t = fromLocalInput($("d-until").value);
    if (!t) { $("d-perr").textContent = "Pick the time the demo should reopen."; return; }
    change("demo", { pausedUntil: t }, $("d-perr"), "Demo paused");
  });
  on("d-resume", "click", function () { change("demo", { pausedUntil: null }, $("d-perr"), "Demo resumed"); });

  // ---------- History & backup ----------
  function loadHistory() {
    return fetch("/api/monitor/history", { cache: "no-store" }).then(function (r) { return r.json(); }).then(renderHistory)
      .catch(function () { toast("Could not load the history", "Reload the page to try again."); });
  }
  function renderHistory(d) {
    var host = $("h-list"); host.textContent = "";
    if (!d.entries.length) { host.appendChild(el("div", "empty", "No changes yet. Everything changed on this console from now on is listed here.")); return; }
    d.entries.forEach(function (h, i) {
      var row = el("div", "hist-row");
      row.appendChild(el("span", "t", fmtDate(h.at)));
      var ul = el("ul"); h.summary.forEach(function (x) { ul.appendChild(el("li", "", x)); }); row.appendChild(ul);
      var cell = el("div");
      if (h.undoable) {
        var b = el("button", "btn-ghost btn-sm", "Undo"); b.type = "button";
        b.addEventListener("click", function () {
          var msg = "Put the settings back as they were before this change" + (i ? ", undoing the " + i + " later change" + (i > 1 ? "s" : "") + " too" : "") + "?";
          if (!confirm(msg)) return;
          change("undo", { id: h.id }, $("h-err"), "Undone");
        });
        cell.appendChild(b);
      }
      row.appendChild(cell);
      host.appendChild(row);
    });
  }
  var restoreData = null;
  on("b-file", "change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    $("r-err").textContent = "";
    f.text().then(function (t) {
      try { restoreData = JSON.parse(t); } catch (e) { throw new Error("This file is not a ClinCog backup."); }
      return fetch("/api/monitor/seminar", { method: "POST", headers: { "Content-Type": "application/json", "X-ClinCog-Admin": "1" },
        body: JSON.stringify({ op: "restore", args: { config: restoreData, dryRun: true } }) }).then(function (r) { return r.json(); });
    }).then(function (res) {
      var box = $("r-preview"); box.hidden = false; box.textContent = "";
      var c = el("div", "check-box");
      if (res.error) { c.appendChild(el("b", "", res.error)); $("r-actions").hidden = true; box.appendChild(c); return; }
      c.appendChild(el("b", "", "Restoring " + f.name + (restoreData.at ? " (saved " + fmtDate(restoreData.at) + ")" : "") + " changes:"));
      if (!res.preview.length) c.appendChild(el("div", "ok", "Nothing: the settings are already the same."));
      else { var ul = el("ul"); ul.style.listStyle = "disc"; res.preview.forEach(function (x) { var li = el("li", "", x); li.style.color = "var(--text-primary)"; ul.appendChild(li); }); c.appendChild(ul); }
      c.appendChild(el("div", "meta", "Keys, the class password and what students have used stay as they are. The restore can be undone in History."));
      box.appendChild(c);
      $("r-actions").hidden = !res.preview.length;
    }).catch(function (e) { $("r-err").textContent = e.message || "The file could not be read."; $("r-actions").hidden = false; });
  });
  on("r-apply", "click", function () {
    if (!restoreData) return;
    change("restore", { config: restoreData }, $("r-err"), "Settings restored").then(function (ok) {
      if (ok) { restoreData = null; $("r-preview").hidden = true; $("r-actions").hidden = true; $("b-file").value = ""; }
    });
  });
  on("r-cancel", "click", function () { restoreData = null; $("r-preview").hidden = true; $("r-actions").hidden = true; $("b-file").value = ""; });

  // ---------- actions ----------
  on("g-open", "change", function () { $("g-open-label").textContent = this.checked ? "Interviews open" : "Interviews closed"; });
  on("g-save", "click", function () {
    var models = [];
    if ($("g-fast").checked) models.push("fast");
    if ($("g-thoughtful").checked) models.push("thoughtful");
    change("general", { open: $("g-open").checked, closedMessage: $("g-msg").value, models: models }, $("g-err"), "Interview settings saved");
  });

  on("c-save", "click", function () {
    var cases = {};
    [].forEach.call(document.querySelectorAll("#c-grid .sched-card"), function (c) { cases[c.dataset.case] = c.read(); });
    change("cases", { cases: cases }, $("c-err"), "Schedule saved");
  });
  on("a-add", "click", function () {
    change("announce", { text: $("a-text").value, level: $("a-important").checked ? "important" : "info",
      from: fromLocalInput($("a-from").value), until: fromLocalInput($("a-until").value) }, $("a-err"), "Announcement published")
      .then(function (ok) { if (ok) { $("a-text").value = ""; $("a-from").value = ""; $("a-until").value = ""; $("a-important").checked = false; } });
  });
  on("b-save", "click", function () {
    var v = $("b-monthly").value.trim();
    change("budget", { monthly: v === "" ? null : Number(v), alertPct: Number($("b-alert").value || 80),
      autoClose: $("b-auto").checked, emailAlerts: $("b-email").checked, failureAlerts: $("b-fail").checked }, $("b-err"), "Budget saved");
  });
  on("b-reopen", "click", function () {
    if (confirm("Reopen the interviews for the rest of this month? Spending continues past the budget until you close them or raise it.")) change("reopenBudget", {}, $("b-err"), "Interviews reopened");
  });
  on("b-test", "click", function () {
    $("b-err").textContent = "";
    fetch("/api/monitor/test-email", { method: "POST", headers: { "X-ClinCog-Admin": "1" } })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.ok) toast("Test email sent", "To " + j.to + ". Check the spam folder if it does not arrive."); else $("b-err").textContent = j.error || "Not sent."; })
      .catch(function () { $("b-err").textContent = "No connection to the server."; });
  });

  on("p-add", "click", function () {
    change("addPeriod", { name: $("p-name").value, start: fromLocalInput($("p-start").value), end: fromLocalInput($("p-end").value) }, $("p-err"), "Period added")
      .then(function (ok) { if (ok) { $("p-name").value = ""; $("p-start").value = ""; $("p-end").value = ""; } });
  });
  on("p-now", "click", function () {
    var name = prompt("Name of the new period (the running one ends now, and every student starts again from zero):", "");
    if (!name) return;
    change("newPeriodNow", { name: name }, $("p-err"), "New period started");
  });

  on("l-save", "click", function () {
    var caseLimits = {};
    [].forEach.call(document.querySelectorAll("#l-cases .limit-pick"), function (p) { caseLimits[p.dataset.case] = p.read(); });
    var daily = $("l-daily").value.trim();
    change("general", { defaultLimit: $("l-default").value === "" ? null : Number($("l-default").value), caseLimits: caseLimits,
      dailyCap: daily === "" ? null : Number(daily), timezone: $("l-tz").value }, $("l-err"), "Limits saved");
  });

  on("s-add-btn", "click", function () {
    var raw = $("s-add").value;
    // One per line or comma-separated; spaces inside a number are ignored.
    var ids = raw.split(/[\n\r\t,;]+/).map(function (x) { return x.replace(/\s+/g, ""); }).filter(Boolean);
    if (!ids.length) { $("s-err").textContent = "Paste at least one student number."; return; }
    change("addStudents", { ids: ids, note: $("s-note").value }, $("s-err"), ids.length === 1 ? "Student added" : ids.length + " students added")
      .then(function (ok) { if (ok) { $("s-add").value = ""; $("s-note").value = ""; } });
  });
  on("s-search", "input", function () { S.search = this.value; renderStudents(); });
  on("s-bulk", "click", function (e) {
    var b = e.target.closest("button[data-bulk]"); if (!b) return;
    var ids = Object.keys(S.selected), what = b.getAttribute("data-bulk"), n = ids.length;
    if (!n) return;
    var noun = n === 1 ? "1 student" : n + " students";
    if (what === "remove") {
      if (!confirm("Remove " + noun + " from the list? They can no longer sign in.")) return;
      change("removeStudents", { ids: ids }, null, "Removed " + noun).then(function () { S.selected = {}; renderStudents(); });
    } else if (what === "reset") {
      if (!confirm("Give " + noun + " back everything used this period?")) return;
      Promise.all(ids.map(function (id) { return resetQuota(id, null); })).then(function () { toast("Reset " + noun); load(); });
    } else if (what === "unlimited" || what === "default") {
      var v = what === "unlimited" ? -1 : null, limits = { all: v };
      CASES.forEach(function (c) { limits[c.id] = null; });
      change("bulkStudents", { ids: ids, limits: limits }, null, (what === "unlimited" ? "No limit for " : "Default limits for ") + noun);
    } else {
      change("bulkStudents", { ids: ids, suspended: what === "pause" }, null, (what === "pause" ? "Paused " : "Resumed ") + noun);
    }
  });

  // The current class password is fetched only when asked for, and hidden
  // again after a minute.
  var pwShown = false, pwTimer = null;
  function hidePw() { pwShown = false; $("pw-value").textContent = "••••••••"; $("pw-show").textContent = "Show"; }
  function fetchPw() {
    return fetch("/api/monitor/seminar-password", { cache: "no-store" }).then(function (r) { return r.json(); });
  }
  on("pw-show", "click", function () {
    if (pwShown) { hidePw(); return; }
    fetchPw().then(function (d) {
      var note = $("pw-note");
      note.hidden = true;
      if (d.password === null) {
        note.hidden = false;
        note.textContent = d.note || "No class password is set yet.";
        return;
      }
      $("pw-value").textContent = d.password;
      $("pw-show").textContent = "Hide";
      pwShown = true;
      clearTimeout(pwTimer); pwTimer = setTimeout(hidePw, 60000);
    }).catch(function () { toast("Could not read the password"); });
  });
  on("pw-copy", "click", function () {
    fetchPw().then(function (d) {
      if (d.password === null) { toast("No password to copy", d.note || ""); return; }
      return navigator.clipboard.writeText(d.password).then(function () { toast("Password copied"); });
    }).catch(function () { toast("Could not copy", "Use Show and copy it by hand."); });
  });

  on("pw-save", "click", function () {
    var a = $("pw-1").value, b = $("pw-2").value;
    if (a !== b) { $("pw-err").textContent = "The two passwords are not the same."; return; }
    change("setPassword", { password: a }, $("pw-err"), "Class password changed").then(function (ok) { if (ok) { $("pw-1").value = ""; $("pw-2").value = ""; hidePw(); } });
  });
  on("pw-clear", "click", function () {
    if (!confirm("Go back to the password stored in Cloudflare?")) return;
    change("clearPassword", {}, $("pw-err"), "Using the Cloudflare password again");
  });

  load();
})();
