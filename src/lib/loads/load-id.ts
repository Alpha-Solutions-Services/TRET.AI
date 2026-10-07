const CANONICAL = /^([A-Za-z]+)-*(\d+)$/;

/** Letters and digits only, uppercase. TBH--1192 and TBH1192 share a key. */
export function loadMatchKey(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Vektor order id with a double hyphen: TBH1192 and TBH-1192 become TBH--1192.
 * Ids that are not letters plus digits stay unchanged.
 */
export function canonicalLoadId(raw: string | null | undefined): string {
  const compact = (raw ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, "");
  if (!compact) return "";
  const match = CANONICAL.exec(compact);
  if (!match) return compact;
  return `${match[1]!.toUpperCase()}--${match[2]}`;
}

/** Forms that may already be stored for one load. */
export function loadIdLookupForms(raw: string): string[] {
  const canonical = canonicalLoadId(raw);
  const key = loadMatchKey(raw);
  const forms = new Set<string>();
  const trimmed = raw.trim();
  if (trimmed) forms.add(trimmed);
  if (canonical) forms.add(canonical);
  if (key) forms.add(key);
  const parts = /^([A-Z]+)(\d+)$/.exec(key);
  if (parts) {
    forms.add(`${parts[1]}-${parts[2]}`);
    forms.add(`${parts[1]}--${parts[2]}`);
    forms.add(`${parts[1]}${parts[2]}`);
  }
  return [...forms];
}
