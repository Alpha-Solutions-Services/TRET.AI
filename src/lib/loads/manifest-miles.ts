export type ManifestRole = "solo" | "primary" | "partial";

export type ManifestGroupInput = {
  manifestRef: string | null;
  /** Loaded miles used to choose the full load. Integer hundredths. */
  rankHundredths: number;
};

export type ManifestGroupFields = {
  manifestRef: string | null;
  manifestRole: ManifestRole;
  /** First row of a manifest that has more than one load in this list. */
  manifestHeader: boolean;
};

function cleanRef(ref: string | null | undefined): string | null {
  const text = (ref ?? "").trim();
  return text || null;
}

/**
 * Loads that share a manifest stay together.
 * The load with the most loaded miles is the full load. Its miles count once.
 * The others are partials and contribute no loaded miles.
 * A tie uses the earlier row.
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
    let best = indexes[0]!;
    for (const index of indexes) {
      const row = rows[index]!;
      const winner = rows[best]!;
      if (row.rankHundredths > winner.rankHundredths) best = index;
    }
    primaryIndex.set(ref, best);
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
