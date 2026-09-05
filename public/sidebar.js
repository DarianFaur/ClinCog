// ============================================================
// sidebar.js — the same left-hand navigation sidebar as the
// dashboard, extended to every other page (conceptualization
// and evaluation). Injected as a fixed overlay rather than
// restructuring each page's existing layout, so it's safe to
// drop into already-working pages:
//   <script src="/sidebar.js"></script>
// Include it after storage.js (so it can show the real name) and
// after nav.js (order doesn't otherwise matter).
// ============================================================

(function () {
  const SIDEBAR_KEY = "clincog_sidebar";
  const DASHBOARD = "/dashboard.html";

  const css = `
  html.ccg-has-sidebar { }
  html.ccg-has-sidebar body { padding-left:240px; transition:padding-left .22s ease; }
  html.ccg-sidebar-collapsed.ccg-has-sidebar body { padding-left:0; }
  @media (max-width:860px){
    html.ccg-has-sidebar body { padding-left:0 !important; }
  }
  #ccg-sb { position:fixed; left:0; top:0; height:100dvh; width:240px; background:#636d79; color:#fff;
    z-index:800; display:flex; flex-direction:column; transition:transform .25s ease; }
  #ccg-sb-inner { display:flex; flex-direction:column; height:100%; overflow-y:auto; }
  #ccg-sb-brand { display:flex; align-items:center; gap:9px; padding:22px 22px 14px;
    font-family:'Poppins','Inter',sans-serif; font-weight:700; font-size:15px; color:#fff; text-decoration:none; flex-shrink:0; }
  #ccg-sb-brand img { height:24px; width:auto; }
  #ccg-sb-user { display:flex; align-items:center; gap:11px; padding:10px 22px 20px; }
  #ccg-sb-avatar { width:38px; height:38px; border-radius:50%; flex-shrink:0; background:#8bb6a2; color:#fff;
    display:flex; align-items:center; justify-content:center; font-family:'Poppins','Inter',sans-serif; font-weight:700; font-size:15px; }
  #ccg-sb-uname { font-family:'Inter',sans-serif; font-weight:600; font-size:13px; color:#fff; }
  #ccg-sb-urole { font-family:'DM Mono',monospace; font-size:10px; color:rgba(255,255,255,.5); }
  #ccg-sb-nav { display:flex; flex-direction:column; gap:2px; padding:4px 12px; flex:1; }
  #ccg-sb-nav a { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:500; color:rgba(255,255,255,.68); text-decoration:none;
    transition:background .15s ease,color .15s ease; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
  #ccg-sb-nav a svg { width:18px; height:18px; flex-shrink:0; opacity:.85; }
  #ccg-sb-nav a.active { background:rgba(255,255,255,.1); color:#fff; }
  @media (hover:hover) and (pointer:fine){
    #ccg-sb-nav a:hover { background:rgba(255,255,255,.1); color:#fff; }
  }
  .ccg-sb-cases { display:flex; flex-direction:column; gap:1px; margin:2px 0 6px 44px; }
  .ccg-sb-cases a { display:flex; align-items:center; gap:9px; padding:6px 8px; border-radius:8px;
    font-family:'Inter',sans-serif; font-size:12.5px; color:rgba(255,255,255,.55); text-decoration:none;
    touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
  .ccg-sb-cases a.active { color:#fff; font-weight:600; }
  @media (hover:hover) and (pointer:fine){
    .ccg-sb-cases a:hover { color:#fff; }
  }
  .ccg-sb-cases .dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  #ccg-sb-footer { padding:14px 20px 20px; border-top:1px solid rgba(255,255,255,.1); display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
  #ccg-sb-footer a { font-family:'Inter',sans-serif; font-size:13px; color:rgba(255,255,255,.6); text-decoration:none;
    touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
  @media (hover:hover) and (pointer:fine){
    #ccg-sb-footer a:hover { color:#fff; }
  }
  #ccg-sb-footer span { font-family:'DM Mono',monospace; font-size:11px; color:rgba(255,255,255,.35); margin-top:2px; }

  #ccg-sb-toggle { position:fixed; top:11px; left:196px; z-index:801; width:34px; height:34px; border-radius:9px;
    border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.08); color:#fff; cursor:pointer;
    display:flex; align-items:center; justify-content:center; transition:left .22s ease,background .15s ease;
    touch-action:manipulation; -webkit-tap-highlight-color:transparent; transform:translateZ(0); }
  @media (hover:hover) and (pointer:fine){
    #ccg-sb-toggle:hover { background:rgba(255,255,255,.18); }
  }
  #ccg-sb-toggle svg { width:17px; height:17px; }

  #ccg-sb-backdrop { display:none; position:fixed; inset:0; background:rgba(10,8,30,.45); z-index:799;
    touch-action:manipulation; }
  #ccg-sb-backdrop.open { display:block; }

  html.ccg-sidebar-collapsed #ccg-sb { transform:translateX(-100%); }
  html.ccg-sidebar-collapsed #ccg-sb-toggle { left:16px; }
  /* When the sidebar is tucked away, the toggle sits over the masthead's
     own left edge - give the brand mark room so the two don't overlap. */
  html.ccg-sidebar-collapsed .ccg-nav .ccg-brand { margin-left:52px; transition:margin-left .22s ease; }

  @media (max-width:860px){
    #ccg-sb { transform:translateX(-100%); }
    #ccg-sb.open { transform:translateX(0); }
    #ccg-sb-toggle { top:14px; left:14px; background:#636d79; border-color:#636d79; }
    /* On mobile the sidebar is always a hidden drawer, so the toggle is
       always in the masthead's corner - the brand always needs the gap. */
    .ccg-nav .ccg-brand { margin-left:52px !important; }
  }
  `;
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));
  document.documentElement.classList.add("ccg-has-sidebar");

  const name = (typeof ClinCog !== "undefined" && ClinCog.getName && ClinCog.getName()) || "Student";
  const currentFile = location.pathname.split("/").pop();
  const CASES = [
    { name: "Dennis", chat: "schizophrenia-chat.html", eval: "schizophrenia-eval.html", dot: "#a15c74" },
    { name: "Darren", chat: "depression-chat.html", eval: "depression-eval.html", dot: "#4d4e8e" },
    { name: "Alex", chat: "anxiety-chat.html", eval: "anxiety-eval.html", dot: "#8bb6a2" },
    { name: "Jordan", chat: "addiction-chat.html", eval: "addiction-eval.html", dot: "#c99b4a" },
  ];
  const isActiveCase = (c) => currentFile === c.chat || currentFile === c.eval;

  const sb = document.createElement("aside");
  sb.id = "ccg-sb";
  sb.innerHTML = `
    <div id="ccg-sb-inner">
      <a id="ccg-sb-brand" href="${DASHBOARD}"><img src="/favicon.svg" alt="" /> ClinCog</a>
      <div id="ccg-sb-user">
        <div id="ccg-sb-avatar">${name.charAt(0).toUpperCase()}</div>
        <div><div id="ccg-sb-uname">${name}</div><div id="ccg-sb-urole">Seminar practicum</div></div>
      </div>
      <div id="ccg-sb-nav">
        <a href="${DASHBOARD}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
          Dashboard
        </a>
        <a href="${DASHBOARD}#cases">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>
          Cases
        </a>
        <div class="ccg-sb-cases">
          ${CASES.map(c => `<a class="${isActiveCase(c) ? "active" : ""}" href="/${c.chat}"><span class="dot" style="background:${c.dot}"></span>${c.name}</a>`).join("")}
        </div>
        <a href="${DASHBOARD}#progress">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          My progress
        </a>
        <a href="/help.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V6a2 2 0 0 1 2-2h13v15.5"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H19"/></svg>
          Resources
        </a>
        <a href="/help.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.7"/><circle cx="12" cy="17" r="0.1" fill="currentColor" stroke-width="1.5"/></svg>
          How it works
        </a>
      </div>
      <div id="ccg-sb-footer">
        <a href="/about.html">About</a>
        <a href="/help.html">Help</a>
        <span>v1.1.0</span>
      </div>
    </div>
  `;
  document.body.appendChild(sb);

  const backdrop = document.createElement("div");
  backdrop.id = "ccg-sb-backdrop";
  document.body.appendChild(backdrop);

  const toggle = document.createElement("button");
  toggle.id = "ccg-sb-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Toggle sidebar");
  toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="10" y1="4" x2="10" y2="20"/></svg>`;
  document.body.appendChild(toggle);

  const isMobile = () => window.innerWidth <= 860;
  let savedScrollY = 0;

  function openMobileDrawer() {
    savedScrollY = window.scrollY;
    sb.classList.add("open");
    backdrop.classList.add("open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }
  function closeMobileDrawer() {
    sb.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo({ top: savedScrollY, left: 0, behavior: "instant" });
  }
  backdrop.addEventListener("click", closeMobileDrawer);

  function setCollapsed(collapsed) {
    document.documentElement.classList.toggle("ccg-sidebar-collapsed", collapsed);
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
  }

  toggle.addEventListener("click", () => {
    if (isMobile()) {
      sb.classList.contains("open") ? closeMobileDrawer() : openMobileDrawer();
    } else {
      setCollapsed(!document.documentElement.classList.contains("ccg-sidebar-collapsed"));
    }
  });

  if (!isMobile() && localStorage.getItem(SIDEBAR_KEY) === "collapsed") {
    document.documentElement.classList.add("ccg-sidebar-collapsed");
  }

  window.addEventListener("resize", () => {
    if (!isMobile()) closeMobileDrawer();
  });
})();
