import { roundHalfUpDivide } from "@/lib/fee-engine/money";
import { canonicalLoadId, loadMatchKey } from "@/lib/loads/load-id";
import { countedLoadedHundredths, layoutManifestGroups, type ManifestRole } from "@/lib/loads/manifest-miles";
import {
  centsPerLoad,
  centsPerLoadedMile,
  formatDieselMpg,
  formatGallonsMilli,
  formatMilesHundredths,
  formatStatementDollars,
} from "@/lib/reports/format";
import {
  columnIndex,
  columnIndexes,
  findHeaderRow,
  inWeek,
  normalizeHeader,
  sheetAmountToCents,
  sheetDay,
} from "@/lib/sheets/cell";
import { parseLoadLedger } from "@/lib/sheets/ledger";
import { unitKey } from "@/lib/sheets/mismatch";

export type SheetGrid = string[][];

export type AssetExpenseLine = {
  label: string;
  cents: number;
};

export type AssetLoadLine = {
  loadId: string;
  date: string;
  broker: string;
  origin: string;
  destination: string;
  loadedHundredths: number;
  deadheadHundredths: number;
  rateCents: number;
  manifestRef: string | null;
  manifestRole: ManifestRole;
  manifestHeader: boolean;
};

export type AssetReport = {
  unitNumber: string;
  driver: string;
  assetPartner: string;
  trailer: string;
  vin: string;
  truckLine: string;
  dispatcher: string;
  program: string;
  periodLabel: string;
  weekStart: string;
  weekEnd: string;
  grossCents: number;
  expenseCents: number;
  netCents: number;
  loadCount: number;
  dispatchMilesHundredths: number;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
  ratePerMileCents: number | null;
  revenuePerLoadCents: number | null;
  fuelPerMileCents: number | null;
  loads: AssetLoadLine[];
  leftExpenses: AssetExpenseLine[];
  rightExpenses: AssetExpenseLine[];
  /** This week's escrow charge, included in truck expenses. */
  escrowWeekCents: number;
  /** Running balance when the sheet has that column. Null when TRET only has this week. */
  escrowBalanceCents: number | null;
  /** Card amount: the running balance, or this week's escrow when no balance is stored. */
  escrowCents: number;
  /** "Escrow Balance" or "Escrow Balance (this week)". */
  escrowCardLabel: string;
  fuelGallonsLabel: string;
  fuelCostCents: number;
  fuelUnitPriceCents: number | null;
  fuelEconomy: string;
  assetStatus: string;
  availableForDispatch: string;
  operatingCondition: string;
  revenuePerformance: string;
  compliance: string;
  maintenance: string;
  loadsAccepted: string;
  loadsDelivered: string;
  onTime: string;
  claims: string;
  cargoDamage: string;
  serviceFailures: string;
  cancellations: string;
  driverQualification: string;
  medicalCard: string;
  insuranceStatus: string;
  registration: string;
  annualDot: string;
  eldCompliance: string;
  summary: string;
  notes: string[];
};

/** Shown when no dispatcher is stored on the truck or the sheet. */
export const DEFAULT_DISPATCHER = "Legacy Dispatch Team";

const UNIT_HEADERS = ["truck number", "truck #", "truck id", "unit", "unit number", "truck"];
const VIN_HEADERS = ["vin", "vin #", "truck vin", "vehicle vin"];
const TRAILER_HEADERS = ["trailer", "trailer #", "trailer number", "trailer no", "trailer id"];
const DRIVER_HEADERS = ["primary driver", "driver name", "driver"];
const STATUS_HEADERS = ["asset status", "status"];
const DISPATCHER_HEADERS = ["dispatcher", "dispatch team", "dispatched by"];
const LABEL_NAMES = new Set<string>([
  ...UNIT_HEADERS,
  ...VIN_HEADERS,
  ...TRAILER_HEADERS,
  ...DRIVER_HEADERS,
  ...STATUS_HEADERS,
  ...DISPATCHER_HEADERS,
  "available for dispatch",
  "availability",
  "operating condition",
  "revenue performance",
  "compliance",
  "compliance status",
  "maintenance",
  "maintenance status",
  "driver qualification",
  "medical card",
  "med card",
  "insurance status",
  "insurance compliance",
  "registration",
  "registration status",
  "annual dot insp.",
  "annual dot insp",
  "annual dot inspection",
  "dot inspection",
  "eld compliance",
  "eld status",
  "weekly operations note",
  "operations note",
]);

const DELIVERY = ["delivery date", "deliverydate", "delivery_date"];
const LOAD_ID = ["load id", "loadid", "load_id", "order friendly id", "friendly id"];
const RATE = ["rate", "gross amount", "grossamount", "gross_amount"];

function dollars(cents: number): string {
  return formatStatementDollars(cents);
}

export function percentOfRevenue(partCents: number, grossCents: number): string {
  if (!Number.isInteger(partCents) || !Number.isInteger(grossCents) || partCents < 0 || grossCents <= 0) {
    return "0.0%";
  }
  const tenths = roundHalfUpDivide(BigInt(partCents) * BigInt(1000), BigInt(grossCents));
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year?.slice(2) ?? ""}`;
}

function manifestForLoad(map: Record<string, string | null> | undefined, loadId: string): string | null {
  if (!map) return null;
  const direct = map[loadMatchKey(loadId)] ?? map[canonicalLoadId(loadId)] ?? map[loadId];
  const text = (direct ?? "").trim();
  return text || null;
}

function readOptional(
  weekly: { header: string[]; row: string[] } | null,
  names: readonly string[],
): number | null {
  if (!weekly) return null;
  const index = columnIndex(weekly.header, names);
  if (index < 0) return null;
  const text = (weekly.row[index] ?? "").trim();
  if (!text) return null;
  return sheetAmountToCents(text);
}

function cellAmount(header: string[], row: string[], names: readonly string[]): number {
  const indexes = columnIndexes(header, names);
  return indexes.reduce((sum, index) => sum + (sheetAmountToCents(row[index] ?? "") ?? 0), 0);
}

function textAt(header: string[], row: string[], names: readonly string[]): string | null {
  const index = columnIndex(header, names);
  if (index < 0) return null;
  const text = (row[index] ?? "").trim();
  return text || null;
}

function weeklyRow(
  grid: SheetGrid | null,
  weekStart: string,
  weekEnd: string,
): { header: string[]; row: string[] } | null {
  if (!grid) return null;
  const headerIndex = findHeaderRow(grid, [["week start date", "date"], ["driver compensation"]]);
  if (headerIndex < 0) return null;
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, ["week start date", "date"]);
  let fallback: string[] | null = null;
  for (const row of grid.slice(headerIndex + 1)) {
    const day = sheetDay(row[dateCol] ?? "");
    if (!inWeek(day, weekStart, weekEnd)) continue;
    if (day === weekStart) return { header, row };
    fallback ??= row;
  }
  return fallback ? { header, row: fallback } : null;
}

function fuelTotals(
  grid: SheetGrid | null,
  weekStart: string,
  weekEnd: string,
): { gallonsMilli: number; costCents: number; milesHundredths: number } {
  if (!grid) return { gallonsMilli: 0, costCents: 0, milesHundredths: 0 };
  const headerIndex = findHeaderRow(grid, [["date"], ["gallons"]]);
  if (headerIndex < 0) return { gallonsMilli: 0, costCents: 0, milesHundredths: 0 };
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, ["date"]);
  const gallonCol = columnIndex(header, ["gallons"]);
  const costCol = columnIndex(header, ["total cost", "amount"]);
  const milesCol = columnIndex(header, ["miles"]);
  let gallonsMilli = 0;
  let costCents = 0;
  let milesHundredths = 0;
  for (const row of grid.slice(headerIndex + 1)) {
    const day = sheetDay(row[dateCol] ?? "");
    if (!inWeek(day, weekStart, weekEnd)) continue;
    gallonsMilli += gallonsMilliFrom(row[gallonCol] ?? "");
    costCents += sheetAmountToCents(row[costCol] ?? "") ?? 0;
    milesHundredths += milesHundredthsFrom(row[milesCol] ?? "");
  }
  return { gallonsMilli, costCents, milesHundredths };
}

function gallonsMilliFrom(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return 0;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const digits = (frac + "000").slice(0, 4);
  let milli = Number.parseInt(whole, 10) * 1000 + Number.parseInt(digits.slice(0, 3), 10);
  if (digits[3]! >= "5") milli += 1;
  return milli;
}

function milesHundredthsFrom(raw: string): number {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return 0;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const digits = (frac + "000").slice(0, 3);
  let hundredths = Number.parseInt(whole, 10) * 100 + Number.parseInt(digits.slice(0, 2), 10);
  if (digits[2]! >= "5") hundredths += 1;
  return hundredths;
}

function tableHeaderIndex(grid: SheetGrid): number {
  for (let index = 0; index < grid.length; index++) {
    const cells = (grid[index] ?? []).map((cell) => normalizeHeader(cell));
    const hits = cells.filter((cell) => LABEL_NAMES.has(cell)).length;
    const hasUnit = UNIT_HEADERS.some((name) => cells.includes(name));
    if (hasUnit && hits >= 2) return index;
  }
  return -1;
}

type UnitSlice = { header: string[]; row: string[] } | null;

function unitSlice(grid: SheetGrid | null, unitNumber: string): UnitSlice {
  if (!grid) return null;
  const headerIndex = tableHeaderIndex(grid);
  if (headerIndex < 0) return null;
  const header = grid[headerIndex] ?? [];
  const unitCol = columnIndex(header, UNIT_HEADERS);
  if (unitCol < 0) return null;
  for (const row of grid.slice(headerIndex + 1)) {
    const unit = (row[unitCol] ?? "").trim();
    if (!unit || unitKey(unit) !== unitKey(unitNumber)) continue;
    return { header, row };
  }
  return null;
}

function rowsBefore(grid: SheetGrid | null, groups: ReadonlyArray<readonly string[]>): SheetGrid | null {
  if (!grid) return null;
  const headerIndex = findHeaderRow(grid, groups);
  if (headerIndex < 0) return grid;
  return grid.slice(0, headerIndex);
}

/** Label/value pairs. Skips a value that is itself a column label. */
function pairValue(grid: SheetGrid | null, unitNumber: string, names: readonly string[]): string | null {
  if (!grid) return null;
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const truckLabels: string[] = [];
  let found: string | null = null;
  for (const row of grid) {
    for (let index = 0; index < row.length - 1; index++) {
      const key = normalizeHeader(row[index] ?? "");
      const value = (row[index + 1] ?? "").trim();
      if (!value || LABEL_NAMES.has(normalizeHeader(value))) continue;
      if (UNIT_HEADERS.includes(key)) truckLabels.push(value);
      if (!found && wanted.has(key)) found = value;
    }
  }
  if (truckLabels.length > 0) {
    const keys = truckLabels.map((value) => unitKey(value));
    const wantedKey = unitKey(unitNumber);
    if (!keys.includes(wantedKey) || keys.some((key) => key !== wantedKey)) return null;
  }
  return found;
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = value?.trim();
    if (text) return text;
  }
  return "";
}

function usableStatus(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;
  if (text.startsWith("$")) return null;
  if (/^-?\d[\d,]*(\.\d+)?$/.test(text)) return null;
  return text;
}

function statusFrom(
  slice: UnitSlice,
  weekly: { header: string[]; row: string[] } | null,
  grids: Array<SheetGrid | null>,
  unitNumber: string,
  names: readonly string[],
): string | null {
  return usableStatus(
    firstText(
      slice ? textAt(slice.header, slice.row, names) : null,
      weekly ? textAt(weekly.header, weekly.row, names) : null,
      ...grids.map((grid) => pairValue(grid, unitNumber, names)),
    ),
  );
}

function weekLedger(
  grid: SheetGrid | null,
  weekStart: string,
  weekEnd: string,
): { header: string[]; rows: string[][] } | null {
  if (!grid) return null;
  const headerIndex = findHeaderRow(grid, [DELIVERY, LOAD_ID, RATE]);
  if (headerIndex < 0) return null;
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, DELIVERY);
  const loadCol = columnIndex(header, LOAD_ID);
  const rateCol = columnIndex(header, RATE);
  const rows: string[][] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const loadId = canonicalLoadId((row[loadCol] ?? "").replace(/\s+/g, ""));
    if (!loadId || /^totals?$/i.test(loadId)) continue;
    const day = sheetDay(row[dateCol] ?? "");
    if (!inWeek(day, weekStart, weekEnd)) continue;
    if (sheetAmountToCents(row[rateCol] ?? "") == null) continue;
    rows.push(row);
  }
  return { header, rows };
}

function sharedColumn(header: string[], rows: string[][], names: readonly string[]): string | null {
  const index = columnIndex(header, names);
  if (index < 0 || rows.length === 0) return null;
  const values = rows.map((row) => (row[index] ?? "").trim()).filter((value) => value.length > 0);
  if (values.length === 0) return null;
  const first = values[0]!;
  return values.every((value) => value === first) ? first : null;
}

function numericCell(raw: string): number | null {
  const cleaned = raw.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function isYes(raw: string): boolean {
  return /^(y|yes|true)$/i.test(raw.trim());
}

function isNo(raw: string): boolean {
  return /^(n|no|false|late)$/i.test(raw.trim());
}

function displayCount(raw: string): string {
  const text = raw.trim();
  const value = numericCell(text);
  if (value == null) return text;
  if (Number.isInteger(value)) return String(value);
  return text;
}

function columnTotal(header: string[], rows: string[][], names: readonly string[]): number | null {
  const index = columnIndex(header, names);
  if (index < 0) return null;
  let sum = 0;
  for (const row of rows) {
    const raw = (row[index] ?? "").trim();
    if (!raw) continue;
    const value = numericCell(raw);
    if (value != null) sum += value;
    else if (isYes(raw)) sum += 1;
  }
  return sum;
}

function percentLabel(
  base: string,
  fallback: string,
  weekly: { header: string[]; row: string[] } | null,
  names: readonly string[],
): string {
  const raw = weekly ? textAt(weekly.header, weekly.row, names) : null;
  if (!raw) return `${base} - ${fallback}`;
  const rate = raw.includes("%") || !/^\d+(\.\d+)?$/.test(raw) ? raw : `${raw}%`;
  return `${base} - ${rate}`;
}

function countOr(
  weekly: { header: string[]; row: string[] } | null,
  names: readonly string[],
  ledger: { header: string[]; rows: string[][] } | null,
  fallback: string,
): string {
  const fromWeekly = weekly ? textAt(weekly.header, weekly.row, names) : null;
  if (fromWeekly) return displayCount(fromWeekly);
  if (ledger) {
    const total = columnTotal(ledger.header, ledger.rows, names);
    if (total != null) return displayCount(String(total));
  }
  return fallback;
}

function onTimeLabel(
  weekly: { header: string[]; row: string[] } | null,
  ledger: { header: string[]; rows: string[][] } | null,
  loadCount: number,
): string {
  const fromWeekly = weekly
    ? textAt(weekly.header, weekly.row, ["on-time deliveries", "on time deliveries", "on time", "on-time"])
    : null;
  if (fromWeekly) return displayCount(fromWeekly);
  if (!ledger || loadCount === 0) return "100%";
  const onTimeCol = columnIndex(ledger.header, ["on time", "on-time", "on time delivery"]);
  const lateCol = columnIndex(ledger.header, ["late", "late delivery"]);
  if (onTimeCol < 0 && lateCol < 0) return "100%";
  let late = 0;
  let saw = false;
  for (const row of ledger.rows) {
    const flagCol = lateCol >= 0 ? lateCol : onTimeCol;
    const lateFlag = lateCol >= 0;
    if (flagCol < 0) continue;
    const raw = (row[flagCol] ?? "").trim();
    if (!raw) continue;
    saw = true;
    if (lateFlag ? isYes(raw) : isNo(raw)) late += 1;
  }
  if (!saw) return "100%";
  const onTimeLoads = Math.max(0, loadCount - late);
  const pct = roundHalfUpDivide(BigInt(onTimeLoads) * BigInt(100), BigInt(loadCount));
  return `${pct}%`;
}

function panelValue(found: string | null, active: boolean, whenActive: string, whenInactive: string): string {
  return found ?? (active ? whenActive : whenInactive);
}

/** Use a truck-record name when it is the same person with more than the sheet's first name. */
function displayDriver(sheetDriver: string, truckName: string | null, ownerName: string | null): string {
  const sheet = sheetDriver.trim();
  if (!sheet) return truckName?.trim() ?? "";
  const sheetKey = sheet.toLowerCase();
  for (const candidate of [truckName, ownerName]) {
    const name = candidate?.trim() ?? "";
    const key = name.toLowerCase();
    if (!name || key.length <= sheetKey.length || !key.startsWith(sheetKey)) continue;
    const next = key[sheetKey.length];
    if (next === " " || next === ",") return name;
  }
  return sheet;
}

function identityLine(unitNumber: string, trailer: string, vin: string): string {
  const parts = [`Truck ${unitNumber}`];
  if (trailer) parts.push(`Trailer ${trailer}`);
  if (vin) parts.push(`VIN ${vin}`);
  return parts.join(" / ");
}

export function buildAssetReport(input: {
  weekStart: string;
  weekEnd: string;
  unitNumber: string;
  /** Truck record name. Used when the sheet driver is only a first name. */
  truckName?: string | null;
  ownerName: string | null;
  ledger: SheetGrid | null;
  weekly: SheetGrid | null;
  fuelLog: SheetGrid | null;
  fleet: SheetGrid | null;
  sheetNote: string | null;
  dbFuelCents?: number;
  dbGallonsMilli?: number;
  dbTollCents?: number;
  /** Vektor manifest id by load match key. Used when the sheet has no manifest column. */
  manifestRefs?: Record<string, string | null>;
}): AssetReport {
  const parsed = input.ledger ? parseLoadLedger(input.ledger) : null;
  const weekLoads = (parsed?.rows ?? []).filter((row) => inWeek(row.deliveryDay, input.weekStart, input.weekEnd));
  const loads: AssetLoadLine[] = layoutManifestGroups(
    weekLoads
      .filter((row) => row.rateCents != null)
      .map((row) => {
        const fromSheet = row.manifestId?.trim() || null;
        const fromVektor = manifestForLoad(input.manifestRefs, row.loadId);
        const loadedHundredths = row.loadedMilesHundredths ?? 0;
        return {
          loadId: row.loadId,
          date: shortDate(row.deliveryDay),
          broker: row.broker ?? "",
          origin: row.origin ?? "",
          destination: row.destination ?? "",
          loadedHundredths,
          deadheadHundredths: row.deadheadMilesHundredths ?? 0,
          rateCents: row.rateCents ?? 0,
          manifestRef: fromSheet || fromVektor,
          rankHundredths: loadedHundredths,
        };
      }),
  ).map((row) => {
    const { rankHundredths, ...load } = row;
    void rankHundredths;
    return load;
  });
  const grossCents = loads.reduce((sum, row) => sum + row.rateCents, 0);
  const loadedMilesHundredths = loads.reduce(
    (sum, row) => sum + countedLoadedHundredths(row.manifestRole, row.loadedHundredths),
    0,
  );
  const deadheadMilesHundredths = loads.reduce((sum, row) => sum + row.deadheadHundredths, 0);
  const dispatchMilesHundredths = loadedMilesHundredths + deadheadMilesHundredths;
  const weekly = weeklyRow(input.weekly, input.weekStart, input.weekEnd);
  const notes: string[] = [];
  if (input.sheetNote) notes.push(input.sheetNote);
  if (!parsed?.headerFound) {
    notes.push("Load Ledger header was not found. Expected Delivery Date, Load ID, and Rate.");
  }
  const read = (names: readonly string[]) => (weekly ? cellAmount(weekly.header, weekly.row, names) : 0);
  if (!weekly) notes.push("Weekly Expenses row was not found for this week. Expense lines are zero.");
  const moved = read(["moved to management"]);
  if (moved > 0) {
    notes.push(`Moved to Management on the sheet is ${dollars(moved)}. It is not included in total truck expenses.`);
  }
  const fuelLog = fuelTotals(input.fuelLog, input.weekStart, input.weekEnd);
  let fuelCents = read(["fuel"]);
  let gallonsMilli = fuelLog.gallonsMilli;
  if (fuelCents === 0 && fuelLog.costCents > 0) fuelCents = fuelLog.costCents;
  if (fuelCents === 0 && (input.dbFuelCents ?? 0) > 0) {
    fuelCents = input.dbFuelCents ?? 0;
    notes.push("Fuel cost came from fuel transactions because the sheet fuel cells were blank.");
  }
  if (gallonsMilli === 0 && (input.dbGallonsMilli ?? 0) > 0) gallonsMilli = input.dbGallonsMilli ?? 0;
  let tollCents = read(["toll fees", "toll charges"]);
  if (tollCents === 0 && (input.dbTollCents ?? 0) > 0) {
    tollCents = input.dbTollCents ?? 0;
    notes.push("Toll charges came from toll transactions because the sheet toll cell was blank.");
  }
  const lines = {
    driver: read(["driver compensation"]),
    management: read(["management fee"]),
    dispatch: read(["dispatch fee"]),
    factoring: read(["factoring fee"]),
    fuel: fuelCents,
    insurance: read(["insurance"]),
    escrow: read(["maintenance escrow weekly", "weekly escrow"]),
    escrowBalance: readOptional(weekly, ["escrow balance", "maintenance escrow balance", "running escrow"]),
    eld: read(["eld fee"]),
    yard: read(["yard fee", "yard parking"]),
    gps: read(["gps tracker"]),
    tollPass: read(["toll pass"]),
    tolls: tollCents,
    permits: read(["permit fees", "permits"]),
  };
  const leftExpenses: AssetExpenseLine[] = [
    { label: percentLabel("Driver Compensation", "20%", weekly, ["driver compensation %", "driver compensation percent"]), cents: lines.driver },
    { label: percentLabel("Management Fee", "10%", weekly, ["management fee %", "management fee percent", "mgmt fee %"]), cents: lines.management },
    { label: "Dispatch Fee", cents: lines.dispatch },
    { label: percentLabel("Factoring Fee", "1.75%", weekly, ["factoring fee %", "factoring fee percent"]), cents: lines.factoring },
    { label: "Fuel (Diesel + DEF)", cents: lines.fuel },
    { label: "Insurance", cents: lines.insurance },
  ];
  const rightExpenses: AssetExpenseLine[] = [
    { label: "Escrow Balance (this week)", cents: lines.escrow },
    { label: "ELD Fee", cents: lines.eld },
    { label: "Yard Parking", cents: lines.yard },
    { label: "GPS Tracker", cents: lines.gps },
    { label: "Toll Pass", cents: lines.tollPass },
    { label: "Toll Charges", cents: lines.tolls },
    { label: "Permits", cents: lines.permits },
  ];
  const expenseCents = [...leftExpenses, ...rightExpenses].reduce((sum, line) => sum + line.cents, 0);
  const fleet = unitSlice(input.fleet, input.unitNumber);
  const ledgerRows = weekLedger(input.ledger, input.weekStart, input.weekEnd);
  const labelGrids = [
    input.fleet,
    rowsBefore(input.weekly, [["week start date", "date"], ["driver compensation"]]),
    rowsBefore(input.ledger, [DELIVERY, LOAD_ID, RATE]),
  ];
  const weeklyDriver = weekly ? textAt(weekly.header, weekly.row, ["driver"]) : null;
  const driver = firstText(
    parsed?.driverHint,
    weekLoads.find((row) => row.driver)?.driver,
    fleet ? textAt(fleet.header, fleet.row, DRIVER_HEADERS) : null,
    weeklyDriver,
    ...labelGrids.map((grid) => pairValue(grid, input.unitNumber, DRIVER_HEADERS)),
  );
  const trailer = firstText(
    fleet ? textAt(fleet.header, fleet.row, TRAILER_HEADERS) : null,
    weekly ? textAt(weekly.header, weekly.row, TRAILER_HEADERS) : null,
    ...labelGrids.map((grid) => pairValue(grid, input.unitNumber, TRAILER_HEADERS)),
    ledgerRows ? sharedColumn(ledgerRows.header, ledgerRows.rows, TRAILER_HEADERS) : null,
  );
  const vin = firstText(
    fleet ? textAt(fleet.header, fleet.row, VIN_HEADERS) : null,
    weekly ? textAt(weekly.header, weekly.row, VIN_HEADERS) : null,
    ...labelGrids.map((grid) => pairValue(grid, input.unitNumber, VIN_HEADERS)),
    ledgerRows ? sharedColumn(ledgerRows.header, ledgerRows.rows, VIN_HEADERS) : null,
  );
  const storedDispatcher = firstText(
    fleet ? textAt(fleet.header, fleet.row, DISPATCHER_HEADERS) : null,
    weekly ? textAt(weekly.header, weekly.row, DISPATCHER_HEADERS) : null,
    ...labelGrids.map((grid) => pairValue(grid, input.unitNumber, DISPATCHER_HEADERS)),
  );
  const dispatcher = storedDispatcher || DEFAULT_DISPATCHER;
  const operationsNote = firstText(
    weekly ? textAt(weekly.header, weekly.row, ["weekly operations note", "operations note"]) : null,
    ...labelGrids.map((grid) => pairValue(grid, input.unitNumber, ["weekly operations note", "operations note"])),
  );
  if (operationsNote) notes.push(operationsNote);
  const rawStatus = firstText(
    fleet ? textAt(fleet.header, fleet.row, STATUS_HEADERS) : null,
    parsed?.statusHint,
    weekly ? textAt(weekly.header, weekly.row, STATUS_HEADERS) : null,
    ...labelGrids.map((grid) => pairValue(grid, input.unitNumber, STATUS_HEADERS)),
  );
  const assetStatus = rawStatus || (loads.length > 0 ? "Active" : "Review");
  const active = /^active$/i.test(assetStatus);
  const ratePerMileCents = centsPerLoadedMile(grossCents, dispatchMilesHundredths);
  const economyMiles = fuelLog.milesHundredths > 0 ? fuelLog.milesHundredths : dispatchMilesHundredths;
  const fuelEconomy = formatDieselMpg(economyMiles, gallonsMilli) ?? "n/a";
  const fuelPerMileCents = centsPerLoadedMile(fuelCents, dispatchMilesHundredths);
  const netCents = grossCents - expenseCents;
  const periodLabel = `${shortDate(input.weekStart)} to ${shortDate(input.weekEnd)}`;
  const loadCountLabel = String(loads.length);
  return {
    unitNumber: input.unitNumber,
    driver: displayDriver(driver, input.truckName ?? null, input.ownerName),
    assetPartner: input.ownerName?.trim() || "",
    trailer,
    vin,
    truckLine: identityLine(input.unitNumber, trailer, vin),
    dispatcher,
    program: "Transportation Asset Management",
    periodLabel,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    grossCents,
    expenseCents,
    netCents,
    loadCount: loads.length,
    dispatchMilesHundredths,
    loadedMilesHundredths,
    deadheadMilesHundredths,
    ratePerMileCents,
    revenuePerLoadCents: centsPerLoad(grossCents, loads.length),
    fuelPerMileCents,
    loads,
    leftExpenses,
    rightExpenses,
    escrowWeekCents: lines.escrow,
    escrowBalanceCents: lines.escrowBalance,
    escrowCents: lines.escrowBalance ?? lines.escrow,
    escrowCardLabel: lines.escrowBalance == null ? "Escrow Balance (this week)" : "Escrow Balance",
    fuelGallonsLabel: gallonsMilli > 0 ? formatGallonsMilli(gallonsMilli) : "0.000",
    fuelCostCents: fuelCents,
    fuelUnitPriceCents:
      gallonsMilli > 0 ? roundHalfUpDivide(BigInt(fuelCents) * BigInt(1000), BigInt(gallonsMilli)) : null,
    fuelEconomy,
    assetStatus,
    availableForDispatch: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["available for dispatch", "availability"]),
      active,
      "Ready",
      "Hold",
    ),
    operatingCondition: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["operating condition"]),
      active,
      "Good",
      "Review",
    ),
    revenuePerformance: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["revenue performance"]),
      active,
      "Positive",
      "Review",
    ),
    compliance: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["compliance", "compliance status"]),
      active,
      "Good",
      "Review",
    ),
    maintenance: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["maintenance status", "maintenance"]),
      active,
      "Current",
      "Review",
    ),
    loadsAccepted: countOr(weekly, ["loads accepted"], ledgerRows, loadCountLabel),
    loadsDelivered: countOr(weekly, ["loads delivered"], ledgerRows, loadCountLabel),
    onTime: onTimeLabel(weekly, ledgerRows, loads.length),
    claims: countOr(weekly, ["claims", "claim"], ledgerRows, "0"),
    cargoDamage: countOr(weekly, ["cargo damage", "damage"], ledgerRows, "0"),
    serviceFailures: countOr(weekly, ["service failures", "service failure"], ledgerRows, "0"),
    cancellations: countOr(weekly, ["cancellations", "cancellation", "cancelled", "canceled"], ledgerRows, "0"),
    driverQualification: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["driver qualification"]),
      active,
      "Current",
      "Review",
    ),
    medicalCard: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["medical card", "med card"]),
      active,
      "Current",
      "Review",
    ),
    insuranceStatus: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["insurance status", "insurance compliance"]),
      active,
      "Current",
      "Review",
    ),
    registration: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["registration", "registration status"]),
      active,
      "Current",
      "Review",
    ),
    annualDot: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, [
        "annual dot insp.",
        "annual dot insp",
        "annual dot inspection",
        "dot inspection",
      ]),
      active,
      "Current",
      "Review",
    ),
    eldCompliance: panelValue(
      statusFrom(fleet, weekly, labelGrids, input.unitNumber, ["eld compliance", "eld status"]),
      active,
      "Current",
      "Review",
    ),
    summary: `Truck ${input.unitNumber} delivered ${loads.length} loads for ${dollars(grossCents)} gross. Owner expenses were ${dollars(expenseCents)}. Net owner earnings were ${dollars(netCents)}.`,
    notes,
  };
}

export function milesLabel(hundredths: number): string {
  return formatMilesHundredths(hundredths);
}
