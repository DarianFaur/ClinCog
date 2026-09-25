/* ClinCog — "Try the task yourself" modules for the schizophrenia and depression
   cases. Four open re-implementations written for this platform:

     tmt  Trail-making, part A style: connect 1-25 in order
     lns  Letter-number sequencing: reorder a mixed series
     swm  Spatial working memory: search boxes for tokens
     tol  Tower of London: rearrange balls to match a goal

   None of these is a MATRICS (MCCB) or CANTAB instrument, and none reproduces
   their items, stimuli, timings, scoring or norms. They follow the published
   paradigms in outline so that a student can experience what the patient in
   the case did. A student's results stay on screen: they are not stored, not
   sent anywhere, not added to the report and not compared with the patient.

   Paradigms (see THIRD_PARTY_NOTICES.md for full references):
     tmt  Reitan (1958), Perceptual and Motor Skills 8(3):271-276
     lns  Gold et al. (1997), Archives of General Psychiatry 54(2):159-165
     swm  Owen et al. (1990), Neuropsychologia 28(10):1021-1034
     tol  Shallice (1982), Phil Trans R Soc Lond B 298(1089):199-209

   Usage: <div data-try-task="tmt"></div>, then TryTasks.mountAll() runs on load. */
(function () {
  'use strict';

  // ---------- shared helpers --------------------------------------------------
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const colours = () => ({
    bg: css('--bg-surface-alt') || '#f1efec',
    ink: css('--text-primary') || '#1a1a1a',
    muted: css('--text-secondary') || '#6e6a64',
    accent: css('--ink') || '#3b332c',
    danger: css('--danger') || '#c03e3e',
    surface: css('--bg-surface') || '#ffffff',
  });
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const el = (tag, attrs = {}, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  // Canvas that stays sharp and maps pointer events to its own coordinates.
  function makeCanvas(host, w, h) {
    const c = el('canvas', { width: w, height: h, style: 'display:block;width:100%;max-width:' + w + 'px;border-radius:10px;touch-action:manipulation;cursor:pointer' });
    host.appendChild(c);
    const point = ev => {
      const r = c.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * (c.width / r.width), y: (ev.clientY - r.top) * (c.height / r.height) };
    };
    return { c, ctx: c.getContext('2d'), point };
  }
  // ---------- expand ---------------------------------------------------------
  // The demos run inside a panel a few hundred pixels tall, which is the wrong
  // size for a timed task. "Expand" lifts the task into a centred panel over a
  // dimmed page - the same move as the ICD-11 widget's info panel - rather than
  // taking the whole screen. The host element itself is repositioned, so no DOM
  // is moved and no handler is rebound; a running task keeps running.
  const EXP_STYLE = `
    .tt-backdrop {
      position: fixed; inset: 0; z-index: 940;
      background: rgba(20,18,16,.48);
      -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
    }
    .tt-host.tt-expanded {
      position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
      z-index: 950; max-width: 94vw; max-height: 94vh; overflow: auto;
      background: var(--bg-surface); color: var(--text-primary);
      border: 1px solid var(--border); border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg); padding: clamp(14px, 1.8vw, 26px);
    }
    .tt-host.tt-expanded > .tt-close { position: sticky; top: 0; z-index: 2; display: block; margin: 0 0 10px auto; }
    /* the collapsed canvas is capped at its own drawing width; expanded, the
       size is computed instead, so that cap has to come off */
    .tt-host.tt-expanded canvas { max-width: none !important; }
    html.tt-locked, html.tt-locked body { overflow: hidden; }
    @media (prefers-reduced-motion: no-preference) {
      .tt-host.tt-expanded { animation: tt-pop .16s var(--ease-standard, ease-out) both; }
      @keyframes tt-pop { from { opacity: 0; transform: translate(-50%, -48%) scale(.99); } }
    }
  `;
  let expStyleAdded = false;

  // The panel is sized from the viewport, not from a fixed pixel width: the
  // canvas is grown until it hits either the available width or the available
  // height, and the panel is then cut to the canvas. Without the height half
  // of that, a 13-inch laptop got a panel taller than its screen (hence the
  // scrollbar) while a 27-inch monitor got the same 1080px box it had before.
  function fitExpanded(host) {
    const c = host.querySelector('canvas');
    const cs = getComputedStyle(host);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.min(window.innerWidth * 0.94, 1760) - padX;
    const availH = window.innerHeight * 0.94 - padY - 4;
    if (!c || !c.width || !c.height) { host.style.width = Math.round(availW + padX) + 'px'; return; }
    const ar = c.width / c.height;
    // The panel's width is settled first and never depends on the canvas:
    // sizing the two against each other made the instruction text re-wrap,
    // which changed the height left for the canvas, which changed the width.
    // Past roughly twice its drawing width the canvas is only an upscaled
    // bitmap, so that is the ceiling.
    const panelW = Math.min(availW, c.width * 2);
    host.style.width = Math.round(panelW + padX) + 'px';
    c.style.width = '0px'; c.style.height = '0px';
    const other = host.scrollHeight - padY;
    const w = Math.max(240, Math.min(panelW, Math.max(120, availH - other) * ar));
    c.style.width = Math.round(w) + 'px';
    c.style.height = Math.round(w / ar) + 'px';
    c.style.marginInline = 'auto';
  }

  function addExpand(host, row) {
    if (!expStyleAdded) { document.head.appendChild(el('style', {}, EXP_STYLE)); expStyleAdded = true; }
    host.classList.add('tt-host');
    const b = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, 'Expand');
    let back = null;
    const onResize = () => fitExpanded(host);
    const close = () => {
      if (!back) return;
      host.classList.remove('tt-expanded');
      const x = host.querySelector(':scope > .tt-close'); if (x) x.remove();
      const c = host.querySelector('canvas');
      if (c) { c.style.width = ''; c.style.height = ''; c.style.marginInline = ''; }
      host.style.width = '';
      document.documentElement.classList.remove('tt-locked');
      back.remove(); back = null;
      b.textContent = 'Expand';
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const open = () => {
      back = el('div', { class: 'tt-backdrop' });
      back.addEventListener('click', close);
      document.body.appendChild(back);
      const x = el('button', { type: 'button', class: 'btn btn-secondary btn-sm tt-close' }, 'Close');
      x.addEventListener('click', close);
      host.insertBefore(x, host.firstChild);
      host.classList.add('tt-expanded');
      document.documentElement.classList.add('tt-locked');
      fitExpanded(host);
      b.textContent = 'Close';
      document.addEventListener('keydown', onKey);
      window.addEventListener('resize', onResize);
    };
    b.addEventListener('click', () => (back ? close() : open()));
    row.appendChild(b);
    return b;
  }

  // A small frame shared by every task: status line, start button, result box.
  function frame(host, intro) {
    const p = el('p', { style: 'font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 12px;max-width:var(--measure)' }, intro);
    // scroll-margin keeps the stage clear of the fixed top bar when it is
    // brought into view, so no part of the task starts hidden under it.
    const stage = el('div', { class: 'tt-stage', style: 'margin:0 0 12px;scroll-margin-top:calc(var(--topbar-h, 72px) + 12px)' });
    const row = el('div', { class: 'tt-row', style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' });
    const btn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Start');
    const status = el('span', { style: 'font-size:var(--text-sm);color:var(--text-secondary)' });
    const result = el('div', { class: 'tt-result', style: 'margin-top:12px;font-size:var(--text-sm);line-height:1.6', 'aria-live': 'polite' });
    row.append(btn, status);
    host.append(p, stage, row, result);
    addExpand(host, row);
    btn.addEventListener('click', () => stage.scrollIntoView({ block: 'start' }));
    return { stage, btn, status, result };
  }
  function showResult(box, rows) {
    box.textContent = '';
    const t = el('table', { style: 'border-collapse:collapse;width:100%;max-width:440px' });
    for (const [k, v] of rows) {
      const tr = el('tr');
      tr.append(el('td', { style: 'padding:5px 0;box-shadow:inset 0 -1px 0 var(--border)' }, k),
                el('td', { style: 'padding:5px 0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;box-shadow:inset 0 -1px 0 var(--border)' }, v));
      t.appendChild(tr);
    }
    box.append(el('div', { style: 'font-weight:600;margin-bottom:4px' }, 'Your run'), t,
      el('p', { style: 'margin:8px 0 0;font-size:var(--text-xs);color:var(--text-tertiary)' },
        'Shown on this screen only. Not saved, not added to the report and not compared with the patient. ' +
        'A single run has low reliability for one person and no diagnostic value.'));
  }

  // ---------- 1. trail-making, part A style ---------------------------------
  function tmt(host) {
    const f = frame(host, 'Click the circles in order, 1, 2, 3 \u2026 up to 25, as quickly as you can. A wrong click is counted but does not stop the task.');
    const W = 640, H = 420, R = 18, N = 25;
    const { c, ctx, point } = makeCanvas(f.stage, W, H);
    let pts = [], next = 0, errors = 0, t0 = 0, running = false, flash = -1;

    function layout() {
      pts = [];
      let guard = 0;
      while (pts.length < N && guard++ < 20000) {
        const p = { x: R + 12 + Math.random() * (W - 2 * R - 24), y: R + 12 + Math.random() * (H - 2 * R - 24) };
        if (pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 3.1 * R)) pts.push(p);
      }
    }
    function draw() {
      const k = colours();
      ctx.fillStyle = k.bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = k.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < next; i++) { const p = pts[i]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.stroke();
      pts.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
        ctx.fillStyle = i === flash ? k.danger : i < next ? k.accent : k.surface; ctx.fill();
        ctx.strokeStyle = k.ink; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = i < next || i === flash ? '#fff' : k.ink;
        ctx.font = '600 15px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), p.x, p.y + 1);
      });
    }
    c.addEventListener('pointerdown', ev => {
      if (!running) return;
      const q = point(ev);
      const hit = pts.findIndex(p => Math.hypot(p.x - q.x, p.y - q.y) <= R + 4);
      if (hit < 0) return;
      if (hit === next) {
        next++; flash = -1;
        if (next === N) {
          running = false;
          const secs = ((performance.now() - t0) / 1000).toFixed(1);
          f.status.textContent = 'Done.'; f.btn.textContent = 'Run again'; f.btn.disabled = false;
          showResult(f.result, [['Completion time', secs + ' s'], ['Errors', String(errors)]]);
        } else f.status.textContent = 'Next: ' + (next + 1);
      } else if (hit >= next) {
        errors++; flash = hit;
        setTimeout(() => { flash = -1; draw(); }, 250);
      }
      draw();
    });
    f.btn.addEventListener('click', () => {
      layout(); next = 0; errors = 0; flash = -1; running = true; t0 = performance.now();
      f.btn.disabled = true; f.result.textContent = ''; f.status.textContent = 'Next: 1';
      draw();
    });
    host.__probe = () => ({ pts: pts.map(p => ({ ...p })), next, errors, running, W, H });
    layout(); draw();
  }

  // ---------- 2. letter-number sequencing -----------------------------------
  function lns(host) {
    const f = frame(host, 'A mix of numbers and letters appears one at a time. Afterwards, type the numbers in ascending order, then the letters in alphabetical order. The series get longer until two at the same length are missed, up to eight items.');
    f.stage.append(el('p', { style: 'margin:0 0 8px;font-size:var(--text-xs);color:var(--text-tertiary)' },
      'In the original paradigm the series is read aloud. Here it is shown on screen, which is a real difference: treat it as an illustration, not as the same task.'));
    const show = el('div', { class: 'tt-show', style: 'height:96px;display:flex;align-items:center;justify-content:center;font:600 44px/1 Inter, sans-serif;background:var(--bg-surface-alt);border-radius:10px;letter-spacing:.04em' });
    const form = el('div', { style: 'display:none;gap:8px;margin-top:10px;flex-wrap:wrap' });
    const input = el('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Your answer', style: 'flex:1;min-width:180px;padding:10px 12px;border-radius:8px;border:1px solid var(--border);font:500 16px Inter, sans-serif' });
    const ok = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Submit');
    form.append(input, ok); f.stage.append(show, form);
    const LETTERS = 'BCDFGHJKLMNPRSTVXZ'.split(''), NUMS = '123456789'.split('');
    let len = 2, trial = 0, missesAtLen = 0, correct = 0, longest = 0, current = null;

    function series(n) {
      const nNum = Math.ceil(n / 2), nLet = n - nNum;
      const items = shuffle(NUMS.slice()).slice(0, nNum).concat(shuffle(LETTERS.slice()).slice(0, nLet));
      // alternate as far as possible so the task is sequencing, not grouping
      const a = items.filter(x => /\d/.test(x)), b = items.filter(x => !/\d/.test(x)); const out = [];
      while (a.length || b.length) { if (a.length) out.push(a.shift()); if (b.length) out.push(b.shift()); }
      return Math.random() < 0.5 ? out : out.reverse();
    }
    const answer = s => s.filter(x => /\d/.test(x)).sort().concat(s.filter(x => !/\d/.test(x)).sort()).join('');
    function present() {
      current = series(len); form.style.display = 'none'; input.value = '';
      f.status.textContent = 'Length ' + len + ', series ' + (trial + 1) + ' of 2';
      let i = 0;
      const tick = () => {
        if (i < current.length) { show.textContent = current[i++]; setTimeout(() => { show.textContent = ''; setTimeout(tick, 250); }, 900); }
        else { show.textContent = '?'; form.style.display = 'flex'; input.focus(); }
      };
      tick();
    }
    function submit() {
      const given = input.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
      const right = given === answer(current);
      if (right) { correct++; longest = Math.max(longest, len); } else missesAtLen++;
      trial++;
      if (trial === 2) {
        if (missesAtLen === 2 || len === 8) { return finish(); }
        len++; trial = 0; missesAtLen = 0;
      }
      present();
    }
    function finish() {
      form.style.display = 'none'; show.textContent = '\u2713';
      f.status.textContent = 'Done.'; f.btn.textContent = 'Run again'; f.btn.disabled = false;
      showResult(f.result, [['Series correct', String(correct)], ['Longest correct length', longest ? String(longest) : '\u2014']]);
    }
    ok.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    f.btn.addEventListener('click', () => {
      len = 2; trial = 0; missesAtLen = 0; correct = 0; longest = 0;
      f.btn.disabled = true; f.result.textContent = ''; present();
    });
    host.__probe = () => ({ current: current ? current.slice() : null, answer: current ? answer(current) : null, len, correct });
    show.textContent = '\u2014';
  }

  // ---------- 3. spatial working memory --------------------------------------
  function swm(host) {
    const f = frame(host, 'A token is hidden in one of the boxes. Open boxes by clicking until you find it. A box that has held a token will never hold one again, so search the others. There are eight rounds, working up from 3 boxes to 8.');
    const W = 560, H = 360, S = 54;
    const { c, ctx, point } = makeCanvas(f.stage, W, H);
    // Three rounds ended before the search strategy a student is meant to
    // notice had a chance to matter. Four set sizes, each run twice.
    const LEVELS = [3, 3, 4, 4, 6, 6, 8, 8];
    let level = 0, boxes = [], used = new Set(), openNow = new Set(), target = -1, reveal = -1, running = false;
    let found = 0, between = 0, within = 0; const perLevel = [];

    function layout(n) {
      boxes = []; let guard = 0;
      while (boxes.length < n && guard++ < 20000) {
        const b = { x: 20 + Math.random() * (W - S - 40), y: 20 + Math.random() * (H - S - 40) };
        if (boxes.every(o => Math.abs(o.x - b.x) > S + 18 || Math.abs(o.y - b.y) > S + 18)) boxes.push(b);
      }
    }
    function newSearch() {
      const free = boxes.map((_, i) => i).filter(i => !used.has(i));
      target = free[Math.floor(Math.random() * free.length)]; openNow = new Set(); reveal = -1;
    }
    function draw() {
      const k = colours();
      ctx.fillStyle = k.bg; ctx.fillRect(0, 0, W, H);
      boxes.forEach((b, i) => {
        const isOpen = openNow.has(i) || i === reveal;
        ctx.fillStyle = isOpen ? k.surface : k.accent;
        ctx.fillRect(b.x, b.y, S, S);
        ctx.strokeStyle = k.ink; ctx.lineWidth = 1.5; ctx.strokeRect(b.x, b.y, S, S);
        if (i === reveal) { ctx.beginPath(); ctx.arc(b.x + S / 2, b.y + S / 2, S / 4, 0, Math.PI * 2); ctx.fillStyle = k.danger; ctx.fill(); }
      });
      ctx.fillStyle = k.ink; ctx.font = '500 14px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('Tokens found: ' + found + ' / ' + boxes.length, W - 12, H - 24);
    }
    c.addEventListener('pointerdown', ev => {
      if (!running || reveal >= 0) return;
      const q = point(ev);
      const i = boxes.findIndex(b => q.x >= b.x && q.x <= b.x + S && q.y >= b.y && q.y <= b.y + S);
      if (i < 0) return;
      if (used.has(i)) between++;                 // a box that already gave up a token
      else if (openNow.has(i)) within++;          // reopened in the same search
      if (i === target) {
        reveal = i; used.add(i); found++; draw();
        setTimeout(() => {
          if (found === boxes.length) {
            perLevel.push({ n: boxes.length, between, within });
            level++;
            if (level < LEVELS.length) startLevel(); else finish();
          } else { newSearch(); draw(); }
        }, 650);
      } else { openNow.add(i); draw(); }
    });
    function startLevel() {
      layout(LEVELS[level]); used = new Set(); found = 0; between = 0; within = 0;
      f.status.textContent = 'Round ' + (level + 1) + ' of ' + LEVELS.length + ': ' + LEVELS[level] + ' boxes';
      newSearch(); draw();
    }
    function finish() {
      running = false; f.status.textContent = 'Done.'; f.btn.textContent = 'Run again'; f.btn.disabled = false;
      // Two rounds share each set size now, so the row has to name the round
      // as well, or the table shows the same label twice.
      const rows = perLevel.map((p, i) => ['Round ' + (i + 1) + ' \u00b7 ' + p.n + ' boxes \u2014 between / within errors', p.between + ' / ' + p.within]);
      rows.push(['Total between-search errors', String(perLevel.reduce((a, p) => a + p.between, 0))]);
      showResult(f.result, rows);
    }
    f.btn.addEventListener('click', () => {
      level = 0; perLevel.length = 0; running = true; f.btn.disabled = true; f.result.textContent = ''; startLevel();
    });
    host.__probe = () => ({ boxes: boxes.map(b => ({ ...b })), target, running, reveal, S, W, H, level });
    layout(3); draw();
  }

  // ---------- 4. Tower of London --------------------------------------------
  function tol(host) {
    const f = frame(host, 'Move the balls so the lower arrangement matches the goal shown above it. Click a peg to pick up its top ball, then click another peg to put it down. The pegs hold 3, 2 and 1 ball. Try to use the fewest moves shown. There are nine problems, from 2 moves up to 6.');
    f.stage.append(el('p', { style: 'margin:0 0 8px;font-size:var(--text-xs);color:var(--text-tertiary)' },
      'This is the classic move-by-move Tower of London. The CANTAB task in Darren\u2019s results (One Touch Stockings) asks for the number of moves without making them, so the two are related but not the same.'));
    const W = 560, H = 380;
    const { c, ctx, point } = makeCanvas(f.stage, W, H);
    const CAP = [3, 2, 1], BALL = ['#c0504d', '#4f81bd', '#9bbb59'];
    const key = s => s.map(p => p.join('')).join('|');
    const clone = s => s.map(p => p.slice());
    // Every legal arrangement, and the distance between two of them, found by
    // breadth-first search - so the minimum shown is exact, not assumed.
    function neighbours(s) {
      const out = [];
      for (let a = 0; a < 3; a++) if (s[a].length) for (let b = 0; b < 3; b++)
        if (a !== b && s[b].length < CAP[b]) { const t = clone(s); t[b].push(t[a].pop()); out.push(t); }
      return out;
    }
    function distances(start) {
      const d = new Map([[key(start), 0]]), q = [start], states = [start];
      while (q.length) { const s = q.shift(); for (const t of neighbours(s)) if (!d.has(key(t))) { d.set(key(t), d.get(key(s)) + 1); q.push(t); states.push(t); } }
      return { d, states };
    }
    const START = [[0, 1], [2], []];
    const { d: DIST, states: ALL } = distances(START);
    function pickProblems() {
      const want = [2, 2, 3, 3, 4, 4, 5, 5, 6], out = [];
      for (const w of want) {
        const pool = shuffle(ALL.filter(s => DIST.get(key(s)) === w && !out.some(o => key(o.goal) === key(s))));
        if (pool.length) out.push({ goal: pool[0], min: w });
      }
      return out;
    }
    let problems = [], pi = 0, state = null, held = -1, moves = 0, t0 = 0, running = false, log = [];

    function drawTower(s, ox, oy, scale, highlight) {
      const k = colours(), pegX = [0, 1, 2].map(i => ox + (i + 0.5) * (170 * scale)), r = 20 * scale;
      ctx.fillStyle = k.ink; ctx.fillRect(ox + 10 * scale, oy, 510 * scale - 20 * scale, 6 * scale);
      for (let i = 0; i < 3; i++) {
        const hPeg = (CAP[i] * 2 * r) + 10 * scale;
        ctx.fillStyle = highlight === i ? k.accent : k.muted;
        ctx.fillRect(pegX[i] - 3 * scale, oy - hPeg, 6 * scale, hPeg);
        s[i].forEach((ball, j) => {
          ctx.beginPath(); ctx.arc(pegX[i], oy - r - j * 2 * r, r - 2 * scale, 0, Math.PI * 2);
          ctx.fillStyle = BALL[ball]; ctx.fill();
        });
      }
      return pegX;
    }
    let pegs = [];
    function draw() {
      const k = colours();
      ctx.fillStyle = k.bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = k.muted; ctx.font = '500 13px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const label = (txt, x, y) => {
        // drawTower leaves fillStyle on the last ball it painted, so every
        // label re-states its own colour and font before drawing.
        ctx.fillStyle = k.muted; ctx.font = '500 13px Inter, sans-serif';
        ctx.fillText(txt, x, y);
      };
      label('Goal', 20, 14);
      if (problems[pi]) drawTower(problems[pi].goal, 20, 118, 0.55, -1);
      label('Your tower', 20, 150);
      pegs = drawTower(state || START, 20, 350, 1, held);
      ctx.textAlign = 'right';
      if (problems[pi]) label('Moves: ' + moves + '   Minimum: ' + problems[pi].min, W - 16, 14);
    }
    c.addEventListener('pointerdown', ev => {
      if (!running) return;
      const q = point(ev);
      if (q.y < 150) return;
      const i = pegs.findIndex(x => Math.abs(q.x - x) < 70);
      if (i < 0) return;
      if (held < 0) { if (state[i].length) held = i; }
      else if (i === held) held = -1;
      else if (state[i].length < CAP[i]) {
        state[i].push(state[held].pop()); held = -1; moves++;
        if (key(state) === key(problems[pi].goal)) {
          log.push({ min: problems[pi].min, moves, secs: (performance.now() - t0) / 1000 });
          pi++;
          if (pi === problems.length) { running = false; draw(); return finish(); }
          nextProblem(); return;
        }
      }
      draw();
    });
    function nextProblem() { state = clone(START); held = -1; moves = 0; t0 = performance.now(); f.status.textContent = 'Problem ' + (pi + 1) + ' of ' + problems.length; draw(); }
    function finish() {
      f.status.textContent = 'Done.'; f.btn.textContent = 'Run again'; f.btn.disabled = false;
      const perfect = log.filter(l => l.moves === l.min).length;
      const excess = log.reduce((a, l) => a + (l.moves - l.min), 0);
      showResult(f.result, [
        ['Problems solved in the minimum number of moves', perfect + ' / ' + log.length],
        ['Extra moves in total', String(excess)],
        ['Mean time per problem', (log.reduce((a, l) => a + l.secs, 0) / log.length).toFixed(1) + ' s'],
      ]);
    }
    f.btn.addEventListener('click', () => {
      problems = pickProblems(); pi = 0; log = []; running = true; f.btn.disabled = true; f.result.textContent = ''; nextProblem();
    });
    host.__probe = () => ({ state: state ? clone(state) : null, goal: problems[pi] ? clone(problems[pi].goal) : null, min: problems[pi] ? problems[pi].min : null, pegs: pegs.slice(), running, pi, total: problems.length, W, H, dist: s => DIST.get(key(s)) });
    state = clone(START); draw();
  }

  const TASKS = { tmt, lns, swm, tol };
  window.TryTasks = {
    mountAll() {
      document.querySelectorAll('[data-try-task]').forEach(host => {
        const fn = TASKS[host.dataset.tryTask];
        if (fn && !host.dataset.mounted) { host.dataset.mounted = '1'; fn(host); }
      });
    },
    _tasks: TASKS,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.TryTasks.mountAll());
  else window.TryTasks.mountAll();
})();
