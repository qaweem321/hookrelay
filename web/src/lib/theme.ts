// The Light / Dark / System choice from Settings → Appearance, saved in this browser.
// public/theme.js reads the same key before the first paint.
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const KEY = "theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function getTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return isTheme(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage can be blocked (private mode); the choice then lasts until the page reloads.
  }
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
