/* ============================================================
   toast.js — the single blocking-message component.

   Before this, the four evaluation pages each had their own way
   of telling a student they could not continue yet: two used an
   inline red `.alert` bar, one used a monospaced `.err-msg`
   paragraph, and the fourth simply disabled its button and said
   nothing at all. This replaces all four.

   Design notes that are not obvious from the CSS:

   - The surface inverts with the theme. A near-black pill floats
     on a light page but sinks into a dark one, so in dark mode
     the toast becomes the lifted surface instead, held by a
     one-pixel ring. Same principle as an inverse surface in
     Material.

   - It centres on the working column, not the window. Centring
     on the viewport put it over the evaluation pages' helper
     column, covering the vignette the student needs to read.

   - The countdown pauses on hover and on focus. A message that
     runs away mid-sentence is worse than no message.

   - aria-live="assertive" with role="alert": this is a response
     to the student pressing a button, so it should interrupt.
   ============================================================ */
(function () {
  "use strict";

  var DURATION = 6000;      // long enough to read two lines without hurrying
  var current = null;
  var timer = null;
  var rafId = null;

  function reduceMotion() {
    return window.matchMedia &&
           window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function positionOnColumn(el) {
    // Centre over the assessment column so the helper cards stay readable.
    var main = document.querySelector(".shell-main");
    if (!main || window.innerWidth <= 767) {
      el.style.left = "50%";
      el.style.transform = "translateX(-50%)";
      return;
    }
    var r = main.getBoundingClientRect();
    el.style.left = (r.left + r.width / 2) + "px";
    el.style.transform = "translateX(-50%)";
  }

  /**
   * dismiss(immediate)
   *   The fade-out leaves the old node in the DOM for 200ms. That is fine
   *   when the toast is going away, but not when one toast replaces
   *   another: for those 200ms the page holds two .cc-toast elements, so
   *   anything reading the first one - a screen reader following
   *   role="alert", or a test - sees the message that is on its way out.
   *   Replacement therefore removes the old node synchronously.
   */
  function dismiss(immediate) {
    if (!current) return;
    var el = current;
    current = null;
    clearTimeout(timer);
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    if (immediate || reduceMotion()) { el.remove(); return; }
    el.classList.remove("cc-toast-in");
    el.classList.add("cc-toast-out");
    setTimeout(function () { el.remove(); }, 200);
  }

  function onResize() { if (current) positionOnColumn(current); }

  /**
   * show({ count, title, detail })
   *   count   number shown large at the left; omit for a message with
   *           nothing to count (a failure rather than an unfinished step)
   *   title   the one-line headline
   *   detail  optional second line listing what is outstanding
   */
  function show(opts) {
    opts = opts || {};
    dismiss(true);
    // Belt and braces: if anything ever leaves an orphan behind, clear it
    // rather than stacking a second alert on top of it.
    var stale = document.querySelectorAll(".cc-toast");
    for (var i = 0; i < stale.length; i++) stale[i].remove();

    var el = document.createElement("div");
    el.className = "cc-toast";
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "assertive");

    var html = "";
    if (opts.count != null) {
      html += '<span class="cc-toast-n">' + opts.count + "</span>";
    }
    html += '<span class="cc-toast-stack">' +
            '<span class="cc-toast-hd"></span>' +
            (opts.detail ? '<span class="cc-toast-sub"></span>' : "") +
            "</span>" +
            '<button type="button" class="cc-toast-x" aria-label="Dismiss">&#10005;</button>' +
            '<span class="cc-toast-bar"><i></i></span>';
    el.innerHTML = html;

    // textContent rather than interpolation: these strings are assembled
    // from page content and should never be parsed as markup.
    el.querySelector(".cc-toast-hd").textContent = opts.title || "";
    if (opts.detail) el.querySelector(".cc-toast-sub").textContent = opts.detail;

    el.querySelector(".cc-toast-x").addEventListener("click", dismiss);

    document.body.appendChild(el);
    positionOnColumn(el);
    window.addEventListener("resize", onResize);
    current = el;

    if (!reduceMotion()) {
      requestAnimationFrame(function () { el.classList.add("cc-toast-in"); });
    } else {
      el.classList.add("cc-toast-in");
    }

    // Countdown, paused while the pointer or keyboard focus is on it.
    var fill = el.querySelector(".cc-toast-bar i");
    var start = performance.now();
    var elapsed = 0;
    var paused = false;

    function tick(now) {
      if (!current) return;
      if (!paused) {
        elapsed = now - start;
        var pct = Math.max(0, 1 - elapsed / DURATION);
        fill.style.width = (pct * 100) + "%";
        if (pct <= 0) { dismiss(); return; }
      } else {
        start = now - elapsed;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    function hold() { paused = true; }
    function release() { paused = false; }
    el.addEventListener("mouseenter", hold);
    el.addEventListener("mouseleave", release);
    el.addEventListener("focusin", hold);
    el.addEventListener("focusout", release);
  }

  /**
   * Convenience for the common case: n items outstanding, listed.
   * parts is an array of { n, label } - entries with n === 0 are
   * dropped, so the detail line only mentions what is actually
   * missing rather than reciting every requirement every time.
   */
  function gate(parts, fallbackTitle) {
    var missing = (parts || []).filter(function (p) { return p.n > 0; });
    var total = missing.reduce(function (a, p) { return a + p.n; }, 0);
    if (!total) { show({ title: fallbackTitle || "Something is still missing." }); return; }

    var detail = missing.map(function (p) {
      return p.n > 1 && p.plural ? p.n + " " + p.plural
           : p.n > 1 ? p.n + " " + p.label
           : p.label;
    }).join(" \u00b7 ");

    show({
      count: total,
      title: total === 1 ? "One item still to complete" : total + " items still to complete",
      detail: detail
    });
  }

  window.ClinCogToast = { show: show, gate: gate, dismiss: dismiss };
})();
