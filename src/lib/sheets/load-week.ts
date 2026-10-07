import { loadTruckWeekInsOuts } from "@/lib/sheets/read";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { listTrucks } from "@/lib/trucks/queries";

export async function loadActiveTruckInsOuts(
  weekStart: string,
  weekEnd: string,
): Promise<{ rows: TruckWeekInsOuts[]; error: string | null }> {
  try {
    const { trucks } = await listTrucks();
    const active = trucks.filter((truck) => truck.active);
    const rows = await loadTruckWeekInsOuts(
      active.map((truck) => ({
        unitNumber: truck.unit_number,
        truckName: truck.name,
        googleSheetUrl: truck.google_sheet_url,
      })),
      weekStart,
      weekEnd,
    );
    return { rows, error: null };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : "Ins and Outs could not be loaded.",
    };
  }
}
