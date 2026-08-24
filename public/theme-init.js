// ============================================================
// theme-init.js — must load synchronously in <head>, before any
// CSS that depends on [data-theme] paints. Resolves the saved
// preference ("light" / "dark" / "system") to an actual theme
// and stamps it on <html> immediately.
// ============================================================
(function () {
  var pref = localStorage.getItem("clincog_theme") || "system";
  var resolved = pref === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : pref;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-pref", pref);
})();
