import type { FuelDraft, TollDraft } from "./types";
import { mapFuelRecord, mapTollRecord } from "./map";

export const FUEL_CSV_FIELDS = [
  "transaction_id",
  "unit_number",
  "transacted_at",
  "card",
  "product",
  "gallons",
  "amount",
  "retail_amount",
] as const;

export const TOLL_CSV_FIELDS = [
  "transaction_id",
  "truck_id",
  "unit_number",
  "transacted_at",
  "amount",
  "location",
] as const;

const FUEL_REQUIRED = ["transaction_id", "unit_number", "transacted_at", "gallons", "amount"];
const TOLL_REQUIRED = ["transaction_id", "truck_id", "transacted_at", "amount"];

/** Split CSV text. Supports quoted commas and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((part) => part.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((part) => part.trim() !== "")) rows.push(row);
  return rows;
}

function headerIndex(headers: string[], column: string): number {
  const wanted = column.trim().toLowerCase();
  return headers.findIndex((header) => header.trim().toLowerCase() === wanted);
}

export function csvToRecords(
  text: string,
  mapping: Record<string, string>,
  required: string[],
): Record<string, string>[] {
  const grid = parseCsv(text);
  if (grid.length < 2) {
    throw new Error("CSV needs a header row and at least one transaction.");
  }
  const headers = grid[0] ?? [];
  for (const field of required) {
    const column = mapping[field];
    if (!column) throw new Error(`CSV column mapping is missing ${field}.`);
    if (headerIndex(headers, column) < 0) {
      throw new Error(`CSV is missing the ${column} column.`);
    }
  }
  const out: Record<string, string>[] = [];
  for (const line of grid.slice(1)) {
    const record: Record<string, string> = {};
    for (const [field, column] of Object.entries(mapping)) {
      const index = headerIndex(headers, column);
      if (index < 0) continue;
      record[field] = (line[index] ?? "").trim();
    }
    out.push(record);
  }
  return out;
}

export function mapFuelCsv(text: string, mapping: Record<string, string>): FuelDraft[] {
  return csvToRecords(text, mapping, FUEL_REQUIRED).map((row) =>
    mapFuelRecord({
      transaction_id: row.transaction_id,
      unit_number: row.unit_number,
      transacted_at: row.transacted_at,
      card: row.card,
      product: row.product,
      gallons: row.gallons,
      amount: row.amount,
      retail_amount: row.retail_amount,
    }),
  );
}

export function mapTollCsv(
  text: string,
  mapping: Record<string, string>,
  truckUnitsByVektorId?: ReadonlyMap<string, string>,
): TollDraft[] {
  const records = csvToRecords(text, mapping, TOLL_REQUIRED);
  const lookup = new Map(truckUnitsByVektorId ?? []);
  if (!truckUnitsByVektorId) {
    for (const row of records) {
      if (row.truck_id && row.unit_number) lookup.set(row.truck_id, row.unit_number);
    }
  }
  return records.map((row) =>
    mapTollRecord(
      {
        transaction_id: row.transaction_id,
        truck_id: row.truck_id,
        unit_number: row.unit_number,
        transacted_at: row.transacted_at,
        amount: row.amount,
        location: row.location,
        card: row.card,
      },
      lookup,
    ),
  );
}

export function defaultFuelCsvMapping(): Record<string, string> {
  return Object.fromEntries(FUEL_CSV_FIELDS.map((field) => [field, field]));
}

export function defaultTollCsvMapping(): Record<string, string> {
  return Object.fromEntries(TOLL_CSV_FIELDS.map((field) => [field, field]));
}
