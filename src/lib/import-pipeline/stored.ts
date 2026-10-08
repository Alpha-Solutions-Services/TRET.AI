import { milesToHundredths } from "@/lib/fuel-tolls/quantity";
import { createClient } from "@/lib/supabase/server";
import { unitKey } from "@/lib/sheets/mismatch";
import {
  buildTruckWeeks,
  weekForDay,
  type AggregateFuel,
  type AggregateMiles,
  type AggregateToll,
  type TruckWeekTotals,
} from "./aggregate";

function productOf(raw: string | null | undefined): "diesel" | "def" {
  return (raw ?? "").trim().toLowerCase().startsWith("def") ? "def" : "diesel";
}

/** Same reducer as the import pipeline, from rows already saved in TRET. */
export function totalsFromStoredRows(input: {
  fuel: readonly {
    unit_number: string | null;
    week_start: string;
    week_end: string;
    product: string;
    gallons_milli: number;
    amount_cents: number;
  }[];
  tolls: readonly {
    unit_number: string | null;
    week_start: string;
    week_end: string;
    amount_cents: number;
  }[];
  loads: readonly {
    truck_unit_number: string | null;
    week_start: string | null;
    load_id: string | null;
    source_manifest_ref: string | null;
    loaded_distance_mi: number | null;
    deadhead_miles: number | null;
  }[];
}): TruckWeekTotals[] {
  const fuel: AggregateFuel[] = [];
  for (const row of input.fuel) {
    if (!row.unit_number) continue;
    fuel.push({
      unitNumber: unitKey(row.unit_number),
      weekStart: row.week_start,
      weekEnd: row.week_end,
      loadId: "",
      tripId: "",
      product: productOf(row.product),
      gallonsMilli: row.gallons_milli,
      amountCents: row.amount_cents,
    });
  }
  const tolls: AggregateToll[] = [];
  for (const row of input.tolls) {
    if (!row.unit_number) continue;
    tolls.push({
      unitNumber: unitKey(row.unit_number),
      weekStart: row.week_start,
      weekEnd: row.week_end,
      loadId: "",
      amountCents: row.amount_cents,
    });
  }
  const miles: AggregateMiles[] = [];
  for (const row of input.loads) {
    if (!row.truck_unit_number || !row.load_id || !row.week_start) continue;
    const week = weekForDay(row.week_start);
    if (!week) continue;
    miles.push({
      unitNumber: unitKey(row.truck_unit_number),
      weekStart: week.start,
      weekEnd: week.end,
      loadId: row.load_id,
      tripId: "",
      manifestRef: row.source_manifest_ref,
      loadedMilesHundredths: milesToHundredths(row.loaded_distance_mi),
      deadheadMilesHundredths: milesToHundredths(row.deadhead_miles),
    });
  }
  return buildTruckWeeks({ fuel, tolls, miles });
}

export async function loadStoredWeekTotals(weekStart: string): Promise<TruckWeekTotals[]> {
  try {
    const supabase = await createClient();
    const [fuel, tolls, loads] = await Promise.all([
      supabase
        .from("fuel_transactions")
        .select("unit_number, week_start, week_end, product, gallons_milli, amount_cents")
        .eq("week_start", weekStart),
      supabase
        .from("toll_transactions")
        .select("unit_number, week_start, week_end, amount_cents")
        .eq("week_start", weekStart),
      supabase
        .from("loads")
        .select("truck_unit_number, week_start, load_id, source_manifest_ref, loaded_distance_mi, deadhead_miles")
        .eq("week_start", weekStart),
    ]);
    if (fuel.error || tolls.error || loads.error) return [];
    return totalsFromStoredRows({
      fuel: fuel.data ?? [],
      tolls: tolls.data ?? [],
      loads: loads.data ?? [],
    });
  } catch {
    return [];
  }
}
