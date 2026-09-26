/* ============================================================
   charts.js — the two figures every case report needs.

   Both were previously per-case: the depression report referenced
   .t-track / .t-marker / .t-big, none of which had a single line of CSS
   anywhere, so the severity bar rendered as stacked bare text; and the
   normal curve existed only inside anxiety-eval.html, drawn in a
   hardcoded teal on a hardcoded white ground, so it could not be reused
   and did not survive dark mode.

   Both read their colours from the design tokens at draw time and
   redraw on resize and on a theme change.

      ClinCharts.severityBar(el, {
        score, max, bands: [{ to: 4, label: "Minimal" }, ...]
      });

      ClinCharts.normalCurve(el, { mean, sd, raw, label });

   `el` is an element or an id.
   ============================================================ */
(function () {
  "use strict";

  function node(el) { return typeof el === "string" ? document.getElementById(el) : el; }
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  /* getComputedStyle hands back color-mix() results as color(srgb ...) and
     canvas cannot parse those, so every colour is resolved through a probe
     element and comes back as something canvas accepts. */
  var probe = null;
  function resolve(value, fallback) {
    try {
      /* Re-attached if it ever leaves the document: getComputedStyle on a
         detached node returns empty strings, which turned every resolved
         colour into black. */
      if (!probe || !probe.isConnected) {
        probe = document.createElement("span");
        probe.style.display = "none";
        document.body.appendChild(probe);
      }
      probe.style.color = "";
      probe.style.color = value;
      var out = getComputedStyle(probe).color;
      return out && out !== "rgba(0, 0, 0, 0)" ? out : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function rgbParts(value) {
    var m = String(value).match(/[\d.]+/g);
    if (!m) return [0, 0, 0];
    var n = m.slice(0, 3).map(Number);
    /* color() serialises components as 0-1, rgb() as 0-255. */
    return String(value).indexOf("color(") === 0 ? n.map(function (x) { return x * 255; }) : n;
  }
  function mix(a, b, ratio) {
    var A = rgbParts(a), B = rgbParts(b);
    return "rgb(" + [0, 1, 2].map(function (i) {
      return Math.round(A[i] * ratio + B[i] * (1 - ratio));
    }).join(",") + ")";
  }

  /* ---------------------------------------------------------------
     Severity bar: the full scale as bands, with a marker on the score.
     Monochrome by design - the evaluation pages carry no case colour,
     and a red-to-green ramp would read as a verdict rather than as a
     position on a published scale.
     --------------------------------------------------------------- */
  var bars = [];
  function severityBar(el, opts) {
    var host = node(el);
    if (!host) return;
    /* The band colours are baked in at render time, so a theme switch has
       to re-render them. */
    if (!bars.some(function (b) { return b.host === host; })) bars.push({ host: host, opts: opts });
    else bars.forEach(function (b) { if (b.host === host) b.opts = opts; });
    var max = opts.max;
    var bands = opts.bands || [];
    var score = Math.max(0, Math.min(max, Number(opts.score) || 0));
    var answered = opts.answered;

    var active = -1;
    for (var i = 0; i < bands.length; i++) {
      if (score <= bands[i].to) { active = i; break; }
    }
    if (active < 0) active = bands.length - 1;

    var from = 0;
    var segs = bands.map(function (b, i) {
      var width = ((b.to - from + (i === 0 ? 1 : 0)) / (max + 1)) * 100;
      from = b.to + 1;
      /* Each band a step darker than the one before it, so the ramp reads
         as increasing severity without introducing a hue. The mix is done
         here rather than in a color-mix() inline style: the evaluation
         pages redefine --ink locally and on one of them the substitution
         produced an invalid colour, which silently painted every band
         transparent. */
      var strength = (8 + i * (34 / Math.max(1, bands.length - 1))) / 100;
      var bg = mix(
        resolve(css("--text-primary", "#1a1a1a"), "#1a1a1a"),
        resolve(css("--bg-surface-alt", "#f4f4f5"), "#f4f4f5"),
        strength
      );
      return (
        '<div class="sev-seg' + (i === active ? " is-active" : "") + '"' +
        ' style="flex:' + width.toFixed(3) + ";background:" + bg + '"' +
        ' title="' + b.label + '"><span>' + b.label + "</span></div>"
      );
    });

    var pos = (score / max) * 100;
    /* The screening cut-off, drawn on the scale itself. It is an editable
       benchmark, so this is what makes that field visible in the report. */
    var cut = "";
    if (opts.cutoff != null && opts.cutoff > 0 && opts.cutoff < max) {
      cut = '<div class="sev-cut" style="left:' + ((opts.cutoff / max) * 100).toFixed(2) +
            '%"><span>cut-off ' + opts.cutoff + "</span></div>";
    }
    host.classList.add("sev");
    host.innerHTML =
      '<div class="sev-head">' +
        '<div class="sev-score"><strong>' + score + "</strong><span>/ " + max + "</span></div>" +
        '<div class="sev-band">' + (bands[active] ? bands[active].label : "") + "</div>" +
        (answered ? '<div class="sev-answered">' + answered + "</div>" : "") +
      "</div>" +
      '<div class="sev-track">' + segs.join("") + cut +
        '<div class="sev-marker" style="left:' + pos.toFixed(2) + '%"><span>' + score + "</span></div>" +
      "</div>" +
      '<div class="sev-axis"><span>0</span><span>' + max + "</span></div>";
  }

  /* ---------------------------------------------------------------
     Normal curve with the case marked on it. T scores are N(50,10) by
     construction, so the curve is the same shape for every instrument
     and only the marker moves.
     --------------------------------------------------------------- */
  function normalCDF(z) {
    /* Abramowitz & Stegun 26.2.17, accurate to ~7.5e-8 - plenty for a
       percentile printed to the nearest whole number. */
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989422804014327 * Math.exp(-z * z / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
  }


  /* ---------------------------------------------------------------
     Standardising a questionnaire total against a published norm.

     The percentile table is always the primary route, because it is what
     the source papers actually publish and because both distributions are
     heavily floor-weighted (41% of the PHQ-9 sample and 48% of the GAD-7
     sample score zero) - a linear T from a mean and an SD would assume a
     normal shape the data do not have. The normalized T returned here is
     the same percentile expressed on the familiar 50/10 scale, which is
     what makes the bell curve an honest picture of it: after the
     transformation the reference distribution is normal by construction.

     A mean and SD, where the paper reports them, are carried through for
     display only.
     --------------------------------------------------------------- */
  function probit(p) {
    /* Acklam's rational approximation, |error| < 1.15e-9 - far tighter
       than a percentile printed to one decimal place needs. */
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
    var pl = 0.02425, q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if (p > 1 - pl) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }

  function standardise(normId, raw, opts) {
    var def = (window.CLINCOG_NORMS || {})[normId];
    if (!def || !def.percentiles) return null;
    var live = (window.ClinCog && ClinCog.getBenchmark) ? ClinCog.getBenchmark(normId, def) : def;
    /* Where the source publishes separate male and female norm tables and
       the case states a sex, the matching table is the better comparison;
       otherwise the total sample stands. */
    var sex = opts && opts.sex;
    var table = def.percentiles;
    var group = 'total sample';
    var moments = null;
    if (sex && def.percentilesBySex && def.percentilesBySex[sex]) {
      table = def.percentilesBySex[sex];
      group = sex + ' subsample';
      if (def.momentsBySex && def.momentsBySex[sex]) moments = def.momentsBySex[sex];
    }
    var keys = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
    var used = keys[0];
    for (var i = 0; i < keys.length; i++) if (keys[i] <= raw) used = keys[i];
    var pct = table[used];
    /* The published tables print ">99.9" at the top, stored as 99.9; the
       probit of exactly 1 is infinite, so the value is clamped either way. */
    var p = Math.min(0.999, Math.max(0.001, pct / 100));
    /* An instructor override always wins; otherwise the subgroup moments
       where one applies, then the published total-sample values. */
    var overridden = live && live.mean != null && def.mean !== live.mean;
    return {
      pct: pct,
      t: 50 + 10 * probit(p),
      exact: table[raw] !== undefined,
      usedScore: used,
      group: group,
      mean: overridden || !moments ? (live && live.mean != null ? Number(live.mean) : null) : moments.mean,
      sd: overridden || !moments ? (live && live.sd != null ? Number(live.sd) : null) : moments.sd,
      cutoff: live && live.cutoff != null ? Number(live.cutoff) : null,
      sample: def.sample,
      citation: (live && live.citation) || def.citation,
    };
  }


  /* ---------------------------------------------------------------
     Distribution panel. The same picture the addiction report drew in
     Plotly - a reference normal with the elevation bands shaded and the
     case marked - rebuilt on the shared canvas so every case has it and
     no report needs a charting library for it.
     --------------------------------------------------------------- */
  function drawPanel(host, opts) {
    var canvas = host.querySelector("canvas");
    if (!canvas) return;
    var W = Math.max(240, host.clientWidth || 420);
    var H = opts.height || 190;
    var DPR = window.devicePixelRatio || 1;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var line = resolve(css("--select-line", "#527363"), "#527363");
    var fill = resolve(css("--select-fill", "#eef3f1"), "#eef3f1");
    var grid = resolve(css("--border", "#e4e4e7"), "#e4e4e7");
    var faint = resolve(css("--text-tertiary", "#706c65"), "#706c65");
    var ink = resolve(css("--text-primary", "#1a1a1a"), "#1a1a1a");
    var alt = resolve(css("--bg-surface-alt", "#f4f4f5"), "#f4f4f5");

    var tMin = 25, tMax = 80;
    var padL = 12, padR = 12, padT = 26, padB = 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var baseY = H - padB;
    function x(v) { return padL + ((v - tMin) / (tMax - tMin)) * plotW; }
    function dens(v) { var z = (v - 50) / 10; return Math.exp(-0.5 * z * z); }
    function y(d) { return baseY - d * plotH * 0.86; }

    /* Elevation bands, as two steps of the same neutral rather than the
       amber/red pair: a colour ramp here reads as a verdict, and these
       pages carry no clinical colour anywhere else. */
    [[60, 70, 0.10], [70, tMax, 0.20]].forEach(function (b) {
      ctx.fillStyle = mix(ink, alt, b[2]);
      ctx.fillRect(x(b[0]), padT, x(b[1]) - x(b[0]), baseY - padT);
    });

    ctx.beginPath();
    ctx.moveTo(x(tMin), baseY);
    for (var v = tMin; v <= tMax; v += 0.5) ctx.lineTo(x(v), y(dens(v)));
    ctx.lineTo(x(tMax), baseY);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();

    ctx.beginPath();
    for (var v2 = tMin; v2 <= tMax; v2 += 0.5) {
      var px = x(v2), py = y(dens(v2));
      v2 === tMin ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.beginPath(); ctx.moveTo(padL, baseY); ctx.lineTo(W - padR, baseY);
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.stroke();

    ctx.setLineDash([3, 3]);
    [[50, faint], [60, faint], [70, faint]].forEach(function (g) {
      ctx.beginPath(); ctx.moveTo(x(g[0]), padT); ctx.lineTo(x(g[0]), baseY);
      ctx.strokeStyle = g[1]; ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.setLineDash([]);

    ctx.fillStyle = faint;
    ctx.font = "400 9px 'DM Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("mean", x(50), padT - 8);
    ctx.fillText("T60", x(60), padT - 8);
    ctx.fillText("T70", x(70), padT - 8);
    [30, 40, 50, 60, 70, 80].forEach(function (v3) { ctx.fillText(String(v3), x(v3), baseY + 13); });

    if (opts.t != null) {
      var clamped = Math.min(Math.max(opts.t, tMin), tMax);
      var mx = x(clamped), my = y(dens(clamped));
      ctx.beginPath();
      ctx.moveTo(mx, my - 16); ctx.lineTo(mx - 6, my - 26); ctx.lineTo(mx + 6, my - 26);
      ctx.closePath();
      ctx.fillStyle = ink; ctx.fill();
      ctx.beginPath(); ctx.moveTo(mx, my - 14); ctx.lineTo(mx, baseY);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = "600 11px 'DM Mono', ui-monospace, monospace";
      var label = "T = " + opts.t.toFixed(1) + (opts.t > tMax ? " (off scale)" : "");
      var lw = ctx.measureText(label).width;
      var lx = Math.min(Math.max(mx, padL + lw / 2 + 2), W - padR - lw / 2 - 2);
      var ly = Math.max(padT + 10, my - 32);
      /* A plate behind the label: at high T the marker sits inside the
         shaded band and plain text on it is hard to read. */
      ctx.fillStyle = resolve(css("--bg-surface", "#ffffff"), "#ffffff");
      ctx.fillRect(lx - lw / 2 - 4, ly - 10, lw + 8, 14);
      ctx.fillStyle = ink;
      ctx.fillText(label, lx, ly);
    }
    ctx.textAlign = "left";
  }

  var panels = [];
  function distribution(el, items) {
    var host = node(el);
    if (!host) return;
    host.classList.add("dist-row");
    host.innerHTML = items.map(function (it) {
      return '<figure class="dist-panel"><figcaption>' + it.label + "</figcaption><canvas></canvas>" +
        (it.note ? '<p class="dist-note">' + it.note + "</p>" : "") + "</figure>";
    }).join("");
    var hosts = host.querySelectorAll(".dist-panel");
    items.forEach(function (it, i) {
      if (!hosts[i]) return;
      if (!panels.some(function (p) { return p.host === hosts[i]; })) panels.push({ host: hosts[i], opts: it });
      else panels.forEach(function (p) { if (p.host === hosts[i]) p.opts = it; });
      drawPanel(hosts[i], it);
    });
  }

  /* ---------------------------------------------------------------
     T-score bars, in the shape the other three reports already used:
     a hatched rail, the average band shaded, the mean marked, one row
     per subscale. Replaces the addiction report's Plotly bar chart.
     --------------------------------------------------------------- */
  function tBars(el, rows, opts) {
    var host = node(el);
    if (!host) return;
    opts = opts || {};
    var min = opts.min != null ? opts.min : 30;
    var max = opts.max != null ? opts.max : 80;
    var lastGroup = null;
    host.classList.add("tbars");
    host.innerHTML = rows.map(function (r) {
      var head = "";
      if (r.group && r.group !== lastGroup) {
        head = '<div class="tbars-group">' + r.group + "</div>";
        lastGroup = r.group;
      }
      var clamped = Math.max(min, Math.min(max, r.t));
      var pct = ((clamped - min) / (max - min)) * 100;
      var over = r.t > max;
      return head +
        '<div class="tbars-row">' +
          '<div class="tbars-label">' + r.label + "</div>" +
          '<div class="tbars-track"><div class="tbars-rail">' +
            '<div class="tbars-norm"></div>' +
            '<div class="tbars-fill" style="width:' + pct.toFixed(1) + '%"></div>' +
            '<div class="tbars-mid"></div>' +
          "</div></div>" +
          '<div class="tbars-val">T = ' + r.t.toFixed(0) + (over ? " \u25b8" : "") + "</div>" +
        "</div>";
    }).join("") +
    '<div class="tbars-axis"><span>' + min + "</span><span>50</span><span>" + max + "+</span></div>";
  }

  var registry = [];

  function drawCurve(host, opts) {
    var canvas = host.querySelector("canvas");
    if (!canvas) return;
    var W = Math.max(280, host.clientWidth || 560);
    var H = opts.height || 150;
    var DPR = window.devicePixelRatio || 1;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    var ctx = canvas.getContext("2d");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var line = resolve(css("--select-line", "#527363"), "#527363");
    var fill = resolve(css("--select-fill", "#eef3f1"), "#eef3f1");
    var grid = resolve(css("--border", "#e4e4e7"), "#e4e4e7");
    var faint = resolve(css("--text-tertiary", "#706c65"), "#706c65");
    var ink = resolve(css("--text-primary", "#1a1a1a"), "#1a1a1a");
    var surface = resolve(css("--bg-surface", "#ffffff"), "#ffffff");

    /* Either a T computed here from a mean and an SD, or one handed in
       already standardised - the questionnaire norms come from percentile
       tables, not from a mean and an SD. */
    var t = opts.t != null ? opts.t : 50 + ((opts.raw - opts.mean) / opts.sd) * 10;
    var pct = opts.pct != null ? opts.pct : normalCDF((t - 50) / 10) * 100;

    var tMin = 20, tMax = 80;
    var padL = 26, padR = 12, padT = 16, padB = 26;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var baseY = H - padB;

    function x(v) { return padL + ((v - tMin) / (tMax - tMin)) * plotW; }
    function dens(v) { var z = (v - 50) / 10; return Math.exp(-0.5 * z * z); }
    function y(d) { return baseY - d * plotH * 0.9; }

    var clamped = Math.min(Math.max(t, tMin), tMax);

    ctx.beginPath();
    ctx.moveTo(x(tMin), baseY);
    for (var v = tMin; v <= clamped; v += 0.5) ctx.lineTo(x(v), y(dens(v)));
    ctx.lineTo(x(clamped), baseY);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    for (var v2 = tMin; v2 <= tMax; v2 += 0.5) {
      var px = x(v2), py = y(dens(v2));
      v2 === tMin ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padL, baseY);
    ctx.lineTo(W - padR, baseY);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(x(50), padT);
    ctx.lineTo(x(50), baseY);
    ctx.strokeStyle = grid;
    ctx.stroke();
    ctx.setLineDash([]);

    var mx = x(clamped);
    ctx.beginPath();
    ctx.moveTo(mx, padT);
    ctx.lineTo(mx, baseY);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.stroke();

    var boxW = 92, boxH = 34;
    var bx = mx + 8;
    if (bx + boxW > W - padR) bx = mx - boxW - 8;
    /* A marker at either extreme would push the box off the canvas, so it
       is clamped inside the plot whichever side it ended up on. */
    bx = Math.max(padL, Math.min(bx, W - padR - boxW));
    var by = padT;
    ctx.fillStyle = surface;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 4);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = "500 11px 'DM Mono', ui-monospace, monospace";
    ctx.fillText("T = " + t.toFixed(1), bx + 8, by + 14);
    ctx.fillStyle = faint;
    ctx.font = "400 10px 'DM Mono', ui-monospace, monospace";
    ctx.fillText(pct.toFixed(0) + "th %ile", bx + 8, by + 27);

    ctx.fillStyle = faint;
    ctx.font = "400 9px 'DM Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    [20, 30, 40, 50, 60, 70, 80].forEach(function (v3) {
      ctx.fillText(String(v3), x(v3), baseY + 13);
    });
    ctx.textAlign = "left";
  }

  function normalCurve(el, opts) {
    var host = node(el);
    if (!host) return;
    host.classList.add("ncurve");
    if (!host.querySelector("canvas")) {
      host.innerHTML =
        (opts.label ? '<div class="ncurve-label">' + opts.label + "</div>" : "") +
        "<canvas></canvas>" +
        /* The caller can carry the explanation itself - the questionnaire
           reports print a fuller note with the percentile and the source
           right underneath, and two versions of the same sentence read as
           a mistake. */
        (opts.key === false ? "" :
          '<div class="ncurve-key">' +
          (opts.key || "Community norm, T scores (mean 50, SD 10). The shaded area is the proportion of the reference group scoring below this case.") +
          "</div>");
    }
    registry.push({ host: host, opts: opts });
    drawCurve(host, opts);
  }

  function redrawAll() {
    registry.forEach(function (r) {
      if (r.host.isConnected) drawCurve(r.host, r.opts);
    });
    bars.forEach(function (b) {
      if (b.host.isConnected) severityBar(b.host, b.opts);
    });
    panels.forEach(function (p) {
      if (p.host.isConnected) drawPanel(p.host, p.opts);
    });
  }

  var t = null;
  window.addEventListener("resize", function () {
    clearTimeout(t);
    t = setTimeout(redrawAll, 120);
  });
  /* The canvas is pixels, not CSS, so a theme switch has to repaint it. */
  if (window.matchMedia) {
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawAll);
    } catch (e) { /* older Safari */ }
  }
  new MutationObserver(redrawAll).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"],
  });

  window.ClinCharts = {
    severityBar: severityBar,
    normalCurve: normalCurve,
    redraw: redrawAll,
    standardise: standardise,
    probit: probit,
    distribution: distribution,
    tBars: tBars,
  };
})();
