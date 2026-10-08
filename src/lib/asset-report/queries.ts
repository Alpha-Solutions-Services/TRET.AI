import { weekBoundsForDate } from "@/lib/fee-engine";
import { buildAssetReport } from "@/lib/asset-report/build";
import { loadStoredWeekTotals } from "@/lib/import-pipeline/stored";
import { unitKey } from "@/lib/sheets/mismatch";
import { renderAssetReportPdf } from "@/lib/asset-report/pdf";
import { manifestRefsByLoad } from "@/lib/asset-report/manifest-refs";
import { loadTruckWorkbook } from "@/lib/sheets/read";
import { createClient } from "@/lib/supabase/server";
import { listTrucks } from "@/lib/trucks/queries";

export async function buildAssetReportPdf(weekStart: string, unitNumber: string): Promise<Uint8Array> {
  const bounds = weekBoundsForDate(weekStart);
  const { trucks } = await listTrucks();
  const truck = trucks.find(
    (row) => row.unit_number === unitNumber || unitKey(row.unit_number) === unitKey(unitNumber),
  );
  if (!truck) throw new Error("That truck was not found.");
  const book = await loadTruckWorkbook({
    unitNumber: truck.unit_number,
    googleSheetUrl: truck.google_sheet_url,
  });
  const extras = await loadDbFuelAndTolls(truck.unit_number, bounds.start);
  const imported = (await loadStoredWeekTotals(bounds.start)).find(
    (row) => unitKey(row.unitNumber) === unitKey(truck.unit_number),
  );
  const report = buildAssetReport({
    weekStart: bounds.start,
    weekEnd: bounds.end,
    unitNumber: truck.unit_number,
    truckName: truck.name,
    ownerName: truck.owner_name,
    ledger: book.loadLedger,
    weekly: book.weeklyExpenses,
    fuelLog: book.fuelLog,
    fleet: book.fleetDirectory,
    sheetNote: book.note,
    dbFuelCents: extras.fuelCents,
    dbGallonsMilli: extras.gallonsMilli,
    dbTollCents: extras.tollCents,
    manifestRefs: await loadManifestRefs(truck.unit_number),
    importTotals: imported
      ? {
          fuelCostCents: imported.fuelCostCents,
          tollCents: imported.tollCents,
          dieselGallonsMilli: imported.dieselGallonsMilli,
          loadedMilesHundredths: imported.loadedMilesHundredths,
          deadheadMilesHundredths: imported.deadheadMilesHundredths,
          dispatchMilesHundredths: imported.dispatchMilesHundredths,
        }
      : null,
  });
  return renderAssetReportPdf(report);
}

async function loadManifestRefs(unitNumber: string): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("loads")
      .select("load_id, source_manifest_ref, truck_unit_number, delivery_date");
    if (error || !data) return {};
    return manifestRefsByLoad(data, unitNumber);
  } catch {
    return {};
  }
}

async function loadDbFuelAndTolls(
  unitNumber: string,
  weekStart: string,
): Promise<{ fuelCents: number; gallonsMilli: number; tollCents: number }> {
  try {
    const supabase = await createClient();
    const [fuel, tolls] = await Promise.all([
      supabase
        .from("fuel_transactions")
        .select("amount_cents, gallons_milli, unit_number, week_start")
        .eq("week_start", weekStart),
      supabase
        .from("toll_transactions")
        .select("amount_cents, unit_number, week_start")
        .eq("week_start", weekStart),
    ]);
    const fuelRows = (fuel.data ?? []).filter((row) => row.unit_number && unitKey(row.unit_number) === unitKey(unitNumber));
    const tollRows = (tolls.data ?? []).filter((row) => row.unit_number && unitKey(row.unit_number) === unitKey(unitNumber));
    return {
      fuelCents: fuelRows.reduce((sum, row) => sum + row.amount_cents, 0),
      gallonsMilli: fuelRows.reduce((sum, row) => sum + row.gallons_milli, 0),
      tollCents: tollRows.reduce((sum, row) => sum + row.amount_cents, 0),
    };
  } catch {
    return { fuelCents: 0, gallonsMilli: 0, tollCents: 0 };
  }
}
