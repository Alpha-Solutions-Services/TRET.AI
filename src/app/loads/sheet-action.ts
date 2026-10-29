"use server";

import { weekBoundsForDate } from "@/lib/fee-engine";
import { assertMonday } from "@/lib/fee-engine";
import { loadActiveTruckInsOuts } from "@/lib/sheets/load-week";
import type { LoadListRow } from "@/components/loads/loads-client";

/** Delivery-week loads from the truck sheets, so the Loads page count matches the dashboard. */
export async function sheetLoadsForWeek(weekStart: string): Promise<{ rows: LoadListRow[]; error: string | null }> {
  try {
    assertMonday(weekStart, "Week start");
  } catch {
    return { rows: [], error: "Week start must be a Monday." };
  }
  const bounds = weekBoundsForDate(weekStart);
  const loaded = await loadActiveTruckInsOuts(bounds.start, bounds.end).catch((err: unknown) => ({
    rows: [],
    error: null as string | null,
    confirmationError: err instanceof Error ? err.message : "TONU confirmations could not be loaded.",
  }));
  if (loaded.confirmationError) return { rows: [], error: loaded.confirmationError };
  if (loaded.error) return { rows: [], error: loaded.error };
  const rows: LoadListRow[] = [];
  for (const truck of loaded.rows) {
    const weekLoads = truck.weekLoads ?? [];
    for (const load of weekLoads) {
      rows.push({
        id: `sheet:${truck.unitNumber}:${load.loadId}`,
        load_id: load.loadId,
        manifest_friendly_id: load.manifestId,
        delivery_date: load.deliveryDay,
        week_start: bounds.start,
        pickup_date: load.pickupDay ?? null,
        driver_name: load.driver,
        broker_name: null,
        origin_city: load.origin,
        origin_state: null,
        destination_city: load.destination,
        destination_state: null,
        loaded_distance_mi: milesNumber(load.loadedMilesHundredths),
        deadhead_miles: milesNumber(load.deadheadMilesHundredths),
        rate_cents: load.rateCents ?? 0,
        truck_unit_number: truck.unitNumber,
        source_manifest_ref: load.tripGroup ?? load.manifestId,
        status: load.status,
        tonuConfirmed: load.status === "TONU" && load.reason == null,
        tarpCents: load.tarpCents ?? 0,
      });
    }
  }
  return { rows, error: null };
}

function milesNumber(hundredths: number | null): number | null {
  if (hundredths == null) return null;
  return hundredths / 100;
}
