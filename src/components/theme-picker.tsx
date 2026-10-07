"use client";

import { useEffect, useState } from "react";
import { isThemeId, THEME_STORAGE_KEY, THEMES, type ThemeId } from "@/lib/theme";

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

function storedTheme(): ThemeId {
  if (typeof document === "undefined") return "glass";
  const current = document.documentElement.getAttribute("data-theme");
  if (isThemeId(current)) return current;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(saved)) return saved;
  } catch {
    return "glass";
  }
  return "glass";
}

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>("glass");

  useEffect(() => {
    const next = storedTheme();
    setTheme(next);
    applyTheme(next);
  }, []);

  return (
    <label className="text-sm">
      <span className="sr-only">Theme</span>
      <select
        aria-label="Theme"
        value={theme}
        onChange={(event) => {
          const next = event.target.value;
          if (!isThemeId(next)) return;
          setTheme(next);
          applyTheme(next);
        }}
        className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm text-[var(--color-fg)]"
      >
        {THEMES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
