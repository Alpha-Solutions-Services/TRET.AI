import { tryPercentStringToBp } from "@/lib/fees/percent";
import { loadFeeSettings } from "@/lib/fees/load";
import { unitDigits, type FeeRatePair } from "@/lib/fees/two-lines";
import { buildTruckWeekInsOuts, type TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { loadTruckWeekInsOuts, missingGoogleServiceAccountEnv } from "@/lib/sheets/read";
import { sheetLedgerRefs } from "@/lib/sheets/mismatch";
import { syncSheetMismatches } from "@/lib/sheets/sync-mismatches";
import { listTrucks } from "@/lib/trucks/queries";
import { OWNER_CONFIRMED_TONU_CENTS, applyTonuConfirmations } from "@/lib/documents/tonu-flag";
import { listConfirmedTonuRates } from "@/lib/documents/store";
import { missingSheetLinkNote } from "@/lib/trucks/fields";
import { canonicalLoadId } from "@/lib/loads/load-id";
import { DEFAULT_TARP_CENTS, TARP_SETTING_KEY, defaultTarpByLoadId } from "@/lib/loads/tarps";
import { createClient } from "@/lib/supabase/server";

export async function loadActiveTruckInsOuts(
  weekStart: string,
  weekEnd: string,
): Promise<{ rows: TruckWeekInsOuts[]; error: string | null }> {
  try {
    const [{ trucks }, fees] = await Promise.all([listTrucks(), loadFeeSettings().catch(() => null)]);
    const active = trucks.filter((truck) => truck.active);
    const tarp = await loadTarpConfig();
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
        { tarpCentsPerLoad: tarp.rateCents, tarpByLoadId: tarp.byLoadId },
      ),
      weekStart,
      weekEnd,
    );
    const confirmed = await listConfirmedTonuRates().catch(() => ({}));
    return {
      rows: applyTonuConfirmations(rows, { ...OWNER_CONFIRMED_TONU_CENTS, ...confirmed }),
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : "Ins and Outs could not be loaded.",
    };
  }
}

async function loadTarpConfig(): Promise<{ rateCents: number; byLoadId: Map<string, number> }> {
  let rateCents = DEFAULT_TARP_CENTS;
  const byLoadId = defaultTarpByLoadId(rateCents);
  try {
    const supabase = await createClient();
    const setting = await supabase
      .from("import_settings")
      .select("value_int")
      .eq("key", TARP_SETTING_KEY)
      .maybeSingle();
    if (!setting.error && setting.data?.value_int != null && setting.data.value_int >= 0) {
      rateCents = setting.data.value_int;
      for (const id of byLoadId.keys()) byLoadId.set(id, rateCents);
    }
    const loads = await supabase.from("loads").select("load_id, tarped, tarp_cents").eq("tarped", true);
    if (!loads.error) {
      for (const row of loads.data ?? []) {
        if (!row.load_id) continue;
        const cents = row.tarp_cents > 0 ? row.tarp_cents : rateCents;
        byLoadId.set(canonicalLoadId(row.load_id), cents);
      }
    }
  } catch {
    return { rateCents, byLoadId };
  }
  return { rateCents, byLoadId };
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
