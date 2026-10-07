function tokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Short sheet names and full legal names are the same driver when the first
 * name matches and, if the short name has a last name, that last name matches.
 */
export function driverNamesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  if (!left && !right) return true;
  if (!left || !right) return false;
  const ta = tokens(left);
  const tb = tokens(right);
  if (ta.join(" ") === tb.join(" ")) return true;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length === 0 || short[0] !== long[0]) return false;
  if (short.length >= 2 && short[short.length - 1] !== long[long.length - 1]) return false;
  let index = 0;
  for (const token of short) {
    const found = long.indexOf(token, index);
    if (found < 0) return false;
    index = found + 1;
  }
  return true;
}
