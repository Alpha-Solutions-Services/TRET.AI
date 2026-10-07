/** City and state from "City, ST" or a full street address ending in "City, ST 12345". */
export function cityStateFromAddress(raw: string | null | undefined): {
  city: string | null;
  state: string | null;
} {
  if (!raw) return { city: null, state: null };
  const text = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text === "-" || /^n\/a$/i.test(text)) return { city: null, state: null };
  const full = /,\s*([^,]+?),\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(text);
  if (full) {
    return { city: full[1]!.trim() || null, state: full[2]!.toUpperCase() };
  }
  const simple = /^([^,]+?),\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(text);
  if (simple) {
    return { city: simple[1]!.trim() || null, state: simple[2]!.toUpperCase() };
  }
  return { city: text, state: null };
}
