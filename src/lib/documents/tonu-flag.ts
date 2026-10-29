import { TONU_RATE_NOTE, type OwnerWeekLoad } from "@/lib/reports/owner-week";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";

/**
 * A confirmed TONU rate replaces the unconfirmed flag and the placeholder amount.
 * If the week was built without those amounts, the confirmed rate is added to gross.
 * Owner-confirmed rows for TBH--1201 and TBH--1221 live in supabase/data, not in code.
 */
export function applyTonuConfirmations<T extends TruckWeekInsOuts>(
  rows: readonly T[],
  confirmedCentsByLoadId: Readonly<Record<string, number>>,
): T[] {
  return rows.map((row) => {
    let added = 0;
    const weekLoads = (row.weekLoads ?? []).map((load) => {
      const next = confirmLoad(load, confirmedCentsByLoadId);
      if (next !== load && load.reason === TONU_RATE_NOTE && next.rateCents != null) added += next.rateCents;
      return next;
    });
    const pending = (row.pending ?? []).filter((item) => {
      const confirmed = confirmedCentsByLoadId[item.loadId];
      if (confirmed == null) return true;
      return item.reason !== TONU_RATE_NOTE;
    });
    if (added === 0) return { ...row, weekLoads, pending };
    return { ...row, weekLoads, pending, insCents: row.insCents + added, netCents: row.netCents + added };
  });
}

function confirmLoad(load: OwnerWeekLoad, confirmedCentsByLoadId: Readonly<Record<string, number>>): OwnerWeekLoad {
  if (load.status !== "TONU") return load;
  const confirmed = confirmedCentsByLoadId[load.loadId];
  if (confirmed == null) return load;
  return { ...load, rateCents: confirmed, reason: null };
}
