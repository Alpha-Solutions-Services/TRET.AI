export const THEME_STORAGE_KEY = "tret.theme";

export const DEFAULT_THEME_ID = "vibe" as const;

export const THEMES = [
  { id: "vibe", label: "Vibe", scheme: "dark", swatch: ["#1c232c", "#8fb4c8", "#c4b49a"] },
  { id: "vibe-light", label: "Vibe Light", scheme: "light", swatch: ["#e8edf2", "#2f5d73", "#6d5a32"] },
  { id: "glass", label: "Glass Light", scheme: "light", swatch: ["#f3f2ee", "#5d726b", "#b6a48c"] },
  { id: "mono", label: "Mono Minimal", scheme: "light", swatch: ["#ffffff", "#141414", "#1d4e89"] },
  { id: "ocean", label: "Ocean Blue", scheme: "light", swatch: ["#f3f6f7", "#3e7c8a", "#6d8ea0"] },
  { id: "mint", label: "Mint Breeze", scheme: "light", swatch: ["#f3faf6", "#1b5e40", "#2f7d72"] },
  { id: "sand", label: "Warm Sand", scheme: "light", swatch: ["#f6f1e8", "#8a5344", "#a08458"] },
  { id: "rose", label: "Rose Quartz", scheme: "light", swatch: ["#faf6f5", "#8c3d4e", "#6d5a7a"] },
  { id: "graphite", label: "Graphite Dark", scheme: "dark", swatch: ["#171717", "#e4e2df", "#a9c4e4"] },
  { id: "midnight", label: "Midnight Navy and Gold", scheme: "dark", swatch: ["#101722", "#c9b07a", "#8ea0b4"] },
  { id: "aurora", label: "Aurora Night", scheme: "dark", swatch: ["#140e22", "#c4b5fd", "#7dd3fc"] },
  { id: "carbon", label: "Carbon Electric", scheme: "dark", swatch: ["#101418", "#7eb6ff", "#7ee0c6"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
