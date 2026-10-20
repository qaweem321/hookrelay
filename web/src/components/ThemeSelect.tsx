import { useState } from "react";
import { getTheme, isTheme, setTheme, THEMES, type Theme } from "../lib/theme";

const LABELS: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

export function ThemeSelect() {
  const [theme, setThemeState] = useState(getTheme);

  return (
    <select
      id="theme"
      className="input"
      value={theme}
      onChange={(e) => {
        if (!isTheme(e.target.value)) return;
        setThemeState(e.target.value);
        setTheme(e.target.value);
      }}
    >
      {THEMES.map((t) => (
        <option key={t} value={t}>
          {LABELS[t]}
        </option>
      ))}
    </select>
  );
}
