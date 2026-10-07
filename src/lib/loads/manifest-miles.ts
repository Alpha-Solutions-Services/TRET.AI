export type ManifestRole = "solo" | "primary" | "partial";

export type ManifestGroupInput = {
  manifestRef: string | null;
  /** Loaded miles used to choose the full load when the sheet has no Primary flag. Integer hundredths. */
  rankHundredths: number;
  /**
   * Sheet Primary column. True is the full load.
   * False is a non-primary row on that trip.
   * Null means the sheet did not say, so the most loaded miles wins.
   */
  sheetPrimary?: boolean | null;
};

export type ManifestGroupFields = {
  manifestRef: string | null;
  manifestRole: ManifestRole;
  /** First row of a manifest that has more than one load in this list. */
  manifestHeader: boolean;
};

/** Trip M-1195 and Vektor manifest 1195 are the same group. */
export function manifestGroupKey(ref: string | null | undefined): string | null {
  const text = (ref ?? "").trim();
  if (!text) return null;
  const trip = /^m[-\s]?(\d+)$/i.exec(text);
  if (trip?.[1]) return trip[1];
  return text;
}

function cleanRef(ref: string | null | undefined): string | null {
  return manifestGroupKey(ref);
}

function choosePrimary<T extends ManifestGroupInput>(rows: readonly T[], indexes: readonly number[]): number {
  const flagged = indexes.filter((index) => rows[index]?.sheetPrimary === true);
  if (flagged.length > 0) return flagged[0]!;
  let best = indexes[0]!;
  for (const index of indexes) {
    const row = rows[index]!;
    const winner = rows[best]!;
    if (row.rankHundredths > winner.rankHundredths) best = index;
  }
  return best;
}

/**
 * Loads that share a trip or a Vektor manifest stay together.
 * A sheet Primary flag chooses the full load. Its loaded miles count once.
 * When no row is marked primary, the load with the most loaded miles is the full load.
 * The others are partials and contribute no loaded miles. Revenue is unchanged.
 * A tie, or two Primary flags, uses the earlier row.
 */
export function layoutManifestGroups<T extends ManifestGroupInput>(rows: T[]): Array<T & ManifestGroupFields> {
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const ref = cleanRef(row.manifestRef);
    if (!ref) return;
    const list = groups.get(ref) ?? [];
    list.push(index);
    groups.set(ref, list);
  });

  const primaryIndex = new Map<string, number>();
  for (const [ref, indexes] of groups) {
    if (indexes.length < 2) continue;
    primaryIndex.set(ref, choosePrimary(rows, indexes));
  }

  const emitted = new Set<number>();
  const laid: Array<T & ManifestGroupFields> = [];
  rows.forEach((row, index) => {
    if (emitted.has(index)) return;
    const ref = cleanRef(row.manifestRef);
    const indexes = ref ? (groups.get(ref) ?? []) : [];
    if (!ref || indexes.length < 2) {
      emitted.add(index);
      laid.push({ ...row, manifestRef: ref, manifestRole: "solo", manifestHeader: false });
      return;
    }
    const primary = primaryIndex.get(ref)!;
    const order = [primary, ...indexes.filter((item) => item !== primary)];
    order.forEach((item, offset) => {
      emitted.add(item);
      const source = rows[item]!;
      laid.push({
        ...source,
        manifestRef: ref,
        manifestRole: item === primary ? "primary" : "partial",
        manifestHeader: offset === 0,
      });
    });
  });
  return laid;
}

/** Partials do not add loaded miles. Blank miles add nothing. */
export function countedLoadedHundredths(role: ManifestRole, hundredths: number | null | undefined): number {
  if (role === "partial" || hundredths == null) return 0;
  return hundredths;
}
