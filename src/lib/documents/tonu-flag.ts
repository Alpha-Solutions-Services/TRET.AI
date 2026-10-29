import { canonicalLoadId } from "@/lib/loads/load-id";
import { TONU_RATE_NOTE } from "@/lib/reports/owner-week";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";

/**
 * Drops the unconfirmed flag for a TONU the owner already confirmed.
 * Gross, the rate, and the delivery week are counted once by the owner week.
 * Owner-confirmed rows for TBH--1201 and TBH--1221 live in supabase/data, not in code.
 */
export function applyTonuConfirmations<T extends TruckWeekInsOuts>(
  rows: readonly T[],
  confirmedCentsByLoadId: Readonly<Record<string, number>>,
): T[] {
  return rows.map((row) => {
    const pending = (row.pending ?? []).filter((item) => {
      if (confirmedCents(confirmedCentsByLoadId, item.loadId) == null) return true;
      return item.reason !== TONU_RATE_NOTE;
    });
    return pending.length === (row.pending ?? []).length ? row : { ...row, pending };
  });
}

function confirmedCents(map: Readonly<Record<string, number>>, loadId: string): number | null {
  const key = canonicalLoadId(loadId);
  for (const [id, cents] of Object.entries(map)) {
    if (canonicalLoadId(id) === key && Number.isInteger(cents) && cents >= 0) return cents;
  }
  return null;
}
