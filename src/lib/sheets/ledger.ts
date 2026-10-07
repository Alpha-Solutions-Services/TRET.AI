import {
  cleanCell,
  cleanLoadId,
  columnIndex,
  findHeaderRow,
  isEmptyCell,
  sheetAmountToCents,
  sheetDay,
} from "@/lib/sheets/cell";

type SheetGrid = string[][];

const DELIVERY = ["delivery date", "deliverydate", "delivery_date", "order date delivered"];
const DELIVERY_FALLBACK = ["destination datetime"];
const LOAD_ID = ["load id", "loadid", "load_id", "order friendly id", "friendly id", "order id"];
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
const STATUS = ["status"];

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
    return { headerFound: false, rows: [], driverHint: null, statusHint: null, unitHint: null };
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
  const statusCol = columnIndex(header, STATUS);
  const rows: LedgerLoadRow[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const loadId = cleanLoadId(cell(row, loadCol));
    if (!loadId || loadId.toLowerCase() === "total" || loadId.toLowerCase() === "totals") continue;
    const primaryDay = sheetDay(cell(row, dateCol));
    const fallbackDay = primaryDay ? null : sheetDay(cell(row, fallbackCol));
    const deliveryDay = primaryDay || fallbackDay || "";
    if (!deliveryDay && !opts?.keepUndated) continue;
    rows.push({
      loadId,
      deliveryDay,
      pickupDay: sheetDay(cell(row, pickupCol)),
      rateCents: sheetAmountToCents(cell(row, rateCol)),
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
      status: textOrNull(cell(row, statusCol)),
      deliverySource: primaryDay ? "column" : fallbackDay ? "fallback" : null,
    });
  }
  return {
    headerFound: true,
    rows,
    driverHint: neighbor(preamble, "Primary Driver"),
    statusHint: neighbor(preamble, "Status"),
    unitHint: neighbor(preamble, "Truck #") ?? neighbor(preamble, "Truck"),
  };
}
