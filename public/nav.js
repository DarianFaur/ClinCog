// ============================================================
// nav.js — the one shared toolbar for the whole site, now with
// the theme switch (light / system / dark). Every page includes:
//   <div id="ccg-nav-root"></div>
//   <script src="/nav.js" data-subtitle="Optional case label"></script>
// This script injects its own markup AND its own CSS, so it looks
// identical whether the host page loads styles.css or not (the
// evaluation pages don't). Edit this one file to change the
// toolbar everywhere at once.
//
// Theme mechanics: theme-init.js (loaded earlier, synchronously,
// in <head>) already stamped data-theme + data-theme-pref on
// <html> before this ran, so there's no flash. This file only
// needs to (a) draw the switch in the state that matches that
// attribute, and (b) update it on click.
// ============================================================

(function () {
  const scriptTag = document.currentScript;
  const subtitle = (scriptTag && scriptTag.dataset.subtitle) || "Clinical Cognitive Science";
  const DASHBOARD = "/dashboard.html";
  const THEME_KEY = "clincog_theme";

  const css = `
  .ccg-nav{position:sticky;top:0;z-index:500;display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 24px;background:#2c3549;font-family:'Poppins','Inter',sans-serif;box-sizing:border-box;}
  .ccg-nav *{box-sizing:border-box;}
  .ccg-nav .ccg-brand{display:flex;align-items:center;gap:9px;text-decoration:none;color:#fff;font-weight:700;font-size:14px;}
  .ccg-nav .ccg-brand img{height:22px;width:auto;display:block;}
  .ccg-nav .ccg-brand span{color:#b7c0d4;font-weight:400;}
  .ccg-nav-right{display:flex;align-items:center;gap:22px;}
  .ccg-links{display:flex;align-items:center;gap:26px;}
  .ccg-links a{color:#cfd6e6;text-decoration:none;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;}
  .ccg-links a:hover{color:#fff;}
  .ccg-dropdown{position:relative;}
  .ccg-dropdown>button{background:none;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;color:#cfd6e6;display:flex;align-items:center;gap:4px;padding:0;}
  .ccg-dropdown>button:hover{color:#fff;}
  .ccg-dropdown-panel{display:none;position:absolute;top:28px;right:0;background:#fff;color:#1c2029;border:1px solid #e2e4ea;border-radius:10px;min-width:230px;padding:8px;box-shadow:0 12px 28px rgba(20,25,40,.16);}
  .ccg-dropdown.open .ccg-dropdown-panel{display:block;}
  .ccg-dropdown-panel a{display:block;padding:9px 12px;border-radius:6px;font-size:13px;color:#949aa6;text-decoration:none;}
  .ccg-dropdown-panel a:hover{background:#eef0f4;color:#5a5f6b;}
  html[data-theme="dark"] .ccg-dropdown-panel{background:#1c202b;color:#eef0f5;border-color:#2c3140;}
  html[data-theme="dark"] .ccg-dropdown-panel a{color:#a7acba;}
  html[data-theme="dark"] .ccg-dropdown-panel a:hover{background:#232a3a;color:#eef0f5;}

  .ccg-theme{position:relative;display:flex;align-items:center;background:rgba(255,255,255,.08);border-radius:999px;padding:3px;gap:2px;}
  .ccg-theme button{position:relative;z-index:1;width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;color:#9fabc4;border-radius:999px;transition:color .2s ease;}
  .ccg-theme button svg{width:14px;height:14px;display:block;}
  .ccg-theme button.active{color:#2c3549;}
  .ccg-theme .ccg-theme-knob{position:absolute;top:3px;left:3px;width:26px;height:26px;background:#fff;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .25s cubic-bezier(.2,.8,.2,1);z-index:0;}

  .ccg-hamburger{display:none;background:none;border:none;cursor:pointer;color:#fff;padding:4px;}
  .ccg-hamburger svg{width:22px;height:22px;display:block;}
  .ccg-mobile-panel{display:none;position:absolute;top:56px;right:0;left:0;background:#2c3549;flex-direction:column;padding:16px 24px;gap:14px;z-index:499;box-shadow:0 12px 20px rgba(0,0,0,.15);}
  .ccg-mobile-panel.open{display:flex;}
  .ccg-mobile-panel a{color:#cfd6e6;text-decoration:none;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;}
  @media (max-width:860px){
    .ccg-nav .ccg-links{display:none;}
    .ccg-hamburger{display:block;}
  }
  `;
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));

  const nav = document.createElement("nav");
  nav.className = "ccg-nav";
  nav.innerHTML = `
    <a class="ccg-brand" href="${DASHBOARD}">
      <img src="/favicon.svg" alt="" />
      ClinCog <span>· ${subtitle}</span>
    </a>
    <div class="ccg-nav-right">
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
      <div class="ccg-theme" id="ccg-theme" role="radiogroup" aria-label="Theme">
        <div class="ccg-theme-knob" id="ccg-theme-knob"></div>
        <button type="button" data-mode="light" title="Light" aria-label="Light theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        </button>
        <button type="button" data-mode="system" title="Match system" aria-label="System theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>
        </button>
        <button type="button" data-mode="dark" title="Dark" aria-label="Dark theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>
        </button>
      </div>
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
  document.getElementById("ccg-hamburger").addEventListener("click", function () {
    document.getElementById("ccg-mobile-panel").classList.toggle("open");
  });

  // ---- theme switch ----
  const themeButtons = nav.querySelectorAll(".ccg-theme button");
  const knob = document.getElementById("ccg-theme-knob");
  const order = ["light", "system", "dark"];

  function resolve(pref) {
    return pref === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : pref;
  }

  function paintSwitch(pref) {
    themeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === pref));
    knob.style.transform = `translateX(${order.indexOf(pref) * 28}px)`;
  }

  function applyTheme(pref) {
    document.documentElement.setAttribute("data-theme", resolve(pref));
    document.documentElement.setAttribute("data-theme-pref", pref);
  }

  const currentPref = document.documentElement.getAttribute("data-theme-pref") || "system";
  paintSwitch(currentPref);

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const mode = btn.dataset.mode;
      localStorage.setItem(THEME_KEY, mode);
      applyTheme(mode);
      paintSwitch(mode);
    });
  });

  // If the user's preference is "system", keep following OS changes live.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if ((localStorage.getItem(THEME_KEY) || "system") === "system") {
      applyTheme("system");
    }
  });
})();
