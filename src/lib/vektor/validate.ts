import type { IssueDraft, MappedLoad } from "./types";

export type ImportSettings = {
  rowCountDropBlockPct: number;
};

export function validateMappedLoad(mapped: MappedLoad): IssueDraft[] {
  const issues: IssueDraft[] = [...mapped.issues];
  const ref = mapped.manifestFriendlyId ?? mapped.manifestId;

  if (!mapped.eligible) return issues;

  if (mapped.rateCents <= 0) {
    issues.push({
      severity: "Warn",
      rule: "rate_zero_or_missing",
      message: "Rate is 0 or missing on the manifest.",
      ref,
      manifestId: mapped.manifestId,
    });
  }

  const loaded = mapped.loadedDistanceMi ?? 0;
  const autoLoaded = mapped.autoLoadedDistanceMi ?? 0;
  if (loaded === 0 && autoLoaded > 0) {
    issues.push({
      severity: "Warn",
      rule: "loaded_zero_vs_auto",
      message: `loadedDistance is 0 while autoLoadedDistance is ${autoLoaded}.`,
      ref,
      manifestId: mapped.manifestId,
    });
  }

  if (loaded === 0 && mapped.rateCents > 0) {
    issues.push({
      severity: "Warn",
      rule: "miles_zero_rate_positive",
      message: "Loaded miles are 0 while rate is greater than 0.",
      ref,
      manifestId: mapped.manifestId,
    });
  }

  if (
    mapped.deliveryDate &&
    mapped.pickupDate &&
    mapped.deliveryDate < mapped.pickupDate
  ) {
    issues.push({
      severity: "Warn",
      rule: "delivery_before_pickup",
      message: "Delivery date is before pick-up date.",
      ref,
      manifestId: mapped.manifestId,
    });
  }

  return issues;
}

export function validateDuplicateLoadIds(
  mappedRows: MappedLoad[],
): IssueDraft[] {
  const counts = new Map<string, string[]>();
  for (const row of mappedRows) {
    if (!row.eligible || !row.loadId) continue;
    const list = counts.get(row.loadId) ?? [];
    list.push(row.manifestId);
    counts.set(row.loadId, list);
  }
  const issues: IssueDraft[] = [];
  for (const [loadId, manifests] of counts) {
    if (manifests.length > 1) {
      issues.push({
        severity: "Warn",
        rule: "duplicate_load_id",
        message: `Duplicate Load ID ${loadId} on ${manifests.length} manifests.`,
        ref: loadId,
      });
    }
  }
  return issues;
}

export function validateDateOutsideRange(
  mapped: MappedLoad,
  rangeFrom: string,
  rangeTo: string,
): IssueDraft | null {
  if (!mapped.eligible || !mapped.deliveryDate) return null;
  const day = mapped.deliveryDate.slice(0, 10);
  if (day < rangeFrom || day > rangeTo) {
    return {
      severity: "Warn",
      rule: "date_outside_range",
      message: `Delivery date ${day} is outside import range ${rangeFrom}–${rangeTo}.`,
      ref: mapped.manifestFriendlyId ?? mapped.manifestId,
      manifestId: mapped.manifestId,
    };
  }
  return null;
}

/**
 * Block if fetched count drops more than settings.rowCountDropBlockPct
 * vs previous successful run fetched count.
 */
export function validateRowCountDrop(
  fetched: number,
  previousFetched: number | null,
  settings: ImportSettings,
): IssueDraft | null {
  if (previousFetched == null || previousFetched <= 0) return null;
  const minAllowed = Math.ceil(
    (previousFetched * (100 - settings.rowCountDropBlockPct)) / 100,
  );
  if (fetched < minAllowed) {
    return {
      severity: "Block",
      rule: "row_count_drop",
      message: `Fetched ${fetched} rows; previous run had ${previousFetched}. Drop exceeds ${settings.rowCountDropBlockPct}% threshold.`,
    };
  }
  return null;
}

export function matchTruckUnit(
  vektorUnit: string | null,
  knownUnits: Set<string>,
): { matched: boolean; unit: string | null } {
  if (!vektorUnit) return { matched: false, unit: null };
  // Exact match: Vektor "02" must equal trucks.unit_number "02"
  if (knownUnits.has(vektorUnit)) return { matched: true, unit: vektorUnit };
  return { matched: false, unit: vektorUnit };
}
