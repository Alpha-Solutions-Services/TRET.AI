import { canonicalLoadId } from "@/lib/loads/load-id";
import {
  cleanCell,
  cleanLoadId,
  columnIndex,
  columnIndexes,
  findHeaderRow,
  isEmptyCell,
  sheetAmountToCents,
  sheetDay,
} from "@/lib/sheets/cell";

type SheetGrid = string[][];

const DELIVERY = ["delivery date", "deliverydate", "delivery_date", "order date delivered"];
const DELIVERY_FALLBACK = ["destination datetime"];
const LOAD_ID = [
  "load id",
  "loadid",
  "load_id",
  "load #",
  "load number",
  "order friendly id",
  "friendly id",
  "order id",
  "order #",
  "order number",
];
const RATE = ["rate", "gross amount", "grossamount", "gross_amount", "gross"];
const PICKUP = ["pick up date", "pickup date", "pickup_date", "pickupdate", "origin datetime"];
const LOADED = ["loaded miles", "loaded distance", "loadeddistance", "loaded_distance"];
const DEADHEAD = ["deadhead miles", "deadhead", "empty distance", "emptydistance", "empty_distance", "empty miles"];
const ORIGIN = ["origin"];
const DESTINATION = ["destination"];
const DRIVER = ["driver", "drivers", "driver name", "primary driver"];
const BROKER = ["broker/customer", "broker", "customer", "broker name"];
const UNIT = [
  "unit",
  "unit number",
  "unit_number",
  "truck #",
  "truck number",
  "truck",
  "truck reference id",
];
const MANIFEST = ["manifest id", "manifestid", "manifest_id"];
const TRIP = ["trip group", "trip group id", "trip", "trip #", "trip id"];
const PRIMARY = ["primary", "primary load"];
const TRUCK_MILES = ["truck miles"];
const ALLOCATED = ["allocated miles", "allocated mile", "trip miles"];
const ALLOC_DEADHEAD = ["alloc deadhead", "allocated deadhead", "allocated deadhead miles"];
/** Load Ledger column AV. A=0, so AV is 47. */
const ALLOC_DEADHEAD_INDEX = 47;
const STATUS = ["status", "load status", "order status", "trip status"];
/** Load Ledger columns AM through AQ. Misc receipts live here. */
const MISC_START = 38;
const MISC_END = 42;

export type LedgerLoadRow = {
  loadId: string;
  deliveryDay: string;
  pickupDay: string | null;
  rateCents: number | null;
  loadedMilesHundredths: number | null;
  deadheadMilesHundredths: number | null;
  broker: string | null;
  origin: string | null;
  destination: string | null;
  driver: string | null;
  unitNumber: string | null;
  manifestId: string | null;
  /** Sheet trip group, such as M-1195. Null when that column is blank or missing. */
  tripGroup: string | null;
  /** True when Primary is Yes. False when that cell is blank. Null when the column is missing. */
  sheetPrimary: boolean | null;
  /** Column AL. Zero on a non-primary row. Not added into loaded miles. */
  truckMilesHundredths: number | null;
  /** Column P, or a header named Allocated Miles. The trip total. Null when that column is absent. */
  allocatedMilesHundredths: number | null;
  /** Ledger AV, Alloc Deadhead. Null when that column is absent. */
  allocatedDeadheadHundredths: number | null;
  /** Columns AM through AQ, in cents. Zero when those cells are blank. */
  miscCents: number;
  status: string | null;
  /** order: the delivery column. fallback: Destination Datetime. */
  deliverySource: "column" | "fallback" | null;
};

export type ParsedLoadLedger = {
  headerFound: boolean;
  rows: LedgerLoadRow[];
  /** Primary Driver from the rows above the header, when that label is present. */
  driverHint: string | null;
  /** Status cell next to a Status label above the header. */
  statusHint: string | null;
  /** Truck # cell above the header. */
  unitHint: string | null;
  /** True when column P or an Allocated Miles header was on the header row. */
  allocatedColumn: boolean;
  /** True when Alloc Deadhead or column AV was on the header row. */
  allocatedDeadheadColumn: boolean;
};

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return row[index] ?? "";
}

function primaryFlag(raw: string, columnPresent: boolean): boolean | null {
  if (!columnPresent) return null;
  const text = cleanCell(raw).toLowerCase();
  if (!text || text === "-" || text === "n/a") return false;
  if (text === "yes" || text === "y" || text === "true" || text === "1" || text === "primary") return true;
  if (text === "no" || text === "n" || text === "false" || text === "0") return false;
  return false;
}

function textOrNull(raw: string): string | null {
  if (isEmptyCell(raw)) return null;
  const text = cleanCell(raw);
  return text || null;
}

/** Miles text to integer hundredths. Half-up on a third decimal. Blank is null. */
export function milesToHundredths(raw: string): number | null {
  if (isEmptyCell(raw)) return null;
  const cleaned = cleanCell(raw).replace(/,/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const digits = (frac + "000").slice(0, 3);
  let hundredths = Number.parseInt(whole, 10) * 100 + Number.parseInt(digits.slice(0, 2), 10);
  if (digits[2]! >= "5") hundredths += 1;
  return hundredths;
}

function neighbor(grid: SheetGrid, label: string): string | null {
  const wanted = label.toLowerCase();
  for (const row of grid) {
    for (let index = 0; index < row.length; index++) {
      if (cleanCell(row[index] ?? "").toLowerCase() !== wanted) continue;
      const next = textOrNull(row[index + 1] ?? "");
      if (next) return next;
    }
  }
  return null;
}

export function parseLoadLedger(
  grid: SheetGrid,
  opts?: { keepUndated?: boolean; deliveryFallback?: string[] },
): ParsedLoadLedger {
  const headerIndex = findHeaderRow(grid, [DELIVERY, LOAD_ID, RATE]);
  if (headerIndex < 0) {
    return {
      headerFound: false,
      rows: [],
      driverHint: null,
      statusHint: null,
      unitHint: null,
      allocatedColumn: false,
      allocatedDeadheadColumn: false,
    };
  }
  const preamble = grid.slice(0, headerIndex);
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, DELIVERY);
  const fallbackCol = columnIndex(header, [
    ...DELIVERY_FALLBACK,
    ...(opts?.deliveryFallback ?? []).map((name) => name.toLowerCase()),
  ]);
  const loadCol = columnIndex(header, LOAD_ID);
  const rateCol = columnIndex(header, RATE);
  const pickupCol = columnIndex(header, PICKUP);
  const loadedCol = columnIndex(header, LOADED);
  const deadheadCol = columnIndex(header, DEADHEAD);
  const originCol = columnIndex(header, ORIGIN);
  const destinationCol = columnIndex(header, DESTINATION);
  const driverCol = columnIndex(header, DRIVER);
  const brokerCol = columnIndex(header, BROKER);
  const unitCol = columnIndex(header, UNIT);
  const manifestCol = columnIndex(header, MANIFEST);
  const tripCol = columnIndex(header, TRIP);
  const primaryCol = columnIndex(header, PRIMARY);
  const truckMilesCol = columnIndex(header, TRUCK_MILES);
  const allocatedCol = allocatedColumnIndex(header);
  const deadheadAllocCol = allocatedDeadheadColumnIndex(header);
  const statusCols = columnIndexes(header, STATUS);
  const rows: LedgerLoadRow[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const loadId = cleanLoadId(cell(row, loadCol)) || loadIdInRow(row);
    if (!loadId || loadId.toLowerCase() === "total" || loadId.toLowerCase() === "totals") continue;
    const primaryDay = sheetDay(cell(row, dateCol));
    const fallbackDay = primaryDay ? null : sheetDay(cell(row, fallbackCol));
    const tonu = rowIsTonu(row, statusCols);
    let deliveryDay = primaryDay || fallbackDay || "";
    if (!deliveryDay && tonu) deliveryDay = firstDay(row);
    if (!deliveryDay && !opts?.keepUndated && !tonu) continue;
    rows.push({
      loadId,
      deliveryDay,
      pickupDay: sheetDay(cell(row, pickupCol)),
      rateCents: tonu ? tonuRateCents(row, cell(row, rateCol)) : sheetAmountToCents(cell(row, rateCol)),
      loadedMilesHundredths: milesToHundredths(cell(row, loadedCol)),
      deadheadMilesHundredths: milesToHundredths(cell(row, deadheadCol)),
      broker: textOrNull(cell(row, brokerCol)),
      origin: textOrNull(cell(row, originCol)),
      destination: textOrNull(cell(row, destinationCol)),
      driver: textOrNull(cell(row, driverCol)),
      unitNumber: textOrNull(cell(row, unitCol)),
      manifestId: textOrNull(cell(row, manifestCol)),
      tripGroup: textOrNull(cell(row, tripCol)),
      sheetPrimary: primaryFlag(cell(row, primaryCol), primaryCol >= 0),
      truckMilesHundredths: truckMilesCol >= 0 ? milesToHundredths(cell(row, truckMilesCol)) : null,
      allocatedMilesHundredths: allocatedCol >= 0 ? milesToHundredths(cell(row, allocatedCol)) : null,
      allocatedDeadheadHundredths: deadheadAllocCol >= 0 ? milesToHundredths(cell(row, deadheadAllocCol)) : null,
      miscCents: miscColumnsCents(row),
      status: tonu ? "TONU" : textOrNull(statusCols.map((index) => cell(row, index)).join(" ")),
      deliverySource: primaryDay ? "column" : fallbackDay ? "fallback" : deliveryDay ? "fallback" : null,
    });
  }
  rows.push(...recoverTonuRows(grid, rows));
  return {
    headerFound: true,
    rows,
    driverHint: neighbor(preamble, "Primary Driver"),
    statusHint: neighbor(preamble, "Status"),
    unitHint: neighbor(preamble, "Truck #") ?? neighbor(preamble, "Truck"),
    allocatedColumn: allocatedCol >= 0,
    allocatedDeadheadColumn: deadheadAllocCol >= 0,
  };
}

/** Column P when its header is a miles column, otherwise a header named Allocated Miles. */
function allocatedDeadheadColumnIndex(header: string[]): number {
  const named = columnIndex(header, ALLOC_DEADHEAD);
  if (named >= 0) return named;
  if ((header[ALLOC_DEADHEAD_INDEX] ?? "") !== "" || header.length > ALLOC_DEADHEAD_INDEX) return ALLOC_DEADHEAD_INDEX;
  return -1;
}

function allocatedColumnIndex(header: string[]): number {
  const named = columnIndex(header, ALLOCATED);
  if (named >= 0) return named;
  const label = cleanCell(header[15] ?? "").toLowerCase();
  if (!label.includes("mile")) return -1;
  if (label.includes("loaded") || label.includes("dead") || label.includes("empty") || label === "truck miles") {
    return -1;
  }
  return 15;
}

function miscColumnsCents(row: string[]): number {
  let total = 0;
  for (let index = MISC_START; index <= MISC_END; index += 1) {
    total += sheetAmountToCents(row[index] ?? "") ?? 0;
  }
  return total;
}

function rowIsTonu(row: readonly string[], statusCols: readonly number[]): boolean {
  for (const index of statusCols) {
    if (/\btonu\b/i.test(row[index] ?? "")) return true;
  }
  return row.some((value) => /\btonu\b/i.test(value ?? ""));
}

/** Letters plus digits, such as TBH--1201. A one-letter trip id such as M-1202 is not a load. */
function loadIdInText(raw: string): string | null {
  const compact = cleanCell(raw).replace(/\s+/g, "");
  const match = /([A-Za-z]{2,})-*(\d{3,})/.exec(compact);
  if (!match) return null;
  return canonicalLoadId(`${match[1]}--${match[2]}`);
}

function loadIdInRow(row: readonly string[]): string {
  for (const value of row) {
    const found = loadIdInText(value ?? "");
    if (found) return found;
  }
  return "";
}

function firstDay(row: readonly string[]): string {
  for (const value of row) {
    const day = sheetDay(value ?? "");
    if (day) return day;
  }
  return "";
}

function dollarAmounts(row: readonly string[]): number[] {
  const found: number[] = [];
  for (const value of row) {
    if (!(value ?? "").includes("$")) continue;
    const cents = sheetAmountToCents(value ?? "");
    if (cents != null) found.push(cents);
  }
  return found;
}

/** The sheet placeholder is the largest positive dollar amount on a TONU row. */
function tonuRateCents(row: readonly string[], rateCell: string): number | null {
  const amounts = dollarAmounts(row);
  const named = sheetAmountToCents(rateCell);
  if (named != null) amounts.push(named);
  const positive = amounts.filter((cents) => cents > 0);
  if (positive.length === 0) return named;
  return Math.max(...positive);
}

/**
 * A TONU can sit above the detected header (Load Ledger row 11) or in columns
 * the header names do not cover. Keep it when the row says TONU and has a load id.
 */
function recoverTonuRows(grid: SheetGrid, existing: readonly LedgerLoadRow[]): LedgerLoadRow[] {
  const seen = new Set(existing.map((row) => canonicalLoadId(row.loadId)));
  const extra: LedgerLoadRow[] = [];
  for (const row of grid) {
    if (!row.some((value) => /\btonu\b/i.test(value ?? ""))) continue;
    const loadId = loadIdInRow(row);
    if (!loadId || seen.has(loadId)) continue;
    seen.add(loadId);
    extra.push({
      loadId,
      deliveryDay: firstDay(row),
      pickupDay: null,
      rateCents: tonuRateCents(row, ""),
      loadedMilesHundredths: null,
      deadheadMilesHundredths: null,
      broker: null,
      origin: null,
      destination: null,
      driver: null,
      unitNumber: null,
      manifestId: null,
      tripGroup: null,
      sheetPrimary: null,
      truckMilesHundredths: null,
      allocatedMilesHundredths: null,
      allocatedDeadheadHundredths: null,
      miscCents: 0,
      status: "TONU",
      deliverySource: firstDay(row) ? "fallback" : null,
    });
  }
  return extra;
}
