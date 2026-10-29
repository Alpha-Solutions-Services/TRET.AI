import { TONU_RATE_NOTE, type OwnerWeekLoad } from "@/lib/reports/owner-week";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";

/**
 * Owner-confirmed TONU fees. TBH--1221 is truck 6. TBH--1201 is truck 8.
 * Each fee replaces the unconfirmed flag. Gross stays the sheet total.
 */
export const OWNER_CONFIRMED_TONU_CENTS: Readonly<Record<string, number>> = {
  "TBH--1201": 25_000,
  "TBH--1221": 25_000,
};

/**
 * A confirmed TONU rate replaces the unconfirmed flag and the placeholder amount.
 * The week's gross is left as the sheet already counted it.
 */
export function applyTonuConfirmations<T extends TruckWeekInsOuts>(
  rows: readonly T[],
  confirmedCentsByLoadId: Readonly<Record<string, number>>,
): T[] {
  return rows.map((row) => {
    const weekLoads = (row.weekLoads ?? []).map((load) => confirmLoad(load, confirmedCentsByLoadId));
    const pending = (row.pending ?? []).filter((item) => {
      const confirmed = confirmedCentsByLoadId[item.loadId];
      if (confirmed == null) return true;
      return item.reason !== TONU_RATE_NOTE;
    });
    return { ...row, weekLoads, pending };
  });
}

function confirmLoad(load: OwnerWeekLoad, confirmedCentsByLoadId: Readonly<Record<string, number>>): OwnerWeekLoad {
  if (load.status !== "TONU") return load;
  const confirmed = confirmedCentsByLoadId[load.loadId];
  if (confirmed == null) return load;
  return { ...load, rateCents: confirmed, reason: null };
}
