// ============================================================
// a11y.js — the floating accessibility control, bottom-right on
// every page. Holds the theme switch (moved here from the top
// toolbar), text zoom, and a manual phone/desktop layout preview
// toggle. Include once per page, anywhere:
//   <script src="/a11y.js"></script>
// ============================================================

(function () {
  const THEME_KEY = "clincog_theme";
  const ZOOM_KEY = "clincog_zoom";
  const LAYOUT_KEY = "clincog_layout";
  const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.45];

  const css = `
  #ccg-fab-toggle{position:fixed;bottom:20px;right:20px;z-index:900;width:52px;height:52px;border-radius:50%;
    background:#2c3549;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;
    box-shadow:0 8px 24px rgba(20,25,40,.28);transition:transform .2s ease, box-shadow .2s ease;}
  #ccg-fab-toggle:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 12px 28px rgba(20,25,40,.34);}
  #ccg-fab-toggle svg{width:22px;height:22px;}
  #ccg-fab-panel{position:fixed;bottom:82px;right:20px;z-index:900;width:260px;background:var(--surface,#fff);
    color:var(--ink,#1c2029);border:1px solid var(--line,#e2e4ea);border-radius:18px;padding:18px;
    box-shadow:0 20px 44px rgba(20,25,40,.22);display:none;font-family:'Inter',system-ui,sans-serif;}
  #ccg-fab-panel.open{display:block;animation:ccg-fab-rise .18s ease both;}
  @keyframes ccg-fab-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .ccg-fab-row{margin-bottom:16px;}
  .ccg-fab-row:last-child{margin-bottom:0;}
  .ccg-fab-label{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
    color:var(--ink-faint,#949aa6);margin-bottom:8px;display:block;}
  .ccg-seg{display:flex;background:var(--surface-sunken,#eef0f4);border-radius:10px;padding:3px;gap:2px;}
  .ccg-seg button{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;
    border:none;background:none;border-radius:8px;cursor:pointer;color:var(--ink-muted,#5a5f6b);
    font-family:'Inter',sans-serif;font-size:11px;font-weight:600;transition:background .15s ease,color .15s ease;}
  .ccg-seg button svg{width:14px;height:14px;}
  .ccg-seg button.active{background:var(--surface,#fff);color:var(--brand,#5f7396);box-shadow:0 1px 3px rgba(20,25,40,.12);}
  .ccg-zoom-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
  .ccg-zoom-btn{width:34px;height:34px;border-radius:9px;border:1px solid var(--line,#e2e4ea);background:var(--surface,#fff);
    color:var(--ink,#1c2029);cursor:pointer;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;
    transition:border-color .15s ease,color .15s ease;}
  .ccg-zoom-btn:hover{border-color:var(--brand,#5f7396);color:var(--brand,#5f7396);}
  .ccg-zoom-btn:disabled{opacity:.35;cursor:not-allowed;}
  .ccg-zoom-val{font-family:'DM Mono',monospace;font-size:12px;color:var(--ink-muted,#5a5f6b);min-width:38px;text-align:center;}
  #ccg-fab-backdrop{position:fixed;inset:0;z-index:899;display:none;}
  #ccg-fab-backdrop.open{display:block;}
  `;
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));

  const backdrop = document.createElement("div");
  backdrop.id = "ccg-fab-backdrop";
  document.body.appendChild(backdrop);

  const toggle = document.createElement("button");
  toggle.id = "ccg-fab-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Accessibility and display options");
  toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="1.4" fill="currentColor" stroke="none"/><path d="M7 11.5c1.5.7 3.2 1 5 1s3.5-.3 5-1M12 12.5V17M9.5 17l-1 3M14.5 17l1 3"/></svg>`;
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.id = "ccg-fab-panel";
  panel.innerHTML = `
    <div class="ccg-fab-row">
      <span class="ccg-fab-label">Theme</span>
      <div class="ccg-seg" id="ccg-fab-theme" role="radiogroup" aria-label="Theme">
        <button type="button" data-mode="light" aria-label="Light theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          Light
        </button>
        <button type="button" data-mode="system" aria-label="System theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>
          Auto
        </button>
        <button type="button" data-mode="dark" aria-label="Dark theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>
          Dark
        </button>
      </div>
    </div>
    <div class="ccg-fab-row">
      <span class="ccg-fab-label">Text size</span>
      <div class="ccg-zoom-row">
        <button type="button" class="ccg-zoom-btn" id="ccg-zoom-out" aria-label="Decrease text size">−</button>
        <span class="ccg-zoom-val" id="ccg-zoom-val">100%</span>
        <button type="button" class="ccg-zoom-btn" id="ccg-zoom-in" aria-label="Increase text size">+</button>
      </div>
    </div>
    <div class="ccg-fab-row">
      <span class="ccg-fab-label">Layout preview</span>
      <div class="ccg-seg" id="ccg-fab-layout" role="radiogroup" aria-label="Layout">
        <button type="button" data-layout="auto" aria-label="Automatic layout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18"/></svg>
          Auto
        </button>
        <button type="button" data-layout="desktop" aria-label="Desktop layout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>
          Desktop
        </button>
        <button type="button" data-layout="phone" aria-label="Phone layout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>
          Phone
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // ---- open / close ----
  function closePanel() { panel.classList.remove("open"); backdrop.classList.remove("open"); }
  function openPanel() { panel.classList.add("open"); backdrop.classList.add("open"); }
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.contains("open") ? closePanel() : openPanel();
  });
  backdrop.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

  // ---- theme segment ----
  const themeButtons = panel.querySelectorAll("#ccg-fab-theme button");
  function paintTheme() {
    const pref = document.documentElement.getAttribute("data-theme-pref") || "system";
    themeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === pref));
  }
  function applyTheme(pref) {
    const resolved = pref === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : pref;
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-pref", pref);
  }
  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.setItem(THEME_KEY, btn.dataset.mode);
      applyTheme(btn.dataset.mode);
      paintTheme();
    });
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem(THEME_KEY) || "system") === "system") applyTheme("system");
  });
  paintTheme();

  // ---- zoom ----
  const zoomVal = document.getElementById("ccg-zoom-val");
  const zoomOut = document.getElementById("ccg-zoom-out");
  const zoomIn = document.getElementById("ccg-zoom-in");
  function currentZoomIndex() {
    const saved = parseFloat(localStorage.getItem(ZOOM_KEY)) || 1;
    const idx = ZOOM_STEPS.indexOf(saved);
    return idx === -1 ? 1 : idx;
  }
  function paintZoom(idx) {
    zoomVal.textContent = Math.round(ZOOM_STEPS[idx] * 100) + "%";
    zoomOut.disabled = idx === 0;
    zoomIn.disabled = idx === ZOOM_STEPS.length - 1;
  }
  function setZoom(idx) {
    idx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx));
    const value = ZOOM_STEPS[idx];
    document.documentElement.style.zoom = value;
    localStorage.setItem(ZOOM_KEY, value);
    paintZoom(idx);
  }
  zoomOut.addEventListener("click", () => setZoom(currentZoomIndex() - 1));
  zoomIn.addEventListener("click", () => setZoom(currentZoomIndex() + 1));
  paintZoom(currentZoomIndex());

  // ---- layout preview ----
  const layoutButtons = panel.querySelectorAll("#ccg-fab-layout button");
  function paintLayout() {
    const current = document.documentElement.getAttribute("data-force-layout") || "auto";
    layoutButtons.forEach((b) => b.classList.toggle("active", b.dataset.layout === current));
  }
  layoutButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.layout;
      localStorage.setItem(LAYOUT_KEY, mode);
      document.documentElement.setAttribute("data-force-layout", mode);
      paintLayout();
      window.dispatchEvent(new Event("ccg-layout-change"));
    });
  });
  paintLayout();
})();
