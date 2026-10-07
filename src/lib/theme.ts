export const THEME_STORAGE_KEY = "tret.theme";

export const THEMES = [
  { id: "glass", label: "Glass Light" },
  { id: "midnight", label: "Midnight Navy and Gold" },
  { id: "graphite", label: "Graphite Dark" },
  { id: "ocean", label: "Ocean Blue" },
  { id: "sand", label: "Warm Sand" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
