import { columnIndex, normalizeHeader } from "@/lib/sheets/cell";
import { columnLetter } from "@/lib/sheets/write-cell";

const FORMULA_HEADERS = [
  "week",
  "month",
  "truck id",
  "driver",
  "cost/gal",
  "cost per gal",
  "miles",
  "mpg",
  "link status",
];

export type FuelLogColumns = {
  date: number;
  location: number;
  loadId: number;
  trip: number;
  gallons: number;
  totalCost: number;
};

export function fuelLogTab(unitNumber: string): string {
  return `Truck #${unitNumber.padStart(2, "0")} Fuel Log`;
}

export function ledgerTab(unitNumber: string): string {
  return `Truck #${unitNumber.padStart(2, "0")} Load Ledger`;
}

const FUEL_DATE = ["date", "trans date", "transaction date", "fill date", "posted date"];
const FUEL_GALLONS = ["gallons", "qty", "quantity", "gallons pumped", "fuel gallons"];
const FUEL_COST = ["total cost", "amt", "amount", "fuel cost", "total"];

/** Header row in the first 40 rows, matched by name rather than a fixed row. */
export function findFuelLogHeader(grid: string[][]): number {
  const limit = Math.min(grid.length, 40);
  for (let index = 0; index < limit; index += 1) {
    const cells = (grid[index] ?? []).map((cell) => normalizeHeader(cell).replace(/[.:]+$/g, ""));
    const hasDate = FUEL_DATE.some((name) => cells.includes(name));
    const hasGallons = FUEL_GALLONS.some((name) => cells.includes(name));
    if (hasDate && hasGallons) return index;
  }
  return -1;
}

export function locateFuelLogColumns(header: string[]): { ok: true; columns: FuelLogColumns } | { ok: false; error: string } {
  const cleaned = header.map((cell) => cell.replace(/[.:]+$/g, ""));
  const date = columnIndex(cleaned, FUEL_DATE);
  const location = columnIndex(cleaned, ["location", "city", "site", "store"]);
  const loadId = columnIndex(cleaned, ["load id", "load", "order id"]);
  const trip = columnIndex(cleaned, ["trip group id", "trip group", "trip id", "trip"]);
  const gallons = columnIndex(cleaned, FUEL_GALLONS);
  const totalCost = columnIndex(cleaned, FUEL_COST);
  if (date < 0 || location < 0 || loadId < 0 || trip < 0 || gallons < 0 || totalCost < 0) {
    return { ok: false, error: "Fuel Log is missing Date, Location, Load ID, Trip Group ID, Gallons, or Total Cost." };
  }
  const costHeader = normalizeHeader(header[totalCost] ?? "");
  if (FORMULA_HEADERS.includes(costHeader)) {
    return { ok: false, error: "Fuel Log Total Cost header is a formula column." };
  }
  return { ok: true, columns: { date, location, loadId, trip, gallons, totalCost } };
}

export function isFormulaHeader(name: string): boolean {
  return FORMULA_HEADERS.includes(normalizeHeader(name));
}

export function locateTollExpenseColumn(header: string[]): number {
  return columnIndex(header, ["toll expense"]);
}

export function cellA1(column: number, rowNumber: number): string {
  return `${columnLetter(column)}${rowNumber}`;
}
