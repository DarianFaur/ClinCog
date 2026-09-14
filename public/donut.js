/* ============================================================
   donut.js — the two-ring donut, rebuilt from the reference
   dashboard rather than approximated.

   Geometry was measured off the reference image from the ring's
   true centre, not eyeballed:

     inner ring   radius 45, stroke 8, round caps, no track
     gap          2px
     outer ring   radius 54.5, stroke 7, butt caps, full 360deg
     overall      116px across, so a 118 viewBox sits it flush

   The two rings do different jobs. The outer one is the complete
   breakdown and always closes the circle. The inner one is the
   single headline figure, drawn solid with round caps and no
   track behind it, and it ends exactly where the last outer
   segment begins - in the reference the inner arc and the "on
   time" + "late" segments stop at the same angle, which is what
   ties the two rings together visually.

   Segments marked as hatched get diagonal stripes instead of a
   flat fill, so "not done yet" reads as a quantity rather than as
   empty space. Colours come from tokens, never hardcoded.
   ============================================================ */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var R_INNER = 45, W_INNER = 8;
  var R_OUTER = 54.5, W_OUTER = 7;
  var BOX = 118, C = BOX / 2;
  var patternSeq = 0;

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  // Arc path from startDeg to endDeg, clockwise, 0deg at 12 o'clock.
  function arcPath(r, startDeg, endDeg) {
    var sweep = endDeg - startDeg;
    if (sweep <= 0) return "";
    // A full circle drawn as two joined arcs leaves a hairline seam where
    // they meet, which is visible against a patterned stroke. Signal the
    // caller to use a <circle> instead.
    if (sweep >= 359.99) return null;
    var p = function (deg) {
      var a = (deg - 90) * Math.PI / 180;
      return [C + r * Math.cos(a), C + r * Math.sin(a)];
    };
    var s = p(startDeg), e = p(endDeg);
    return "M " + s[0].toFixed(3) + " " + s[1].toFixed(3) +
           " A " + r + " " + r + " 0 " + (sweep > 180 ? 1 : 0) + " 1 " +
           e[0].toFixed(3) + " " + e[1].toFixed(3);
  }

  // Diagonal stripes, matching the reference's angle and rhythm.
  function hatch(defs, color) {
    var id = "donut-hatch-" + (++patternSeq);
    var pat = el("pattern", {
      id: id, width: 8, height: 8,
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(-45)"
    });
    pat.appendChild(el("rect", { width: 8, height: 8, fill: "transparent" }));
    pat.appendChild(el("rect", { width: 4, height: 8, fill: color }));
    defs.appendChild(pat);
    return "url(#" + id + ")";
  }

  /**
   * render(mount, opts)
   *   opts.segments  [{ value, color, hatched, label }]  outer ring, in order
   *   opts.value     number shown in the centre
   *   opts.total     number shown under it
   *   opts.headline  how many leading segments the inner solid arc covers
   *   opts.color     inner arc colour
   *   opts.title     accessible description
   */
  function render(mount, opts) {
    if (!mount) return;
    // Deliberately NOT filtered on value > 0. Dropping empty segments
    // renumbers the list, so a card whose headline category is currently
    // zero would take its inner arc from whatever segment moved into
    // first place - which drew a full ring for a value of nought.
    var segs = (opts.segments || []);
    var total = segs.reduce(function (a, s) { return a + s.value; }, 0);
    mount.textContent = "";

    var svg = el("svg", {
      viewBox: "0 0 " + BOX + " " + BOX,
      class: "donut-svg",
      role: "img",
      "aria-label": opts.title || ""
    });
    var defs = el("defs", {});
    svg.appendChild(defs);

    if (!total) {
      // Nothing recorded yet: show the empty ring rather than a blank box,
      // so the card keeps its shape and the zero is legible as a zero.
      svg.appendChild(el("circle", {
        cx: C, cy: C, r: R_OUTER, fill: "none",
        stroke: hatch(defs, opts.emptyColor || "var(--border)"),
        "stroke-width": W_OUTER
      }));
    } else {
      var at = 0;
      segs.forEach(function (s) {
        var sweep = s.value / total * 360;
        if (sweep <= 0) return;
        var paint = s.hatched ? hatch(defs, s.color) : s.color;
        var d = arcPath(R_OUTER, at, at + sweep);
        svg.appendChild(d === null
          ? el("circle", { cx: C, cy: C, r: R_OUTER, fill: "none", stroke: paint, "stroke-width": W_OUTER })
          : el("path", { d: d, fill: "none", stroke: paint, "stroke-width": W_OUTER, "stroke-linecap": "butt" }));
        at += sweep;
      });

      var headlineCount = opts.headline == null ? 1 : opts.headline;
      var headlineValue = segs.slice(0, headlineCount)
        .reduce(function (a, s) { return a + s.value; }, 0);
      if (headlineValue > 0) {
        var di = arcPath(R_INNER, 0, headlineValue / total * 360);
        svg.appendChild(di === null
          ? el("circle", { cx: C, cy: C, r: R_INNER, fill: "none",
              stroke: opts.color || "var(--accent)", "stroke-width": W_INNER, class: "donut-arc" })
          : el("path", { d: di, fill: "none", stroke: opts.color || "var(--accent)",
              "stroke-width": W_INNER, "stroke-linecap": "round", class: "donut-arc" }));
      }
    }

    mount.appendChild(svg);

    var centre = document.createElement("div");
    centre.className = "donut-centre";
    centre.innerHTML =
      '<span class="donut-value">' + opts.value + "</span>" +
      (opts.total != null ? '<span class="donut-total">' + opts.total + "</span>" : "");
    mount.appendChild(centre);
  }

  window.ClinCogDonut = { render: render };
})();
