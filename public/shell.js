// ============================================================
// shell.js — the one application shell (sidebar + topbar +
// breadcrumb), shared across every page. Reads a small config
// object the page defines before this script loads:
//
//   window.CLINCOG_SHELL = {
//     activeNav: "dashboard",              // "dashboard" | "cases" | "progress" | "resources"
//     activeCaseId: "schizophrenia",        // optional, highlights one case in the sidebar
//     breadcrumb: [                         // rendered left-to-right in the topbar
//       { label: "Dashboard" }              // last item has no href - it's the current page
//     ],
//   };
//
// Requires storage.js to already be loaded (reads real case
// progress for the sidebar dots and the bottom progress badge -
// nothing here is invented).
// ============================================================

(function () {
  const cfg = window.CLINCOG_SHELL || {};
  const DOMAIN_CLASS = { schizophrenia: "psychosis", depression: "mood", anxiety: "anxiety", addiction: "substance" };

  const name = typeof ClinCog !== "undefined" ? ClinCog.getName() : "";
  const modules = typeof ClinCog !== "undefined" ? ClinCog.MODULES : [];
  const completedCount = typeof ClinCog !== "undefined"
    ? modules.filter((m) => ClinCog.getCaseStatus(m.id).state === "complete").length
    : 0;

  // ---- sidebar markup -------------------------------------------------
  const caseRows = modules.map((m) => {
    const isActive = cfg.activeCaseId === m.id;
    return `
      <a href="${m.chat}" class="shell-case-row${isActive ? " active" : ""}">
        <span class="shell-case-dot domain-${DOMAIN_CLASS[m.id]}"></span>
        <span class="shell-case-name">${m.patient}</span>
      </a>`;
  }).join("");

  const navItem = (icon, label, href, key, extra = "") => `
    <a href="${href}" class="shell-nav-item${cfg.activeNav === key ? " active" : ""}" data-icon="${icon}">
      <span class="shell-nav-icon"></span><span class="shell-nav-label">${label}</span>${extra}
    </a>`;

  const sidebarHtml = `
    <div class="shell-sidebar-top">
      <a href="/dashboard.html" class="shell-brand">
        <img src="/favicon.svg" alt="" />
        <span class="shell-brand-word">ClinCog</span>
      </a>
    </div>
    <nav class="shell-nav">
      <div class="shell-nav-group">
        <div class="shell-nav-eyebrow">Main</div>
        ${navItem("grid", "Dashboard", "/dashboard.html", "dashboard")}
        <div class="shell-nav-item shell-nav-expandable${cfg.activeNav === "cases" || cfg.activeCaseId ? " active" : ""}" id="shell-cases-toggle" data-icon="layers">
          <span class="shell-nav-icon"></span><span class="shell-nav-label">Cases</span>
          <span class="shell-nav-chevron"></span>
        </div>
        <div class="shell-case-list" id="shell-case-list">${caseRows}</div>
        ${navItem("bar-chart", "My progress", "/progress.html", "progress")}
      </div>
      <div class="shell-nav-group">
        <div class="shell-nav-eyebrow">Resources</div>
        ${navItem("book", "ICD-11 glossary", "/icd-glossary.html", "icd-glossary")}
        ${navItem("info", "CDDR criteria guide", "/cddr-guide.html", "cddr-guide")}
        ${navItem("layers", "Cognitive tasks", "/cognitive-tests.html", "cognitive-tests")}
      </div>
      <div class="shell-nav-group">
        <div class="shell-nav-eyebrow">Seminar</div>
        ${navItem("info", "About the course", "/about.html", "about")}
        ${navItem("help", "Help", "/help.html", "help")}
        ${navItem("target", "Assessment benchmarks", "/benchmarks.html", "benchmarks")}
        ${navItem("sparkle", "Adopt with your own keys", "/adopt.html", "adopt")}
      </div>
    </nav>
    <div class="shell-sidebar-bottom">
      <div class="shell-term-badge">
        <span class="shell-term-badge-text"><strong>${completedCount}</strong> / ${modules.length} cases complete</span>
        <div class="progress-track" style="height:4px;"><div class="progress-fill" style="width:${modules.length ? (completedCount / modules.length) * 100 : 0}%"></div></div>
      </div>
    </div>`;

  // ---- topbar markup ----------------------------------------------------
  const crumbs = (cfg.breadcrumb || [{ label: "ClinCog" }]);
  // The last crumb is rendered again as the topbar title, so a single-crumb
  // page would otherwise show its own name twice. Drop the trail entirely
  // in that case and let the title stand alone.
  const trail = crumbs.length > 1 ? crumbs : [];
  const breadcrumbHtml = trail.map((c, i) => {
    const isLast = i === trail.length - 1;
    const sep = i > 0 ? `<span class="shell-crumb-sep">›</span>` : "";
    return c.href && !isLast
      ? `${sep}<a href="${c.href}" class="shell-crumb">${c.label}</a>`
      : `${sep}<span class="shell-crumb${isLast ? " current" : ""}">${c.label}</span>`;
    // note: the last crumb is also rendered as the topbar title underneath,
    // so .current is styled as part of the trail here, not as the heading.
  }).join("");

  const topbarHtml = `
    <button type="button" class="shell-hamburger" id="shell-hamburger" aria-label="Toggle sidebar">
      <span class="shell-nav-icon"></span>
    </button>
    <div class="shell-topbar-main">
      <nav class="shell-breadcrumb">${breadcrumbHtml}</nav>
      <div class="shell-topbar-title" id="shell-topbar-title">${crumbs[crumbs.length - 1].label}</div>
    </div>
    <div class="shell-topbar-right">
      <a href="/help.html" class="btn btn-ghost btn-sm">Help</a>
    </div>`;

  // The topbar title doubles as the page's <h1>, but the evaluation pages
  // supply their own heading per view, and two competing <h1>s on one page
  // is worse than none in the chrome. Promote only when the page has not
  // already declared one.
  function promoteTopbarTitle() {
    const el = document.getElementById("shell-topbar-title");
    if (!el || document.querySelector("h1")) return;
    const h1 = document.createElement("h1");
    h1.className = el.className;
    h1.id = el.id;
    h1.textContent = el.textContent;
    el.replaceWith(h1);
  }

  // ---- assemble the frame ------------------------------------------------
  // Wraps whatever the page already put in <body> as the "content" region -
  // the page itself only needs a #shell-content marker around its real
  // markup; everything else (sidebar, topbar, backdrop) is injected here.
  const contentEl = document.getElementById("shell-content");
  if (!contentEl) {
    console.error("shell.js: no #shell-content element found on this page.");
    return;
  }

  const frame = document.createElement("div");
  frame.className = "shell-frame";
  frame.innerHTML = `
    <aside class="shell-sidebar" id="shell-sidebar">${sidebarHtml}</aside>
    <div class="shell-backdrop" id="shell-backdrop"></div>
    <div class="shell-main">
      <header class="shell-topbar">${topbarHtml}</header>
      <div class="shell-body" id="shell-body"></div>
    </div>`;

  contentEl.parentNode.insertBefore(frame, contentEl);
  frame.querySelector("#shell-body").appendChild(contentEl);
  contentEl.style.display = "";
  contentEl.removeAttribute("id"); // avoid a duplicate #shell-content once moved
  contentEl.classList.add("shell-content-inner");

  promoteTopbarTitle();

  // ---- icons --------------------------------------------------------------
  if (typeof ClinIcons !== "undefined") {
    frame.querySelectorAll(".shell-nav-icon").forEach((el) => {
      const item = el.closest("[data-icon]");
      el.innerHTML = ClinIcons.get(item ? item.dataset.icon : "help", 18);
    });
    frame.querySelector(".shell-hamburger .shell-nav-icon").innerHTML = ClinIcons.get("menu", 18);
    frame.querySelector(".shell-nav-chevron").innerHTML = ClinIcons.get("chevron-down", 14);
  }

  // ---- interactions ---------------------------------------------------
  const sidebar = document.getElementById("shell-sidebar");
  const backdrop = document.getElementById("shell-backdrop");
  const hamburger = document.getElementById("shell-hamburger");
  const SIDEBAR_KEY = "clincog_sidebar";

  let drawerScrollY = 0;
  function isMobile() { return window.matchMedia("(max-width: 1023px)").matches; }

  function openDrawer() {
    drawerScrollY = window.scrollY;
    sidebar.classList.add("open");
    backdrop.classList.add("open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${drawerScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }
  function closeDrawer() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo({ top: drawerScrollY, left: 0, behavior: "instant" });
  }

  if (cfg.autoCollapse && !isMobile()) {
    frame.classList.add("shell-collapsed");
  } else if (localStorage.getItem(SIDEBAR_KEY) === "collapsed" && !isMobile()) {
    frame.classList.add("shell-collapsed");
  }

  hamburger.addEventListener("click", () => {
    if (isMobile()) {
      sidebar.classList.contains("open") ? closeDrawer() : openDrawer();
    } else {
      const collapsed = frame.classList.toggle("shell-collapsed");
      // On conceptualization/evaluation pages, the collapse is enforced
      // per-page, not a real preference - toggling there for the current
      // session shouldn't overwrite what the user actually wants on
      // every other page (like the dashboard).
      if (!cfg.autoCollapse) {
        localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
      }
    }
  });
  backdrop.addEventListener("click", closeDrawer);

  const casesToggle = document.getElementById("shell-cases-toggle");
  const caseList = document.getElementById("shell-case-list");
  if (cfg.activeNav === "cases" || cfg.activeCaseId) caseList.classList.add("open");
  casesToggle.addEventListener("click", () => caseList.classList.toggle("open"));
})();
