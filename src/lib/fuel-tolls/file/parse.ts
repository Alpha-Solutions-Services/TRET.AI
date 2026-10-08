import { parseCsv } from "@/lib/fuel-tolls/csv";
import { normalizeHeader } from "@/lib/sheets/cell";
import { parseXlsxGrid } from "./xlsx";

export type RawFuel = {
  sourceRow: number;
  card: string;
  tranDate: string;
  invoice: string;
  unit: string;
  city: string;
  state: string;
  item: string;
  qty: string;
  amt: string;
};

export type RawToll = {
  sourceRow: number;
  tag: string;
  plate: string;
  plateState: string;
  unit: string;
  entryDate: string;
  entryTime: string;
  entryPlaza: string;
  entryPlazaName: string;
  exitDate: string;
  exitTime: string;
  exitPlazaName: string;
  amount: string;
  transactionId: string;
};

export type ParsedGrid =
  | { kind: "fuel"; header: string[]; headerIndex: number; rows: RawFuel[] }
  | { kind: "toll"; header: string[]; headerIndex: number; rows: RawToll[] }
  | { kind: "unknown"; header: string[]; headerIndex: number; rows: [] };

const FUEL_CANONICAL: Record<string, string> = {
  card: "Card #",
  tranDate: "Tran Date",
  invoice: "Invoice",
  unit: "Unit",
  city: "City",
  state: "State/ Prov",
  item: "Item",
  qty: "Qty",
  amt: "Amt",
};

const TOLL_CANONICAL: Record<string, string> = {
  transactionId: "Transaction Id",
  plate: "License Plate",
  plateState: "License State",
  tag: "Tag No",
  unit: "Unit",
  entryDate: "Entry Date",
  entryTime: "Entry Time",
  entryPlaza: "Entry Plaza",
  entryPlazaName: "Entry Plaza Name",
  exitDate: "Exit Date",
  exitTime: "Exit Time",
  exitPlazaName: "Exit Plaza Name",
  amount: "Amount",
};

export function gridFromUpload(input: { csvText?: string; xlsx?: Uint8Array }): string[][] {
  if (input.xlsx) return parseXlsxGrid(input.xlsx);
  if (input.csvText != null) return parseCsv(input.csvText);
  throw new Error("Choose a CSV or XLSX file.");
}

export function applyColumnMap(grid: string[][], kind: "fuel" | "toll", columns: Record<string, string>): string[][] {
  const canonical = kind === "fuel" ? FUEL_CANONICAL : TOLL_CANONICAL;
  const copy = grid.map((row) => row.slice());
  const wanted = Object.values(columns).map((header) => normalizeHeader(header));
  const index = copy.findIndex((row) => wanted.every((name) => row.some((cell) => normalizeHeader(cell) === name)));
  if (index < 0) return copy;
  const row = copy[index] ?? [];
  for (const [field, actual] of Object.entries(columns)) {
    const name = canonical[field];
    if (!name) continue;
    const cell = row.findIndex((value) => normalizeHeader(value) === normalizeHeader(actual));
    if (cell >= 0) row[cell] = name;
  }
  copy[index] = row;
  return copy;
}

export function parseGrid(grid: string[][]): ParsedGrid {
  const limit = Math.min(grid.length, 20);
  for (let index = 0; index < limit; index++) {
    const header = grid[index] ?? [];
    if (isTollHeader(header)) {
      return { kind: "toll", header, headerIndex: index, rows: tollRows(grid, index) };
    }
    if (isFuelHeader(header)) {
      return { kind: "fuel", header, headerIndex: index, rows: fuelRows(grid, index) };
    }
  }
  const header = grid[0] ?? [];
  return { kind: "unknown", header, headerIndex: 0, rows: [] };
}

function isFuelHeader(header: string[]): boolean {
  return ["card #", "tran date", "invoice", "unit", "item", "qty", "amt"].every((name) => col(header, [name]) >= 0);
}

function isTollHeader(header: string[]): boolean {
  return ["transaction id", "license plate", "exit date", "amount", "post date"].every((name) => col(header, [name]) >= 0);
}

function col(header: string[], names: readonly string[]): number {
  const wanted = new Set(names.map((name) => normalizeHeader(name)));
  return header.findIndex((cell) => wanted.has(normalizeHeader(cell)));
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

function fuelRows(grid: string[][], headerIndex: number): RawFuel[] {
  const header = grid[headerIndex] ?? [];
  const card = col(header, ["card #", "card"]);
  const tranDate = col(header, ["tran date", "transaction date"]);
  const invoice = col(header, ["invoice"]);
  const unit = col(header, ["unit"]);
  const city = col(header, ["city"]);
  const state = col(header, ["state/ prov", "state/prov", "state"]);
  const item = col(header, ["item"]);
  const qty = col(header, ["qty", "quantity"]);
  const amt = col(header, ["amt"]);
  const rows: RawFuel[] = [];
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const row = grid[index] ?? [];
    const parsed: RawFuel = {
      sourceRow: index + 1,
      card: cell(row, card),
      tranDate: cell(row, tranDate),
      invoice: cell(row, invoice),
      unit: cell(row, unit),
      city: cell(row, city),
      state: cell(row, state),
      item: cell(row, item),
      qty: cell(row, qty),
      amt: cell(row, amt),
    };
    if (!parsed.tranDate && !parsed.invoice && !parsed.item && !parsed.amt) continue;
    rows.push(parsed);
  }
  return rows;
}

function tollRows(grid: string[][], headerIndex: number): RawToll[] {
  const header = grid[headerIndex] ?? [];
  const tag = col(header, ["tag no", "tag"]);
  const plate = col(header, ["license plate"]);
  const plateState = col(header, ["license state"]);
  const unit = col(header, ["unit"]);
  const entryDate = col(header, ["entry date"]);
  const entryTime = col(header, ["entry time"]);
  const entryPlaza = col(header, ["entry plaza"]);
  const entryPlazaName = col(header, ["entry plaza name"]);
  const exitDate = col(header, ["exit date"]);
  const exitTime = col(header, ["exit time"]);
  const exitPlazaName = col(header, ["exit plaza name"]);
  const amount = col(header, ["amount"]);
  const transactionId = col(header, ["transaction id"]);
  const rows: RawToll[] = [];
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const row = grid[index] ?? [];
    const parsed: RawToll = {
      sourceRow: index + 1,
      tag: cell(row, tag),
      plate: cell(row, plate),
      plateState: cell(row, plateState),
      unit: cell(row, unit),
      entryDate: cell(row, entryDate),
      entryTime: cell(row, entryTime),
      entryPlaza: cell(row, entryPlaza),
      entryPlazaName: cell(row, entryPlazaName),
      exitDate: cell(row, exitDate),
      exitTime: cell(row, exitTime),
      exitPlazaName: cell(row, exitPlazaName),
      amount: cell(row, amount),
      transactionId: cell(row, transactionId),
    };
    if (!parsed.transactionId && !parsed.amount && !parsed.plate && !parsed.unit) continue;
    rows.push(parsed);
  }
  return rows;
}
