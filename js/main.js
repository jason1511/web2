(() => {
  const root = document.documentElement;
  const STORAGE_KEY = "va_theme"; // Visual Archive theme key

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;

    // Default: follow system preference
    const prefersDark = window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function applyTheme(theme) {
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme"); // light is default tokens

    localStorage.setItem(STORAGE_KEY, theme);

    // Optional: update button label if present
    const btn = document.getElementById("btnTheme");
    if (btn) btn.textContent = theme === "dark" ? "Light" : "Dark";
  }

  function toggleTheme() {
    const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  // Apply on load
  applyTheme(getPreferredTheme());

  // Wire up button if it exists on the page
  const btnTheme = document.getElementById("btnTheme");
  if (btnTheme) {
    btnTheme.addEventListener("click", toggleTheme);
  }
})();
