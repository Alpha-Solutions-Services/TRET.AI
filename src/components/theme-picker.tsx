"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_THEME_ID, isThemeId, THEME_STORAGE_KEY, THEMES, type ThemeId } from "@/lib/theme";

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

function storedTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME_ID;
  const current = document.documentElement.getAttribute("data-theme");
  if (isThemeId(current)) return current;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(saved)) return saved;
  } catch {
    return DEFAULT_THEME_ID;
  }
  return DEFAULT_THEME_ID;
}

function Swatch({ colors }: { colors: readonly string[] }) {
  return (
    <span className="inline-flex h-4 w-8 overflow-hidden rounded-sm border border-[var(--color-border)]" aria-hidden="true">
      {colors.map((color) => (
        <span key={color} className="h-full flex-1" style={{ background: color }} />
      ))}
    </span>
  );
}

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = THEMES.find((item) => item.id === theme) ?? THEMES[0];

  useEffect(() => {
    const next = storedTheme();
    setTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm text-[var(--color-fg)]"
      >
        <Swatch colors={current.swatch} />
        <span>{current.label}</span>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Theme"
          className="absolute right-0 z-30 mt-2 max-h-96 w-64 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-field)] p-1 shadow-lg"
        >
          {THEMES.map((item) => (
            <li key={item.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={item.id === theme}
                onClick={() => {
                  setTheme(item.id);
                  applyTheme(item.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
              >
                <Swatch colors={item.swatch} />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
