// ============================================================
// theme-init.js — must load synchronously in <head>, before any
// CSS that depends on these attributes paints. Resolves and
// stamps three independent, persisted preferences onto <html>:
//   data-theme         "light" | "dark"            (resolved)
//   data-theme-pref     "light" | "system" | "dark" (as chosen)
//   data-force-layout   "auto" | "phone" | "desktop"
// and applies saved zoom directly as a style, so nothing flashes
// unstyled/unzoomed on load.
// ============================================================
(function () {
  var html = document.documentElement;

  var themePref = localStorage.getItem("clincog_theme") || "system";
  var resolvedTheme = themePref === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : themePref;
  html.setAttribute("data-theme", resolvedTheme);
  html.setAttribute("data-theme-pref", themePref);

  var forceLayout = localStorage.getItem("clincog_layout") || "auto";
  html.setAttribute("data-force-layout", forceLayout);

  var zoom = parseFloat(localStorage.getItem("clincog_zoom")) || 1;
  if (zoom !== 1) html.style.zoom = zoom;
})();
