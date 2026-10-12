"use server";

import { weekBoundsForDate } from "@/lib/fee-engine";
import { assertMonday } from "@/lib/fee-engine";
import { loadActiveTruckInsOuts } from "@/lib/sheets/load-week";
import type { LoadListRow } from "@/components/loads/loads-client";

/** Delivery-week loads from the truck sheets, so the Loads page count matches the dashboard. */
export async function sheetLoadsForWeek(weekStart: string): Promise<LoadListRow[]> {
  try {
    assertMonday(weekStart, "Week start");
  } catch {
    return [];
  }
  const bounds = weekBoundsForDate(weekStart);
  const loaded = await loadActiveTruckInsOuts(bounds.start, bounds.end).catch(() => ({
    rows: [],
    error: "Sheets were not read.",
  }));
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
      });
    }
  }
  return rows;
}

function milesNumber(hundredths: number | null): number | null {
  if (hundredths == null) return null;
  return hundredths / 100;
}
