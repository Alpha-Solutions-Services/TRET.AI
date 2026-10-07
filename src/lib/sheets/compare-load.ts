import { checkAccess } from "@/lib/auth/access";
import { canonicalLoadId, loadIdLookupForms, loadMatchKey } from "@/lib/loads/load-id";
import { isAdminRole } from "@/lib/quickbooks/admin";
import {
  alignSheetAndVektor,
  type AlignedLoad,
  type DateKind,
  type FieldAcceptance,
  type LoadFacts,
} from "@/lib/sheets/align";
import { loadInsOutsWeek } from "@/lib/sheets/load-week";
import { unitKey } from "@/lib/sheets/mismatch";
import { editorAccessToken, spreadsheetCanEdit } from "@/lib/sheets/write-cell";
import { milesValueToHundredths } from "@/lib/statements/miles";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

const LOAD_COLUMNS =
  "load_id, rate_cents, truck_unit_number, delivery_date, pickup_date, loaded_distance_mi, deadhead_miles, driver_name, delivery_date_kind, pickup_date_kind";
const LOAD_COLUMNS_BASE =
  "load_id, rate_cents, truck_unit_number, delivery_date, pickup_date, loaded_distance_mi, deadhead_miles, driver_name";

export type FieldDecisionRow = {
  id: string;
  unitNumber: string;
  loadId: string;
  loadKey: string;
  field: string;
  choice: string;
  note: string;
  previousValue: string | null;
  newValue: string | null;
  createdAt: string;
};

export type SheetCompareData = {
  weekStart: string;
  weekEnd: string;
  unit: string;
  trucks: Array<{ unitNumber: string; truckName: string }>;
  rows: AlignedLoad[];
  decisions: FieldDecisionRow[];
  isAdmin: boolean;
  sheetEditable: Record<string, boolean>;
  error: string | null;
};

type LoadRow = {
  load_id: string | null;
  rate_cents: number | null;
  truck_unit_number: string | null;
  delivery_date: string;
  pickup_date: string | null;
  loaded_distance_mi: number | null;
  deadhead_miles: number | null;
  driver_name: string | null;
  delivery_date_kind?: string | null;
  pickup_date_kind?: string | null;
};

function dateKind(value: unknown): DateKind {
  return value === "manifest" || value === "order" ? value : null;
}

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

function spreadsheetIdFromUrl(url: string): string | null {
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url.trim());
  return match?.[1] ?? null;
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
        loadId: canonicalLoadId(load.loadId),
        deliveryDay: load.deliveryDay,
        pickupDay: load.pickupDay,
        rateCents: load.rateCents,
        loadedMilesHundredths: load.loadedMilesHundredths,
        deadheadMilesHundredths: load.deadheadMilesHundredths,
        driverName: load.driverName,
        deliveryDateKind: null,
        pickupDateKind: null,
      });
    }
  }

  const supabase = await createClient();
  const access = await checkAccess();
  const isAdmin = access.status === "allowed" && isAdminRole(access.role);

  const weekRows = await selectLoads(() =>
    supabase
      .from("loads")
      .select(LOAD_COLUMNS)
      .gte("delivery_date", input.weekStart)
      .lte("delivery_date", input.weekEnd),
    () =>
      supabase
        .from("loads")
        .select(LOAD_COLUMNS_BASE)
        .gte("delivery_date", input.weekStart)
        .lte("delivery_date", input.weekEnd),
  );
  if (weekRows.error) {
    return empty(input, unit, trucks, weekRows.error);
  }

  const sheetIds = [...new Set(sheet.flatMap((row) => loadIdLookupForms(row.loadId)))];
  let outside: LoadRow[] = [];
  if (sheetIds.length > 0) {
    const extra = await selectLoads(
      () => supabase.from("loads").select(LOAD_COLUMNS).in("load_id", sheetIds),
      () => supabase.from("loads").select(LOAD_COLUMNS_BASE).in("load_id", sheetIds),
    );
    if (extra.error) return empty(input, unit, trucks, extra.error);
    outside = extra.rows;
  }

  const merged = new Map<string, LoadRow>();
  for (const row of [...weekRows.rows, ...outside]) {
    if (!row.load_id || !row.truck_unit_number) continue;
    const key = `${unitKey(row.truck_unit_number)}|${loadMatchKey(row.load_id)}`;
    const existing = merged.get(key);
    if (!existing || row.load_id === canonicalLoadId(row.load_id)) merged.set(key, row);
  }

  const vektor: LoadFacts[] = [];
  for (const row of merged.values()) {
    const unitNumber = row.truck_unit_number as string;
    if (wanted && unitKey(unitNumber) !== wanted) continue;
    if (!wanted && !chosen.some((truck) => unitKey(truck.unitNumber) === unitKey(unitNumber))) continue;
    vektor.push({
      unitNumber,
      loadId: canonicalLoadId(row.load_id as string),
      deliveryDay: String(row.delivery_date).slice(0, 10),
      pickupDay: row.pickup_date ? String(row.pickup_date).slice(0, 10) : null,
      rateCents: row.rate_cents,
      loadedMilesHundredths: milesOrNull(row.loaded_distance_mi),
      deadheadMilesHundredths: milesOrNull(row.deadhead_miles),
      driverName: row.driver_name,
      deliveryDateKind: dateKind(row.delivery_date_kind),
      pickupDateKind: dateKind(row.pickup_date_kind),
    });
  }

  const acceptances = await loadAcceptances(supabase);
  const decisions = await loadDecisions(supabase);
  const sheetEditable = await loadEditable(supabase, chosen.map((row) => row.unitNumber));

  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    unit,
    trucks,
    rows: alignSheetAndVektor({ weekStart: input.weekStart, sheet, vektor, acceptances }),
    decisions,
    isAdmin,
    sheetEditable,
    error: loaded.error,
  };
}

function empty(
  input: { weekStart: string; weekEnd: string },
  unit: string,
  trucks: Array<{ unitNumber: string; truckName: string }>,
  error: string,
): SheetCompareData {
  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    unit,
    trucks,
    rows: [],
    decisions: [],
    isAdmin: false,
    sheetEditable: {},
    error,
  };
}

async function selectLoads(
  full: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  base: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ rows: LoadRow[]; error: string | null }> {
  const first = await full();
  if (!first.error) return { rows: (first.data as LoadRow[] | null) ?? [], error: null };
  if (!/delivery_date_kind|pickup_date_kind|schema cache/i.test(first.error.message)) {
    return { rows: [], error: first.error.message };
  }
  const second = await base();
  if (second.error) return { rows: [], error: second.error.message };
  return { rows: (second.data as LoadRow[] | null) ?? [], error: null };
}

async function loadAcceptances(supabase: Awaited<ReturnType<typeof createClient>>): Promise<FieldAcceptance[]> {
  const { data, error } = await supabase
    .from("load_field_acceptances")
    .select("unit_number, load_key, field, accepted_value");
  if (error) return [];
  return (data ?? []).map((row) => ({
    unitNumber: row.unit_number,
    loadId: row.load_key,
    field: row.field,
    acceptedValue: row.accepted_value,
  }));
}

async function loadDecisions(supabase: Awaited<ReturnType<typeof createClient>>): Promise<FieldDecisionRow[]> {
  const { data, error } = await supabase
    .from("load_field_decisions")
    .select("id, unit_number, load_id, load_key, field, choice, note, previous_value, new_value, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error && isMissingSchemaError(error)) return [];
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    unitNumber: row.unit_number,
    loadId: row.load_id,
    loadKey: row.load_key,
    field: row.field,
    choice: row.choice,
    note: row.note,
    previousValue: row.previous_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  }));
}

async function loadEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  units: string[],
): Promise<Record<string, boolean>> {
  const editable: Record<string, boolean> = {};
  if (units.length === 0) return editable;
  const { data, error } = await supabase.from("trucks").select("unit_number, google_sheet_url");
  if (error || !data) return editable;
  const token = await editorAccessToken(process.env, fetch).catch(() => null);
  const bySheet = new Map<string, boolean>();
  for (const row of data) {
    const key = unitKey(row.unit_number);
    if (!units.some((unit) => unitKey(unit) === key)) continue;
    const sheetId = row.google_sheet_url ? spreadsheetIdFromUrl(row.google_sheet_url) : null;
    if (!token || !sheetId) {
      editable[key] = false;
      continue;
    }
    if (!bySheet.has(sheetId)) {
      bySheet.set(sheetId, await spreadsheetCanEdit(sheetId, token, fetch).catch(() => false));
    }
    editable[key] = bySheet.get(sheetId) === true;
  }
  return editable;
}
