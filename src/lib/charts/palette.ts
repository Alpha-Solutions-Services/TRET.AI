/** Category colors. Red, yellow, and green stay reserved for status. */
export const CATEGORY_PALETTE = [
  "#7eb6ff",
  "#c084fc",
  "#fb923c",
  "#22d3ee",
  "#f472b6",
  "#818cf8",
  "#f9a8d4",
  "#2dd4bf",
  "#fdba74",
  "#a5b4fc",
  "#67e8f9",
  "#e879f9",
  "#93c5fd",
  "#f0abfc",
] as const;

export function categoryColor(index: number): string {
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length] ?? CATEGORY_PALETTE[0];
}

export function percentOf(part: number, total: number): string {
  if (!Number.isInteger(part) || !Number.isInteger(total) || total <= 0) return "0%";
  const hundredths = Math.round((part * 10000) / total);
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return `${whole}.${String(frac).padStart(2, "0")}%`;
}
