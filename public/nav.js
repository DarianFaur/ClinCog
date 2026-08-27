// ============================================================
// nav.js — the one shared toolbar for the whole site. Every page
// includes:
//   <div id="ccg-nav-root"></div>
//   <script src="/nav.js" data-subtitle="Optional case label"></script>
// This script injects its own markup AND its own CSS, so it looks
// identical whether the host page loads styles.css or not (the
// evaluation pages don't). Edit this one file to change the
// toolbar everywhere at once.
//
// The theme switch used to live here; it now lives in the
// floating accessibility button (a11y.js) instead.
//
// The hamburger/full-menu decision is driven by JS, not a pure
// CSS media query, so it responds correctly when someone forces
// "phone" or "desktop" layout from the accessibility button, not
// just when the real window is actually narrow.
// ============================================================

(function () {
  const scriptTag = document.currentScript;
  const subtitle = (scriptTag && scriptTag.dataset.subtitle) || "Clinical Cognitive Science";
  const DASHBOARD = "/dashboard.html";
  const COMPACT_BREAKPOINT = 860;

  const css = `
  .ccg-nav{position:sticky;top:0;z-index:500;display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 24px;background:#636d79;font-family:'Poppins','Inter',sans-serif;box-sizing:border-box;}
  .ccg-nav *{box-sizing:border-box;}
  .ccg-nav .ccg-brand{display:flex;align-items:center;gap:9px;text-decoration:none;color:#fff;font-weight:700;font-size:14px;flex-shrink:0;}
  .ccg-nav .ccg-brand img{height:22px;width:auto;display:block;}
  .ccg-nav .ccg-brand span{color:#b7c0d4;font-weight:400;}
  .ccg-links{display:flex;align-items:center;gap:26px;}
  .ccg-links a{color:#cfd6e6;text-decoration:none;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;}
  .ccg-dropdown{position:relative;}
  .ccg-dropdown>button{background:none;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;color:#cfd6e6;display:flex;align-items:center;gap:4px;padding:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
  .ccg-dropdown-panel{display:none;position:absolute;top:28px;right:0;background:#fff;color:#1c2029;border:1px solid #e2e4ea;border-radius:10px;min-width:230px;padding:8px;box-shadow:0 12px 28px rgba(20,25,40,.16);}
  .ccg-dropdown.open .ccg-dropdown-panel{display:block;}
  .ccg-dropdown-panel a{display:block;padding:9px 12px;border-radius:6px;font-size:13px;color:#949aa6;text-decoration:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
  html[data-theme="dark"] .ccg-dropdown-panel{background:#1c202b;color:#eef0f5;border-color:#2c3140;}
  html[data-theme="dark"] .ccg-dropdown-panel a{color:#a7acba;}
  @media (hover:hover) and (pointer:fine){
    .ccg-links a:hover{color:#fff;}
    .ccg-dropdown>button:hover{color:#fff;}
    .ccg-dropdown-panel a:hover{background:#eef0f4;color:#5a5f6b;}
    html[data-theme="dark"] .ccg-dropdown-panel a:hover{background:#232a3a;color:#eef0f5;}
  }

  .ccg-hamburger{display:none;background:none;border:none;cursor:pointer;color:#fff;padding:4px;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
  .ccg-hamburger svg{width:22px;height:22px;display:block;}
  .ccg-mobile-panel{display:none;position:absolute;top:56px;right:0;left:0;background:#636d79;flex-direction:column;padding:16px 24px;gap:14px;z-index:499;box-shadow:0 12px 20px rgba(0,0,0,.15);}
  .ccg-mobile-panel.open{display:flex;}
  .ccg-mobile-panel a{color:#cfd6e6;text-decoration:none;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}

  /* Compact state is toggled by JS (see below), not a media query,
     so it reacts to a forced phone/desktop preview too. */
  .ccg-nav.compact .ccg-links{display:none;}
  .ccg-nav.compact .ccg-hamburger{display:block;}
  `;
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));

  const nav = document.createElement("nav");
  nav.className = "ccg-nav";
  nav.innerHTML = `
    <a class="ccg-brand" href="${DASHBOARD}">
      <img src="/favicon.svg" alt="" />
      ClinCog <span>· ${subtitle}</span>
    </a>
    <div class="ccg-links">
      <a href="/help.html">How to use</a>
      <div class="ccg-dropdown" id="ccg-resources">
        <button type="button" id="ccg-resources-toggle">Resources
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="ccg-dropdown-panel">
          <a href="#" class="ccg-soon">DSM-5 quick reference (soon)</a>
          <a href="#" class="ccg-soon">SCID-5 interview guide (soon)</a>
          <a href="#" class="ccg-soon">HiTOP overview (soon)</a>
        </div>
      </div>
      <a href="/about.html">About</a>
      <a href="${DASHBOARD}">All cases</a>
    </div>
    <button class="ccg-hamburger" id="ccg-hamburger" aria-label="Menu" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="ccg-mobile-panel" id="ccg-mobile-panel">
      <a href="/help.html">How to use</a>
      <a href="/about.html">About</a>
      <a href="${DASHBOARD}">All cases</a>
    </div>
  `;

  const placeholder = document.getElementById("ccg-nav-root");
  if (placeholder) {
    placeholder.replaceWith(nav);
  } else {
    document.body.insertBefore(nav, document.body.firstChild);
  }

  // ---- resources dropdown ----
  const dropdown = document.getElementById("ccg-resources");
  document.getElementById("ccg-resources-toggle").addEventListener("click", function (e) {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });
  document.addEventListener("click", function () {
    dropdown.classList.remove("open");
  });

  // ---- mobile hamburger ----
  const mobilePanel = document.getElementById("ccg-mobile-panel");
  document.getElementById("ccg-hamburger").addEventListener("click", function () {
    mobilePanel.classList.toggle("open");
  });

  // ---- compact/full decision: real width AND the forced-layout override ----
  function recomputeCompact() {
    mobilePanel.classList.remove("open");
    const forced = document.documentElement.getAttribute("data-force-layout") || "auto";
    let compact;
    if (forced === "phone") compact = true;
    else if (forced === "desktop") compact = false;
    else compact = window.innerWidth < COMPACT_BREAKPOINT;
    nav.classList.toggle("compact", compact);
  }
  recomputeCompact();
  window.addEventListener("resize", recomputeCompact);
  window.addEventListener("ccg-layout-change", recomputeCompact);
})();
