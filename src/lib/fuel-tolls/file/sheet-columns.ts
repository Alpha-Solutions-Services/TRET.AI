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

export function locateFuelLogColumns(header: string[]): { ok: true; columns: FuelLogColumns } | { ok: false; error: string } {
  const date = columnIndex(header, ["date"]);
  const location = columnIndex(header, ["location"]);
  const loadId = columnIndex(header, ["load id"]);
  const trip = columnIndex(header, ["trip group id", "trip group"]);
  const gallons = columnIndex(header, ["gallons"]);
  const totalCost = columnIndex(header, ["total cost", "amt", "amount"]);
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
