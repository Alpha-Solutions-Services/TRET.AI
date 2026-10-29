import { tryPercentStringToBp } from "@/lib/fees/percent";
import { loadFeeSettings } from "@/lib/fees/load";
import { unitDigits, type FeeRatePair } from "@/lib/fees/two-lines";
import { buildTruckWeekInsOuts, type TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { loadTruckWeekInsOuts, missingGoogleServiceAccountEnv } from "@/lib/sheets/read";
import { sheetLedgerRefs } from "@/lib/sheets/mismatch";
import { syncSheetMismatches } from "@/lib/sheets/sync-mismatches";
import { listTrucks } from "@/lib/trucks/queries";
import { applyTonuConfirmations } from "@/lib/documents/tonu-flag";
import { listConfirmedTonuRates } from "@/lib/documents/store";
import { missingSheetLinkNote } from "@/lib/trucks/fields";

export async function loadActiveTruckInsOuts(
  weekStart: string,
  weekEnd: string,
): Promise<{ rows: TruckWeekInsOuts[]; error: string | null }> {
  try {
    const [{ trucks }, fees] = await Promise.all([listTrucks(), loadFeeSettings().catch(() => null)]);
    const active = trucks.filter((truck) => truck.active);
    const confirmed = await listConfirmedTonuRates().catch(() => ({}));
    const rows = ensureFleetUnits(
      await loadTruckWeekInsOuts(
        active.map((truck) => ({
          unitNumber: truck.unit_number,
          truckName: truck.name,
          googleSheetUrl: truck.google_sheet_url,
          truckClass: truck.truck_class,
          feeRates: feeRatesFor(truck.unit_number, fees?.rows ?? []),
        })),
        weekStart,
        weekEnd,
        { confirmedCentsByLoadId: confirmed },
      ),
      weekStart,
      weekEnd,
    );
    return { rows: applyTonuConfirmations(rows, confirmed), error: null };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : "Ins and Outs could not be loaded.",
    };
  }
}

function feeRatesFor(
  unitNumber: string,
  rows: Array<{ unitNumber: string; legacyFeePct: string; tolsonLeaseFeePct: string }>,
): FeeRatePair | undefined {
  const row = rows.find((item) => unitDigits(item.unitNumber) === unitDigits(unitNumber));
  if (!row) return undefined;
  const legacy = tryPercentStringToBp(row.legacyFeePct);
  const tolson = tryPercentStringToBp(row.tolsonLeaseFeePct);
  if (!legacy.ok || !tolson.ok) return undefined;
  return { legacyFeeBp: legacy.bp, tolsonLeaseFeeBp: tolson.bp };
}

const FLEET_UNITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

function unitKey(unitNumber: string): string {
  return unitNumber.replace(/\D/g, "").replace(/^0+/, "") || unitNumber.trim();
}

/** Trucks 1 through 10 stay on the week report. A missing sheet link shows zeros until it is pasted. */
function ensureFleetUnits(rows: TruckWeekInsOuts[], weekStart: string, weekEnd: string): TruckWeekInsOuts[] {
  const present = new Set(rows.map((row) => unitKey(row.unitNumber)));
  const extra = FLEET_UNITS.filter((unit) => !present.has(unit)).map((unit) =>
    buildTruckWeekInsOuts({
      unitNumber: unit,
      truckName: `Truck ${unit}`,
      truckClass: unit === "3" ? "tolson_owned" : "third_party",
      weekStart,
      weekEnd,
      loadLedger: null,
      mgmtExpenses: null,
      weeklyExpenses: null,
      note: missingSheetLinkNote(unit),
    }),
  );
  return [...rows, ...extra].sort((a, b) => Number(unitKey(a.unitNumber)) - Number(unitKey(b.unitNumber)));
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
