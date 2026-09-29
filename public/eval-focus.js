/* ============================================================
   eval-focus.js — the "active postcard" rhythm for every rated
   instrument on the four evaluation pages.

   On any visible step, each question an instrument asks is an ITEM:
     - the first unanswered item is lifted as a postcard (.ef-current),
     - answered items fold into a compact row that shows the chosen
       answer as a chip in the case's colours (.ef-answered),
     - the rest wait below (.ef-pending).
   Clicking a folded row opens it again so the answer can be changed.

   The four pages were written at different times and mark an answer up
   in four ways (a radio inside a label, a radio next to its label, a
   radio carried by a .radio-option, a <button> with .selected). This
   file does not need to know which instrument it is looking at: an item
   is the smallest element that holds one whole answer group and nothing
   of any other group. Scoring is untouched - every page still computes
   from its own change/click handlers; this only adds classes and a chip.
   ============================================================ */
(function () {
  "use strict";

  var VIEW_SEL = ".page.on, .page.active, .view.active";
  var BTN_GROUP_SEL = ".likert-buttons";
  var CLASS_SELECTED = ".selected, .selected-yes";
  /* The diagnostic conclusion closes a step rather than asking one more
     question, so on every case it stays open, in its usual place. */
  var EXCLUDE = ".dx-options, .diag-section, #icd-specifier-box";

  function visibleView() { return document.querySelector(VIEW_SEL); }

  /* Everything that makes up one answer group inside a view. */
  function groupsIn(view) {
    var groups = [];
    var seen = {};
    view.querySelectorAll('input[type="radio"]').forEach(function (r) {
      if (!r.name || seen[r.name]) return;
      seen[r.name] = true;
      var inputs = Array.prototype.slice.call(view.querySelectorAll('input[type="radio"][name="' + CSS.escape(r.name) + '"]'));
      groups.push({ kind: "radio", key: "r:" + r.name, controls: inputs });
    });
    view.querySelectorAll(BTN_GROUP_SEL).forEach(function (g, i) {
      var btns = Array.prototype.slice.call(g.querySelectorAll("button"));
      if (btns.length) groups.push({ kind: "button", key: "b:" + i, controls: btns, box: g });
    });
    return groups;
  }

  /* Smallest ancestor that holds every control of this group and no
     control of any other group, and carries some question text. */
  function itemFor(group, view) {
    var first = group.controls[0];
    var node = first.parentElement;
    var n = group.controls.length;
    while (node && node !== view) {
      var mine = group.controls.filter(function (c) { return node.contains(c); }).length;
      var all = node.querySelectorAll('input[type="radio"], ' + BTN_GROUP_SEL + ' button').length;
      if (mine === n) {
        if (all !== n) return null;              // swallowed another group: no clean item
        var text = node.textContent.replace(/\s+/g, " ").trim();
        var optionsText = controlsBox(group, node).textContent.replace(/\s+/g, " ").trim();
        if (text.length - optionsText.length > 8) return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  /* The element that holds just the options. */
  function controlsBox(group, item) {
    if (group.box) return group.box;
    var node = group.controls[0].parentElement;
    while (node && node !== item) {
      var mine = group.controls.filter(function (c) { return node.contains(c); }).length;
      if (mine === group.controls.length) return node;
      node = node.parentElement;
    }
    return item;
  }

  function labelFor(input) {
    if (input.id) {
      var l = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
      if (l) return l;
    }
    return input.closest("label") || input.parentElement;
  }

  /* Column names for a numeric scale: the last legend that comes before
     this item on the page (a step can hold two scales - GAD-7 and HiTOP -
     each with its own legend). */
  function legendFor(item, view) {
    var boxes = view.querySelectorAll(".likert-legend, .likert-header");
    var found = null;
    Array.prototype.forEach.call(boxes, function (bx) {
      if (bx.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) found = bx;
    });
    if (!found) return [];
    // innerText, not textContent: some legends break a label with <br>
    // ("Sometimes<br>True"), which textContent would glue together.
    return Array.prototype.map.call(found.querySelectorAll(".likert-legend-label"),
      function (e) { return (e.innerText || e.textContent).replace(/\s+/g, " ").trim(); });
  }

  /* The element the student actually sees as one option. */
  function faceOf(group, i) {
    var c = group.controls[i];
    if (group.kind === "button") return c;
    var l = labelFor(c);
    return (l && l.querySelector(".num")) || l;
  }

  function answerOf(group, legend) {
    var idx = -1, el = null;
    if (group.kind === "radio") {
      group.controls.forEach(function (c, i) { if (c.checked) { idx = i; el = labelFor(c); } });
      if (idx < 0) {
        group.controls.forEach(function (c, i) {
          var host = c.closest(".radio-option");
          if (host && host.matches(CLASS_SELECTED)) { idx = i; el = host; }
        });
      }
    } else {
      group.controls.forEach(function (b, i) { if (b.matches(CLASS_SELECTED)) { idx = i; el = b; } });
    }
    if (idx < 0) return null;
    var num = el.querySelector(".num");
    // A numbered option row keeps its number in its own element (.opt-n);
    // read the parts separately so "1" and "Several days" do not run together.
    var optN = el.querySelector(".opt-n, .radio-num, .option-num");
    var text;
    if (num) text = num.textContent;
    else if (optN) text = optN.textContent.trim() + " · " + el.textContent.replace(optN.textContent, "");
    else text = el.innerText || el.textContent;
    text = text.replace(/\s+/g, " ").trim();
    // "1 Monthly or less" -> "1 · Monthly or less"
    var m = /^(\d+)\s*[·.:)\-–]?\s+(\D.*)$/.exec(text);
    if (m && text.indexOf(" · ") < 0) text = m[1] + " · " + m[2];
    var lbl = el.querySelector(".lbl");
    if (lbl && lbl.textContent.trim()) text = text + " · " + lbl.textContent.trim();
    else if (/^\d+$/.test(text) && legend.length === group.controls.length) text = text + " · " + legend[idx];
    return text.length > 60 ? text.slice(0, 57) + "…" : text;
  }

  var opened = {};   // key -> true while a folded item has been reopened

  /* After the student answers the item that was the active postcard, the
     next one opens - often below the fold, now that the postcards are big.
     So the page follows: the new postcard is brought to the middle of the
     screen. Only for a real answer given in order (not for the answer
     replay on page load, and not when an earlier item is being changed). */
  var followFrom = null;
  var lastPointer = 0;
  document.addEventListener("pointerdown", function () { lastPointer = Date.now(); }, true);
  function armFollow(e) {
    if (!e.isTrusted || !e.target.closest) return;
    var item = e.target.closest(".ef-item.ef-current");
    if (item && e.target.closest(".ef-controls")) followFrom = item;
  }
  function follow(next, from) {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var keyboard = Date.now() - lastPointer > 1000 && from.contains(document.activeElement);
    // Two frames: the answered row has folded and the new postcard has its
    // final size before the position is measured.
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      next.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      // Someone answering with the keyboard moves on with the page.
      var first = keyboard && next.querySelector(".ef-controls input, .ef-controls button");
      if (first) { try { first.focus({ preventScroll: true }); } catch (err) { /* old browsers */ } }
    }); });
  }

  function refresh() {
    var view = visibleView();
    if (!view) return;
    var current = null;
    groupsIn(view).forEach(function (g) {
      var item = itemFor(g, view);
      if (!item || item.matches(EXCLUDE) || item.querySelector(EXCLUDE) || item.closest(EXCLUDE)) return;
      var legend = legendFor(item, view);
      if (!item.classList.contains("ef-item")) {
        item.classList.add("ef-item");
        item.dataset.efKey = g.key;
        controlsBox(g, item).classList.add("ef-controls");
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ef-chip";
        chip.setAttribute("aria-label", "Change this answer");
        item.appendChild(chip);
      }
      var ans = answerOf(g, legend);
      var chip = item.querySelector(":scope > .ef-chip");
      if (chip) chip.textContent = ans || "";
      item.classList.toggle("ef-answered", !!ans && !opened[g.key]);
      // The folded row keeps exactly the room its chip needs.
      if (chip && ans && !opened[g.key]) item.style.setProperty("--ef-chip-w", chip.offsetWidth + "px");
      item.classList.toggle("ef-open", !!ans && !!opened[g.key]);
      var isCurrent = !ans && !current;
      if (isCurrent) current = item;
      item.classList.toggle("ef-current", isCurrent);
      item.classList.toggle("ef-pending", !ans && !isCurrent);
      // Numeric options carry their scale label, shown under the number
      // while the item is the active postcard.
      if (legend.length === g.controls.length) {
        g.controls.forEach(function (c, i) {
          var face = faceOf(g, i);
          if (face && /^\d+$/.test(face.textContent.trim()) && !face.dataset.efLabel) face.dataset.efLabel = legend[i];
        });
      }
    });
    if (followFrom) {
      var from = followFrom;
      followFrom = null;
      if (current && current !== from && (from.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING)) follow(current, from);
    }
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; refresh(); });
  }

  // Capture phase, so the item is still the current postcard when it is read.
  document.addEventListener("click", armFollow, true);
  document.addEventListener("change", armFollow, true);

  document.addEventListener("click", function (e) {
    // A folded row reopens when it is clicked anywhere, the chip included.
    var item = e.target.closest && e.target.closest(".ef-item.ef-answered");
    // Only a real click by the student opens a folded row; the answer
    // replay on page load (eval-memory.js) clicks programmatically.
    if (item && e.isTrusted && !(e.target.closest("a"))) opened[item.dataset.efKey] = true;
    schedule();
  }, true);

  document.addEventListener("change", function (e) {
    // Answering a reopened item folds it again.
    var item = e.target.closest && e.target.closest(".ef-item");
    if (item) delete opened[item.dataset.efKey];
    schedule();
  });
  // Any click on an option of a reopened item folds it again - including
  // the answer it already had. Re-choosing the same radio fires no change
  // event, which left the row stuck open; button scales (.likert-btn)
  // never fire change at all.
  document.addEventListener("click", function (e) {
    var opt = e.target.closest && e.target.closest(".ef-item.ef-open .ef-controls :is(label, button, input, .radio-option, .num)");
    if (!opt) return;
    var item = opt.closest(".ef-item");
    setTimeout(function () { delete opened[item.dataset.efKey]; schedule(); }, 0);
  });

  // Steps are switched by each page's own go()/goTo()/showView(), which
  // toggle classes; watch for that rather than wrapping four functions.
  // Only step containers are watched: refresh() itself writes classes on
  // items, and reacting to those would loop.
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var t = records[i].target;
      if (t.matches && t.matches(".page, .view")) { schedule(); return; }
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
  else schedule();
  window.addEventListener("load", function () { schedule(); setTimeout(schedule, 400); });

  /* ---- Printing from the dark theme ----
     Paper is always light. CSS alone cannot get there: the severity bars
     and the charts are drawn by script with the colours of the theme that
     was active when the report was built. So for the length of the print,
     the page switches to the light theme and the report is rebuilt, then
     both go back. Only when the report step is the one showing. */
  function reportShowing() { var v = visibleView(); return !!(v && v.querySelector(".report-doc")); }
  function rebuild() {
    try {
      if (typeof window.buildReport === "function") window.buildReport();
      else if (typeof window.generateReport === "function") window.generateReport();
    } catch (e) { /* a chart library missing offline must not stop printing */ }
  }
  window.addEventListener("beforeprint", function () {
    var h = document.documentElement;
    if (h.getAttribute("data-theme") !== "dark" || !reportShowing()) return;
    h.setAttribute("data-print-from", "dark");
    h.setAttribute("data-theme", "light"); h.style.colorScheme = "light";
    rebuild();
  });
  window.addEventListener("afterprint", function () {
    var h = document.documentElement;
    if (h.getAttribute("data-print-from") !== "dark") return;
    h.removeAttribute("data-print-from");
    h.setAttribute("data-theme", "dark"); h.style.colorScheme = "dark";
    rebuild();
  });

  window.ClinCogEvalFocus = { refresh: refresh };
})();
