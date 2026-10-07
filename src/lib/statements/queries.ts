import { weekBoundsForDate, type FeeRuleKind, type TruckClass } from "@/lib/fee-engine";
import { isFixedExpenseKind, isChargedTo } from "@/lib/fixed-expenses/kinds";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { buildWeekStatements, lockPayload } from "./engine";
import { milesValueToHundredths } from "./miles";
import type {
  CloseImportRun,
  FleetStatement,
  StatementBlocker,
  StatementContract,
  StatementLine,
  UnitStatement,
  WeekStatementInput,
  WeekStatements,
} from "./types";

const FEE_KINDS = new Set<FeeRuleKind>([
  "DRIVER_PAY",
  "MANAGEMENT_FEE",
  "DISPATCH_FEE",
  "FACTORING_FEE",
  "TOLSON_PAYABLE",
  "LEGACY_RETAINED",
]);

export type StatementsPageData = {
  ready: boolean;
  lockReady: boolean;
  error: string | null;
  weekStart: string;
  weekEnd: string;
  locked: boolean;
  closedAt: string | null;
  closedBy: string | null;
  liveDiffers: boolean;
  units: UnitStatement[];
  fleet: FleetStatement;
  blockers: StatementBlocker[];
  /** Close checks from the current rows. Still filled when the week is locked. */
  liveBlockers: StatementBlocker[];
  closeAllowed: boolean;
};

const EMPTY_FLEET: FleetStatement = {
  grossCents: 0,
  driverPayCents: 0,
  managementFeeCents: 0,
  tolsonPayableCents: 0,
  legacyRetainedCents: 0,
  dispatchFeeCents: 0,
  factoringFeeCents: 0,
  fuelCents: 0,
  tollsCents: 0,
  fixedOwnerCents: 0,
  fixedManagementCents: 0,
  netCents: 0,
  loadCount: 0,
  unitCount: 0,
};

export function resolveWeekStart(raw: string | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!raw) return weekBoundsForDate(today).start;
  try {
    return weekBoundsForDate(raw).start;
  } catch {
    return weekBoundsForDate(today).start;
  }
}

export async function loadStatements(weekStart: string): Promise<StatementsPageData> {
  const supabase = await createClient();
  const bounds = weekBoundsForDate(weekStart);
  const schemaNotes: StatementBlocker[] = [];

  const [
    trucksRes,
    contractsRes,
    rulesRes,
    loadsRes,
    fuelRes,
    tollsRes,
    versionsRes,
    overridesRes,
    runsRes,
    settingsRes,
    closeRes,
  ] = await Promise.all([
    supabase.from("trucks").select("id, unit_number, truck_class"),
    supabase.from("fee_contracts").select("id, truck_id, effective_from, effective_to"),
    supabase.from("fee_rules").select("contract_id, kind, rate_bp, base_pct_bp"),
    Promise.all([
      supabase
        .from("loads")
        .select(
          "id, truck_id, truck_unit_number, delivery_date, week_start, rate_cents, loaded_distance_mi, deadhead_miles",
        )
        .eq("week_start", weekStart),
      supabase
        .from("loads")
        .select(
          "id, truck_id, truck_unit_number, delivery_date, week_start, rate_cents, loaded_distance_mi, deadhead_miles",
        )
        .gte("delivery_date", bounds.start)
        .lte("delivery_date", bounds.end),
    ]).then(([byWeek, byDelivery]) => {
      if (byWeek.error) return byWeek;
      if (byDelivery.error) return byDelivery;
      const merged = new Map<string, NonNullable<typeof byWeek.data>[number]>();
      for (const row of [...(byWeek.data ?? []), ...(byDelivery.data ?? [])]) {
        merged.set(row.id, row);
      }
      return { data: [...merged.values()], error: null };
    }),
    supabase
      .from("fuel_transactions")
      .select("unit_number, week_start, amount_cents")
      .eq("week_start", weekStart),
    supabase
      .from("toll_transactions")
      .select("unit_number, week_start, amount_cents")
      .eq("week_start", weekStart),
    supabase
      .from("truck_fixed_expenses")
      .select("id, truck_id, kind, weekly_amount_cents, charged_to, effective_from, effective_to"),
    supabase
      .from("truck_fixed_expense_overrides")
      .select("id, truck_id, kind, week_start, amount_cents, charged_to"),
    supabase
      .from("import_runs")
      .select("kind, status, range_from, range_to, rows_fetched, finished_at")
      .order("finished_at", { ascending: false })
      .limit(200),
    supabase
      .from("import_settings")
      .select("key, value_int")
      .in("key", [
        "row_count_drop_block_pct",
        "fuel_row_count_drop_block_pct",
        "toll_row_count_drop_block_pct",
      ]),
    supabase.from("week_closes").select("id, week_start, closed_at, closed_by").eq("week_start", weekStart).maybeSingle(),
  ]);

  if (trucksRes.error) {
    return failed(bounds, trucksRes.error.message);
  }

  noteMissing(loadsRes.error, schemaNotes, "Loads are not available until the v0.0.0.4 migration is applied.");
  noteMissing(fuelRes.error, schemaNotes, "Fuel is not available until the v0.0.0.7 migration is applied.");
  noteMissing(tollsRes.error, schemaNotes, "Tolls are not available until the v0.0.0.7 migration is applied.");
  noteMissing(
    versionsRes.error,
    schemaNotes,
    "Fixed expenses are not available until the v0.0.0.6 migration is applied.",
  );

  const hard = [
    contractsRes.error,
    rulesRes.error,
    loadsRes.error,
    fuelRes.error,
    tollsRes.error,
    overridesRes.error,
    runsRes.error,
    settingsRes.error,
  ].find((error) => error && !isMissingSchemaError(error));
  if (hard) return failed(bounds, hard.message);

  const lockMissing = closeRes.error ? isMissingSchemaError(closeRes.error) : false;
  if (closeRes.error && !lockMissing) return failed(bounds, closeRes.error.message);

  const contracts = groupContracts(contractsRes.data ?? [], rulesRes.data ?? []);
  const input: WeekStatementInput = {
    weekStart: bounds.start,
    trucks: (trucksRes.data ?? []).map((truck) => ({
      id: truck.id,
      unitNumber: truck.unit_number,
      truckClass: truck.truck_class,
    })),
    contracts,
    loads: (loadsRes.error ? [] : (loadsRes.data ?? [])).map((load) => ({
      id: load.id,
      truckId: load.truck_id,
      unitNumber: load.truck_unit_number,
      deliveryDate: load.delivery_date,
      storedWeekStart: load.week_start,
      grossCents: load.rate_cents,
      loadedMilesHundredths: milesValueToHundredths(load.loaded_distance_mi),
      deadheadMilesHundredths: milesValueToHundredths(load.deadhead_miles),
    })),
    fuel: (fuelRes.error ? [] : (fuelRes.data ?? [])).map((row) => ({
      unitNumber: row.unit_number,
      weekStart: row.week_start,
      amountCents: row.amount_cents,
    })),
    tolls: (tollsRes.error ? [] : (tollsRes.data ?? [])).map((row) => ({
      unitNumber: row.unit_number,
      weekStart: row.week_start,
      amountCents: row.amount_cents,
    })),
    fixedVersions: (versionsRes.error ? [] : (versionsRes.data ?? []))
      .filter((row) => isFixedExpenseKind(row.kind) && isChargedTo(row.charged_to))
      .map((row) => ({
        id: row.id,
        truckId: row.truck_id,
        kind: row.kind,
        weeklyAmountCents: row.weekly_amount_cents,
        chargedTo: row.charged_to,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
      })),
    fixedOverrides: (overridesRes.error ? [] : (overridesRes.data ?? []))
      .filter((row) => isFixedExpenseKind(row.kind) && isChargedTo(row.charged_to))
      .map((row) => ({
        id: row.id,
        truckId: row.truck_id,
        kind: row.kind,
        weekStart: row.week_start,
        amountCents: row.amount_cents,
        chargedTo: row.charged_to,
      })),
    importRuns: mapRuns(runsRes.error ? [] : (runsRes.data ?? [])),
    rowCountDropPct: {
      loads: settingPct(settingsRes.data ?? [], "row_count_drop_block_pct"),
      fuel: settingPct(settingsRes.data ?? [], "fuel_row_count_drop_block_pct"),
      tolls: settingPct(settingsRes.data ?? [], "toll_row_count_drop_block_pct"),
    },
  };

  let live: WeekStatements;
  try {
    live = buildWeekStatements(input);
  } catch (err) {
    return failed(bounds, err instanceof Error ? err.message : "Could not compute this week.");
  }
  live.blockers.push(...schemaNotes);
  live.closeAllowed = live.blockers.length === 0;

  const lockedRow = closeRes.error ? null : closeRes.data;
  if (!lockedRow) {
    return {
      ready: true,
      lockReady: !lockMissing,
      error: null,
      weekStart: live.weekStart,
      weekEnd: live.weekEnd,
      locked: false,
      closedAt: null,
      closedBy: null,
      liveDiffers: false,
      units: live.units,
      fleet: live.fleet,
      blockers: live.blockers,
      liveBlockers: live.blockers,
      closeAllowed: live.closeAllowed && !lockMissing,
    };
  }

  const { data: stored, error: storedError } = await supabase
    .from("weekly_statements")
    .select(
      "id, truck_id, unit_number, truck_class, contract_id, gross_cents, driver_pay_cents, management_fee_cents, tolson_payable_cents, legacy_retained_cents, dispatch_fee_cents, factoring_fee_cents, fuel_cents, tolls_cents, fixed_owner_cents, fixed_management_cents, net_cents, load_count, loaded_miles_hundredths, deadhead_miles_hundredths",
    )
    .eq("week_start", weekStart)
    .order("unit_number");
  if (storedError) return failed(bounds, storedError.message);

  const ids = (stored ?? []).map((row) => row.id);
  const { data: lineRows, error: lineError } = ids.length
    ? await supabase
        .from("weekly_statement_lines")
        .select(
          "statement_id, line_code, label, amount_cents, rate_bp, base_pct_bp, charged_to, owner_visible, sort_order",
        )
        .in("statement_id", ids)
    : { data: [], error: null };
  if (lineError) return failed(bounds, lineError.message);

  const units = (stored ?? []).map((row) => toStoredUnit(row, lineRows ?? []));
  const fleet = fleetFromUnits(units);

  return {
    ready: true,
    lockReady: true,
    error: null,
    weekStart: bounds.start,
    weekEnd: bounds.end,
    locked: true,
    closedAt: lockedRow.closed_at,
    closedBy: lockedRow.closed_by,
    liveDiffers: snapshotDiffers(units, live.units),
    units,
    fleet,
    blockers: [],
    liveBlockers: live.blockers,
    closeAllowed: false,
  };
}

export async function closeWeek(weekStart: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const page = await loadStatements(weekStart);
  if (page.error) return { ok: false, error: page.error };
  if (!page.lockReady) {
    return {
      ok: false,
      error: "Apply the v0.0.0.8 migration before closing a week.",
    };
  }
  if (page.locked) return { ok: false, error: "This week is already locked." };
  if (!page.closeAllowed) {
    const text = page.blockers.map((row) => row.message).join(" ");
    return { ok: false, error: text || "This week cannot be closed." };
  }

  let payload: ReturnType<typeof lockPayload>;
  try {
    payload = lockPayload({
      weekStart: page.weekStart,
      weekEnd: page.weekEnd,
      units: page.units,
      fleet: page.fleet,
      blockers: [],
      closeAllowed: true,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "This week cannot be closed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("lock_week", {
    p_week_start: weekStart,
    p_payload: payload as unknown as Json,
  });
  if (error) {
    if (isMissingSchemaError(error)) {
      return { ok: false, error: "Apply the v0.0.0.8 migration before closing a week." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

function failed(
  bounds: { start: string; end: string },
  error: string,
): StatementsPageData {
  return {
    ready: false,
    lockReady: false,
    error,
    weekStart: bounds.start,
    weekEnd: bounds.end,
    locked: false,
    closedAt: null,
    closedBy: null,
    liveDiffers: false,
    units: [],
    fleet: EMPTY_FLEET,
    blockers: [],
    liveBlockers: [],
    closeAllowed: false,
  };
}

function noteMissing(
  error: { code?: string; message: string } | null,
  notes: StatementBlocker[],
  message: string,
): void {
  if (error && isMissingSchemaError(error)) {
    notes.push({ rule: "schema_missing", message, ref: null });
  }
}

function settingPct(rows: Array<{ key: string; value_int: number | null }>, key: string): number {
  const found = rows.find((row) => row.key === key);
  return found?.value_int ?? 50;
}

function mapRuns(
  rows: Array<{
    kind: string | null | undefined;
    status: string;
    range_from: string;
    range_to: string;
    rows_fetched: number;
    finished_at: string | null;
  }>,
): CloseImportRun[] {
  const runs: CloseImportRun[] = [];
  for (const row of rows) {
    const kind = row.kind ?? "loads";
    if (kind !== "loads" && kind !== "fuel" && kind !== "tolls") continue;
    if (
      row.status !== "running" &&
      row.status !== "success" &&
      row.status !== "failed" &&
      row.status !== "blocked"
    ) {
      continue;
    }
    runs.push({
      kind,
      status: row.status,
      rangeFrom: row.range_from,
      rangeTo: row.range_to,
      rowsFetched: row.rows_fetched,
      finishedAt: row.finished_at,
    });
  }
  return runs;
}

function groupContracts(
  contracts: Array<{
    id: string;
    truck_id: string;
    effective_from: string;
    effective_to: string | null;
  }>,
  rules: Array<{ contract_id: string; kind: string; rate_bp: number; base_pct_bp: number }>,
): StatementContract[] {
  return contracts.map((contract) => ({
    id: contract.id,
    truckId: contract.truck_id,
    effectiveFrom: contract.effective_from,
    effectiveTo: contract.effective_to,
    rules: rules
      .filter((rule) => rule.contract_id === contract.id && FEE_KINDS.has(rule.kind as FeeRuleKind))
      .map((rule) => ({
        kind: rule.kind as FeeRuleKind,
        rateBp: rule.rate_bp,
        basePctBp: rule.base_pct_bp,
      })),
  }));
}

type StoredStatement = {
  id: string;
  truck_id: string;
  unit_number: string;
  truck_class: TruckClass;
  contract_id: string | null;
  gross_cents: number;
  driver_pay_cents: number;
  management_fee_cents: number;
  tolson_payable_cents: number;
  legacy_retained_cents: number;
  dispatch_fee_cents: number;
  factoring_fee_cents: number;
  fuel_cents: number;
  tolls_cents: number;
  fixed_owner_cents: number;
  fixed_management_cents: number;
  net_cents: number;
  load_count: number;
  loaded_miles_hundredths: number;
  deadhead_miles_hundredths: number;
};

function toStoredUnit(
  row: StoredStatement,
  lines: Array<{
    statement_id: string;
    line_code: string;
    label: string;
    amount_cents: number;
    rate_bp: number | null;
    base_pct_bp: number | null;
    charged_to: "owner" | "management" | null;
    owner_visible: boolean;
    sort_order: number;
  }>,
): UnitStatement {
  const unitLines: StatementLine[] = lines
    .filter((line) => line.statement_id === row.id)
    .map((line) => ({
      lineCode: line.line_code,
      label: line.label,
      amountCents: line.amount_cents,
      rateBp: line.rate_bp,
      basePctBp: line.base_pct_bp,
      chargedTo: line.charged_to,
      ownerVisible: line.owner_visible,
      sortOrder: line.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    truckId: row.truck_id,
    unitNumber: row.unit_number,
    truckClass: row.truck_class,
    contractId: row.contract_id,
    grossCents: row.gross_cents,
    driverPayCents: row.driver_pay_cents,
    managementFeeCents: row.management_fee_cents,
    tolsonPayableCents: row.tolson_payable_cents,
    legacyRetainedCents: row.legacy_retained_cents,
    dispatchFeeCents: row.dispatch_fee_cents,
    factoringFeeCents: row.factoring_fee_cents,
    fuelCents: row.fuel_cents,
    tollsCents: row.tolls_cents,
    fixedOwnerCents: row.fixed_owner_cents,
    fixedManagementCents: row.fixed_management_cents,
    netCents: row.net_cents,
    loadCount: row.load_count,
    loadedMilesHundredths: row.loaded_miles_hundredths,
    deadheadMilesHundredths: row.deadhead_miles_hundredths,
    lines: unitLines,
  };
}

function fleetFromUnits(units: UnitStatement[]): FleetStatement {
  const fleet = { ...EMPTY_FLEET, unitCount: units.length };
  for (const unit of units) {
    fleet.grossCents += unit.grossCents;
    fleet.driverPayCents += unit.driverPayCents;
    fleet.managementFeeCents += unit.managementFeeCents;
    fleet.tolsonPayableCents += unit.tolsonPayableCents;
    fleet.legacyRetainedCents += unit.legacyRetainedCents;
    fleet.dispatchFeeCents += unit.dispatchFeeCents;
    fleet.factoringFeeCents += unit.factoringFeeCents;
    fleet.fuelCents += unit.fuelCents;
    fleet.tollsCents += unit.tollsCents;
    fleet.fixedOwnerCents += unit.fixedOwnerCents;
    fleet.fixedManagementCents += unit.fixedManagementCents;
    fleet.netCents += unit.netCents;
    fleet.loadCount += unit.loadCount;
  }
  return fleet;
}

function snapshotDiffers(locked: UnitStatement[], live: UnitStatement[]): boolean {
  if (locked.length !== live.length) return true;
  for (const row of locked) {
    const other = live.find((unit) => unit.truckId === row.truckId);
    if (!other) return true;
    if (
      other.grossCents !== row.grossCents ||
      other.netCents !== row.netCents ||
      other.fuelCents !== row.fuelCents ||
      other.tollsCents !== row.tollsCents
    ) {
      return true;
    }
  }
  return false;
}
