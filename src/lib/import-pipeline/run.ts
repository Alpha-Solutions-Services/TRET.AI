import { canonicalTripId } from "@/lib/fuel-tolls/file/link";
import { SEEDED_IDENTITIES, truckLabel, type TruckIdentity } from "@/lib/fuel-tolls/file/mappings";
import { AI_BUSY_NOTE } from "@/lib/fuel-tolls/file/messages";
import { parseGrid } from "@/lib/fuel-tolls/file/parse";
import { prepareImport } from "@/lib/fuel-tolls/file/prepare";
import { fuelLogTab, ledgerTab } from "@/lib/fuel-tolls/file/sheet-columns";
import type { ImportContext, PlanResult } from "@/lib/fuel-tolls/file/types";
import { suggestAssignment, suggestLoadColumnMap } from "@/lib/llm-gateway/gemini";
import { geminiConfigured } from "@/lib/llm-gateway/gemini";
import { manifestGroupKey } from "@/lib/loads/manifest-miles";
import { parseCsv } from "@/lib/fuel-tolls/csv";
import { sheetAmountToCents } from "@/lib/sheets/cell";
import { columnLetter, sheetCellValue, type SheetWriteField } from "@/lib/sheets/write-cell";
import { unitKey } from "@/lib/sheets/mismatch";
import { loadRowsToManifests } from "@/lib/vektor/adapters/load-rows";
import { parseVektorLoadsCsv } from "@/lib/vektor/csv-loads";
import { timestampToDate } from "@/lib/vektor/dates";
import type { LookupMaps } from "@/lib/vektor/map";
import { runImportPipeline, type PromoteDecision } from "@/lib/vektor/pipeline";
import type { ImportSettings } from "@/lib/vektor/validate";
import type { VektorManifest } from "@/lib/vektor/types";
import {
  buildTruckWeeks,
  displayedFuelToll,
  distanceStringToHundredths,
  weekForDay,
  type AggregateFuel,
  type AggregateMiles,
  type AggregateToll,
  type TruckWeekTotals,
} from "./aggregate";

type Sleep = (ms: number) => Promise<void>;

const TOLL_COLUMN = 44;

export type ReviewItem = {
  source: "vektor" | "fuel" | "toll";
  unitNumber: string | null;
  label: string;
  reason: string;
};

export type FuelSheetWrite = {
  unitNumber: string;
  weekStart: string;
  tab: string;
  header: string;
  a1: string;
  value: string;
};

export type TollSheetWrite = {
  unitNumber: string;
  weekStart: string;
  loadId: string;
  tab: string;
  header: string;
  a1: string;
  value: string;
  amountCents: number;
};

export type VektorSheetWrite = {
  unitNumber: string;
  loadId: string;
  tab: string;
  field: SheetWriteField;
  value: string;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
};

export type ApprovedWrites = {
  fuel: FuelSheetWrite[];
  tolls: TollSheetWrite[];
  vektor: VektorSheetWrite[];
};

export type SharedImportResult = {
  file: PlanResult | null;
  fuel: PlanResult | null;
  toll: PlanResult | null;
  loadMatch: ReturnType<typeof runImportPipeline>;
  totals: TruckWeekTotals[];
  /** Sheet cells that wait for owner approval. Nothing here is sent to Google. */
  writes: ApprovedWrites;
  review: ReviewItem[];
  aiNotice: string | null;
};

export type SharedImportInput = {
  vektorCsv?: string | null;
  vektorMapping?: Record<string, string> | null;
  vektorManifests?: readonly VektorManifest[] | null;
  vektorLookups?: LookupMaps | null;
  knownTruckUnits?: ReadonlySet<string>;
  range?: { from: string; to: string };
  previousFetched?: number | null;
  settings?: ImportSettings;
  fileGrid?: string[][] | null;
  fuelGrid?: string[][] | null;
  tollGrid?: string[][] | null;
  context?: ImportContext;
  identities?: readonly TruckIdentity[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
};

const EMPTY_MATCH: ReturnType<typeof runImportPipeline> = {
  blocked: false,
  blockIssue: null,
  decisions: [],
  statusCounts: {},
  duplicateIssues: [],
};

function headerCells(grid: string[][]): string[] {
  const header = grid.find((row) => row.some((cell) => cell.trim()));
  return (header ?? []).map((cell) => cell.trim()).filter(Boolean);
}

function tripFromRef(ref: string | null | undefined): string {
  const key = manifestGroupKey(ref);
  if (!key || !/^\d+$/.test(key)) return "";
  return canonicalTripId(`M-${key}`);
}

/**
 * Parse, match by rules, then Gemini for an unknown layout or an unmatched row.
 * Gemini suggestions stay in the review list. Totals and sheet plans use matched rows only.
 * This function does not call Google Sheets.
 */
export async function runSharedImport(input: SharedImportInput = {}): Promise<SharedImportResult> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const identities = input.identities ?? SEEDED_IDENTITIES;
  const known = input.knownTruckUnits ?? new Set(identities.map((row) => row.unitNumber));
  let aiNotice: string | null = null;
  const review: ReviewItem[] = [];

  const loads = await matchLoads(input, known, env, fetchImpl, input.sleep, (notice) => {
    aiNotice = notice;
  }, review);

  const context = contextWithLoads(input.context ?? {}, loads.promoted);
  let fuelGrid = input.fuelGrid ?? null;
  let tollGrid = input.tollGrid ?? null;
  let unknownGrid: string[][] | null = null;
  if (input.fileGrid) {
    const kind = parseGrid(input.fileGrid).kind;
    if (kind === "fuel") fuelGrid = input.fileGrid;
    else if (kind === "toll") tollGrid = input.fileGrid;
    else unknownGrid = input.fileGrid;
  }

  const fuel = fuelGrid ? await prepareImport(fuelGrid, context, identities, env, fetchImpl, input.sleep) : null;
  const toll = tollGrid ? await prepareImport(tollGrid, context, identities, env, fetchImpl, input.sleep) : null;
  const unknown = unknownGrid
    ? await prepareImport(unknownGrid, context, identities, env, fetchImpl, input.sleep)
    : null;
  for (const plan of [fuel, toll, unknown]) {
    if (plan?.aiNotice) aiNotice = plan.aiNotice;
    for (const row of plan?.rows ?? []) {
      if (row.status !== "flagged" && !row.queue) continue;
      review.push({
        source: row.kind,
        unitNumber: row.unitNumber,
        label: row.truck ?? row.link ?? `Row ${row.sourceRow}`,
        reason: row.reason ?? "Needs review.",
      });
    }
  }

  const file = unknown ?? (input.fileGrid ? (fuel ?? toll) : null);
  const totals = totalsFromMatched(loads.promoted, fuel, toll);
  return {
    file,
    fuel,
    toll,
    loadMatch: loads.match,
    totals,
    writes: writesFromMatched(loads.promoted, fuel, toll),
    review,
    aiNotice,
  };
}

type PromotedLoad = {
  unitNumber: string;
  loadId: string;
  tripId: string;
  manifestRef: string | null;
  deliveryDay: string;
  pickupDay: string | null;
  weekStart: string;
  weekEnd: string;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
  rateCents: number;
  driver: string;
};

async function matchLoads(
  input: SharedImportInput,
  known: ReadonlySet<string>,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  sleep: Sleep | undefined,
  setNotice: (notice: string) => void,
  review: ReviewItem[],
): Promise<{ match: ReturnType<typeof runImportPipeline>; promoted: PromotedLoad[] }> {
  const csvText = input.vektorCsv?.trim() ? input.vektorCsv : null;
  const apiManifests = input.vektorManifests ?? [];
  if (!csvText && apiManifests.length === 0) return { match: EMPTY_MATCH, promoted: [] };

  let mapping = input.vektorMapping ?? null;
  let parsed = csvText ? parseVektorLoadsCsv(csvText, mapping, input.range) : null;
  if (parsed && !parsed.headerFound && csvText && geminiConfigured(env)) {
    const mapped = await suggestLoadColumnMap(headerCells(parseCsv(csvText)), env, fetchImpl, sleep);
    if (mapped.busy) {
      setNotice(AI_BUSY_NOTE);
      review.push({ source: "vektor", unitNumber: null, label: "Loads file", reason: AI_BUSY_NOTE });
    } else if (mapped.map) {
      mapping = mapped.map;
      parsed = parseVektorLoadsCsv(csvText, mapping, input.range);
    }
  }
  if (parsed && !parsed.headerFound) {
    review.push({
      source: "vektor",
      unitNumber: null,
      label: "Loads file",
      reason: "CSV header row was not found. Expected Order ID, Gross, and a delivery date.",
    });
  }

  const csvRows = (parsed?.rows ?? []).flatMap((row) => (row.importRow ? [row.importRow] : []));
  const fromCsv = csvRows.length > 0 ? loadRowsToManifests(csvRows) : null;
  const manifests = [...(fromCsv?.manifests ?? []), ...apiManifests];
  if (manifests.length === 0) return { match: EMPTY_MATCH, promoted: [] };

  const lookups: LookupMaps = {
    drivers: { ...(fromCsv?.lookups.drivers ?? {}), ...(input.vektorLookups?.drivers ?? {}) },
    brokers: { ...(fromCsv?.lookups.brokers ?? {}), ...(input.vektorLookups?.brokers ?? {}) },
    trucks: { ...(fromCsv?.lookups.trucks ?? {}), ...(input.vektorLookups?.trucks ?? {}) },
  };
  const rangeFrom = input.range?.from ?? "0001-01-01";
  const rangeTo = input.range?.to ?? "9999-12-31";
  const match = runImportPipeline(manifests, {
    lookups,
    knownTruckUnits: new Set(known),
    rangeFrom,
    rangeTo,
    previousFetched: input.previousFetched ?? null,
    settings: input.settings ?? { rowCountDropBlockPct: 50 },
  });
  if (match.blocked) return { match, promoted: [] };

  const distanceByManifest = new Map<string, { loaded: number; deadhead: number; ref: string | null }>();
  for (const manifest of manifests) {
    distanceByManifest.set(manifest.manifestId, {
      loaded: distanceStringToHundredths(manifest.loadedDistance),
      deadhead: distanceStringToHundredths(manifest.emptyDistance),
      ref: manifest.sourceManifestRef ?? null,
    });
  }

  const choices = [...known];
  let calls = 0;
  for (const decision of match.decisions) {
    if (decision.promote || decision.rejectReason !== "truck unmatched") continue;
    if (!geminiConfigured(env) || calls >= 8 || choices.length === 0) {
      review.push(reviewForDecision(decision, null));
      continue;
    }
    calls += 1;
    const suggested = await suggestAssignment(
      {
        kind: "load",
        unit: decision.mapped.truckUnitNumber ?? "",
        card: "",
        plate: "",
        tag: "",
        date: timestampToDate(decision.mapped.deliveryDate) ?? "",
        location: decision.mapped.loadId ?? decision.mapped.manifestFriendlyId ?? "",
        choices,
      },
      env,
      fetchImpl,
      sleep,
    );
    if (suggested.busy) {
      setNotice(AI_BUSY_NOTE);
      review.push(reviewForDecision(decision, AI_BUSY_NOTE));
      break;
    }
    const choice = suggested.choice;
    if (choice) {
      decision.issues.push({
        severity: "Warn",
        rule: "ai_suggested_truck",
        message: `AI suggested ${truckLabel(choice)}. Nothing is written until you approve it in the review queue.`,
        ref: decision.mapped.loadId ?? decision.mapped.manifestId,
        manifestId: decision.mapped.manifestId,
      });
    }
    review.push(reviewForDecision(decision, choice ? `AI suggested ${truckLabel(choice)}.` : null));
  }

  const seen = new Set<string>();
  const promoted: PromotedLoad[] = [];
  const refCounts = new Map<string, number>();
  for (const decision of match.decisions) {
    const ref = distanceByManifest.get(decision.mapped.manifestId)?.ref ?? decision.mapped.sourceManifestRef ?? null;
    const key = manifestGroupKey(ref);
    if (key) refCounts.set(key, (refCounts.get(key) ?? 0) + 1);
  }
  for (const decision of match.decisions) {
    if (!decision.promote || !decision.mapped.loadId || !decision.mapped.truckUnitNumber) continue;
    const unitNumber = unitKey(decision.mapped.truckUnitNumber);
    const dedupe = `${unitNumber}|${decision.mapped.loadId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const deliveryDay = timestampToDate(decision.mapped.deliveryDate);
    if (!deliveryDay) continue;
    if (input.range && (deliveryDay < input.range.from || deliveryDay > input.range.to)) continue;
    const week = weekForDay(deliveryDay);
    if (!week) continue;
    const distance = distanceByManifest.get(decision.mapped.manifestId);
    const ref = distance?.ref ?? decision.mapped.sourceManifestRef ?? null;
    const group = manifestGroupKey(ref);
    const shared = Boolean(group && (refCounts.get(group) ?? 0) > 1);
    promoted.push({
      unitNumber,
      loadId: decision.mapped.loadId,
      tripId: shared ? tripFromRef(ref) : "",
      manifestRef: ref,
      deliveryDay,
      pickupDay: timestampToDate(decision.mapped.pickupDate),
      weekStart: week.start,
      weekEnd: week.end,
      loadedMilesHundredths: distance?.loaded ?? 0,
      deadheadMilesHundredths: distance?.deadhead ?? 0,
      rateCents: decision.mapped.rateCents,
      driver: decision.mapped.driverName ?? "",
    });
  }
  return { match, promoted };
}

function reviewForDecision(decision: PromoteDecision, extra: string | null): ReviewItem {
  const reason = [decision.rejectReason ?? "Needs review.", extra].filter(Boolean).join(" ");
  return {
    source: "vektor",
    unitNumber: decision.mapped.truckUnitNumber,
    label: decision.mapped.loadId ?? decision.mapped.manifestFriendlyId ?? decision.mapped.manifestId,
    reason,
  };
}

function contextWithLoads(context: ImportContext, loads: readonly PromotedLoad[]): ImportContext {
  const ledgers = (context.ledgers ?? []).map((row) => ({ ...row, loads: row.loads.slice() }));
  const tollTargets = (context.tollTargets ?? []).map((row) => ({ ...row, rows: row.rows.slice() }));
  const byUnit = new Map<string, PromotedLoad[]>();
  for (const load of loads) {
    const list = byUnit.get(load.unitNumber) ?? [];
    list.push(load);
    byUnit.set(load.unitNumber, list);
  }
  for (const [unitNumber, list] of byUnit) {
    const ledger = ledgers.find((row) => row.unitNumber === unitNumber);
    const windows = ledger?.loads ?? [];
    for (const load of list) {
      if (windows.some((row) => row.loadId === load.loadId)) continue;
      windows.push({
        loadId: load.loadId,
        tripId: load.tripId,
        pickupDate: load.pickupDay ?? load.deliveryDay,
        deliveryDate: load.deliveryDay,
      });
    }
    if (!ledger) ledgers.push({ unitNumber, loads: windows });

    let targets = tollTargets.find((row) => row.unitNumber === unitNumber);
    if (!targets) {
      targets = { unitNumber, column: TOLL_COLUMN, rows: [] };
      tollTargets.push(targets);
    }
    for (const load of list) {
      if (targets.rows.some((row) => row.loadId === load.loadId)) continue;
      const rowNumber = targets.rows.reduce((max, row) => Math.max(max, row.rowNumber), 1) + 1;
      targets.rows.push({ loadId: load.loadId, rowNumber, current: "" });
    }
  }
  return { ...context, ledgers, tollTargets };
}

function totalsFromMatched(
  loads: readonly PromotedLoad[],
  fuel: PlanResult | null,
  toll: PlanResult | null,
): TruckWeekTotals[] {
  const fuelRows: AggregateFuel[] = [];
  for (const row of fuel?.rows ?? []) {
    if (row.status !== "new" || row.payload?.kind !== "fuel" || !row.unitNumber) continue;
    fuelRows.push({
      unitNumber: row.unitNumber,
      weekStart: row.payload.weekStart,
      weekEnd: row.payload.weekEnd,
      loadId: row.payload.loadId,
      tripId: row.payload.tripId,
      product: row.payload.product,
      gallonsMilli: row.payload.gallonsMilli,
      amountCents: row.payload.amountCents,
    });
  }
  const tollRows: AggregateToll[] = [];
  for (const row of toll?.rows ?? []) {
    if (row.status !== "new" || row.payload?.kind !== "toll" || !row.unitNumber) continue;
    tollRows.push({
      unitNumber: row.unitNumber,
      weekStart: row.payload.weekStart,
      weekEnd: row.payload.weekEnd,
      loadId: row.payload.loadId,
      amountCents: row.payload.amountCents,
    });
  }
  const miles: AggregateMiles[] = loads.map((load) => ({
    unitNumber: load.unitNumber,
    weekStart: load.weekStart,
    weekEnd: load.weekEnd,
    loadId: load.loadId,
    tripId: load.tripId,
    manifestRef: load.manifestRef,
    loadedMilesHundredths: load.loadedMilesHundredths,
    deadheadMilesHundredths: load.deadheadMilesHundredths,
  }));
  return buildTruckWeeks({ fuel: fuelRows, tolls: tollRows, miles });
}

function writesFromMatched(
  loads: readonly PromotedLoad[],
  fuel: PlanResult | null,
  toll: PlanResult | null,
): ApprovedWrites {
  const fuelWrites: FuelSheetWrite[] = [];
  for (const row of fuel?.rows ?? []) {
    if (row.status !== "new" || !row.unitNumber) continue;
    for (const cell of row.cells) {
      fuelWrites.push({
        unitNumber: row.unitNumber,
        weekStart: row.payload?.kind === "fuel" ? row.payload.weekStart : "",
        tab: row.targetSheet ?? fuelLogTab(row.unitNumber),
        header: cell.header,
        a1: cell.a1,
        value: cell.value,
      });
    }
  }
  const tollSeen = new Set<string>();
  const tollWrites: TollSheetWrite[] = [];
  for (const row of toll?.rows ?? []) {
    if (row.status !== "new" || row.payload?.kind !== "toll" || !row.unitNumber) continue;
    for (const cell of row.cells) {
      const key = `${row.unitNumber}|${cell.a1}`;
      if (tollSeen.has(key)) continue;
      tollSeen.add(key);
      tollWrites.push({
        unitNumber: row.unitNumber,
        weekStart: row.payload.weekStart,
        loadId: row.payload.loadId,
        tab: row.targetSheet ?? ledgerTab(row.unitNumber),
        header: cell.header,
        a1: cell.a1,
        value: cell.value,
        amountCents: sheetAmountToCents(cell.value) ?? 0,
      });
    }
  }
  const vektor: VektorSheetWrite[] = [];
  for (const load of loads) {
    const fields: Array<[SheetWriteField, string]> = [
      ["rate", sheetCellValue("rate", String(load.rateCents))],
      ["delivery_date", load.deliveryDay],
      ["pickup_date", load.pickupDay ?? ""],
      ["loaded_miles", sheetCellValue("loaded_miles", String(load.loadedMilesHundredths))],
      ["deadhead", sheetCellValue("deadhead", String(load.deadheadMilesHundredths))],
      ["driver", load.driver],
    ];
    for (const [field, value] of fields) {
      if (!value) continue;
      vektor.push({
        unitNumber: load.unitNumber,
        loadId: load.loadId,
        tab: ledgerTab(load.unitNumber),
        field,
        value,
        loadedMilesHundredths: load.loadedMilesHundredths,
        deadheadMilesHundredths: load.deadheadMilesHundredths,
      });
    }
  }
  return { fuel: fuelWrites, tolls: tollWrites, vektor };
}

/** Sends the approved plans. The pipeline itself never calls this. */
export async function performApprovedWrites(
  writes: ApprovedWrites,
  writer: (writes: ApprovedWrites) => Promise<void>,
): Promise<void> {
  await writer(writes);
}

export function sheetFuelCents(writes: ApprovedWrites, unitNumber: string, weekStart?: string): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const cell of writes.fuel) {
    if (unitKey(cell.unitNumber) !== unitKey(unitNumber) || cell.header !== "Total Cost") continue;
    if (weekStart && cell.weekStart !== weekStart) continue;
    const key = `${cell.a1}|${cell.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sum += sheetAmountToCents(cell.value) ?? 0;
  }
  return sum;
}

export function sheetTollCents(writes: ApprovedWrites, unitNumber: string, weekStart?: string): number {
  let sum = 0;
  for (const cell of writes.tolls) {
    if (unitKey(cell.unitNumber) !== unitKey(unitNumber)) continue;
    if (weekStart && cell.weekStart !== weekStart) continue;
    if (cell.header !== "Toll Expense") continue;
    sum += cell.amountCents;
  }
  return sum;
}

export { columnLetter, displayedFuelToll, TOLL_COLUMN };
