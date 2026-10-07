import { loadTruckWeekInsOuts, missingGoogleServiceAccountEnv } from "@/lib/sheets/read";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { sheetLedgerRefs } from "@/lib/sheets/mismatch";
import { syncSheetMismatches } from "@/lib/sheets/sync-mismatches";
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
        truckClass: truck.truck_class,
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

export async function loadInsOutsWeek(
  weekStart: string,
  weekEnd: string,
): Promise<{
  rows: TruckWeekInsOuts[];
  error: string | null;
  sheetEnvMissing: string[];
  mismatchCount: number | null;
  mismatchError: string | null;
}> {
  const loaded = await loadActiveTruckInsOuts(weekStart, weekEnd);
  const sheetEnvMissing = missingGoogleServiceAccountEnv();
  if (loaded.error) {
    return {
      rows: loaded.rows,
      error: loaded.error,
      sheetEnvMissing,
      mismatchCount: null,
      mismatchError: loaded.error,
    };
  }
  const refs = sheetLedgerRefs(loaded.rows);
  const mismatch = await syncSheetMismatches({
    weekStart,
    weekEnd,
    sheet: refs.sheet,
    readableUnitKeys: refs.readableUnitKeys,
  });
  return {
    rows: loaded.rows,
    error: null,
    sheetEnvMissing,
    mismatchCount: mismatch.openCount,
    mismatchError: mismatch.error,
  };
}
