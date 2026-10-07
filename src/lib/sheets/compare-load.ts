import { alignSheetAndVektor, type AlignedLoad, type LoadFacts } from "@/lib/sheets/align";
import { loadInsOutsWeek } from "@/lib/sheets/load-week";
import { unitKey } from "@/lib/sheets/mismatch";
import { milesValueToHundredths } from "@/lib/statements/miles";
import { createClient } from "@/lib/supabase/server";

export type SheetCompareData = {
  weekStart: string;
  weekEnd: string;
  unit: string;
  trucks: Array<{ unitNumber: string; truckName: string }>;
  rows: AlignedLoad[];
  error: string | null;
};

function milesOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  try {
    return milesValueToHundredths(value);
  } catch {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    return Math.round(numeric * 100);
  }
}

export async function loadSheetCompare(input: {
  weekStart: string;
  weekEnd: string;
  unit: string | undefined;
}): Promise<SheetCompareData> {
  const loaded = await loadInsOutsWeek(input.weekStart, input.weekEnd);
  const trucks = loaded.rows.map((row) => ({ unitNumber: row.unitNumber, truckName: row.truckName }));
  const unit = input.unit?.trim() ?? "";
  const wanted = unit ? unitKey(unit) : "";
  const chosen = wanted
    ? loaded.rows.filter((row) => unitKey(row.unitNumber) === wanted)
    : loaded.rows.filter((row) => row.readable);

  const sheet: LoadFacts[] = [];
  for (const truck of chosen) {
    for (const load of truck.ledgerLoads) {
      sheet.push({
        unitNumber: truck.unitNumber,
        loadId: load.loadId,
        deliveryDay: load.deliveryDay,
        rateCents: load.rateCents,
        loadedMilesHundredths: load.loadedMilesHundredths,
        deadheadMilesHundredths: load.deadheadMilesHundredths,
      });
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loads")
    .select("load_id, rate_cents, truck_unit_number, delivery_date, loaded_distance_mi, deadhead_miles")
    .gte("delivery_date", input.weekStart)
    .lte("delivery_date", input.weekEnd);
  if (error) {
    return {
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      unit,
      trucks,
      rows: [],
      error: error.message,
    };
  }

  const sheetIds = [...new Set(sheet.map((row) => row.loadId).filter((id) => id.trim()))];
  let outside: typeof data = [];
  if (sheetIds.length > 0) {
    const extra = await supabase
      .from("loads")
      .select("load_id, rate_cents, truck_unit_number, delivery_date, loaded_distance_mi, deadhead_miles")
      .in("load_id", sheetIds);
    if (extra.error) {
      return {
        weekStart: input.weekStart,
        weekEnd: input.weekEnd,
        unit,
        trucks,
        rows: [],
        error: extra.error.message,
      };
    }
    outside = extra.data ?? [];
  }

  const merged = new Map<string, NonNullable<typeof data>[number]>();
  for (const row of [...(data ?? []), ...(outside ?? [])]) {
    if (!row.load_id || !row.truck_unit_number) continue;
    const key = `${unitKey(row.truck_unit_number)}|${row.load_id.trim().toLowerCase()}`;
    if (!merged.has(key)) merged.set(key, row);
  }

  const vektor: LoadFacts[] = [];
  for (const row of merged.values()) {
    const unitNumber = row.truck_unit_number as string;
    if (wanted && unitKey(unitNumber) !== wanted) continue;
    if (!wanted && !chosen.some((truck) => unitKey(truck.unitNumber) === unitKey(unitNumber))) continue;
    vektor.push({
      unitNumber,
      loadId: row.load_id as string,
      deliveryDay: String(row.delivery_date).slice(0, 10),
      rateCents: row.rate_cents,
      loadedMilesHundredths: milesOrNull(row.loaded_distance_mi),
      deadheadMilesHundredths: milesOrNull(row.deadhead_miles),
    });
  }

  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    unit,
    trucks,
    rows: alignSheetAndVektor({ weekStart: input.weekStart, sheet, vektor }),
    error: loaded.error,
  };
}
