// Loaded in <head> before the page paints. Applies the saved theme (Settings → Appearance), or the
// operating system's when it is "system", and follows later changes to either.
(function () {
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    var theme = null;
    try {
      theme = localStorage.getItem("theme");
    } catch {
      // Storage can be blocked; fall back to the system setting.
    }
    document.documentElement.classList.toggle(
      "dark",
      theme === "dark" || (theme !== "light" && media.matches),
    );
  }
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("storage", apply);
})();
