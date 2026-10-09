import { loadRowsToManifests, type LoadImportRow } from "./load-rows";
import { parseVektorLoadsCsv } from "../csv-loads";
import type {
  AdapterStatus,
  FetchManifestsInput,
  FetchManifestsResult,
  ImportSourceAdapter,
} from "./types";

export const LOADS_CSV_COLUMNS =
  "Delivery Date or Order Date Delivered, Load ID or Order ID, Rate or Gross, and Unit or Truck Reference ID. Optional: Origin Datetime, Destination Datetime, Loaded Miles, Empty Miles, Drivers, and Broker Name. A Truck # cell above the header is used when the truck column is absent.";

/**
 * Working CSV path. Accepts a truck Load Ledger and a Vektor orders export.
 * Mapping JSON can rename a header. The Vektor preset is saved in Settings.
 */
export class CsvExportAdapter implements ImportSourceAdapter {
  readonly id = "csv" as const;

  constructor(
    private readonly opts: {
      columnMapping: Record<string, string> | null;
      csvText?: string | null;
    } = { columnMapping: null },
  ) {}

  status(): AdapterStatus {
    return {
      id: "csv",
      label: "CSV upload",
      selectable: true,
      configured: true,
      message: `Working now. On Imports, choose a CSV. Expected columns: ${LOADS_CSV_COLUMNS} Use this until Vektor REST keys arrive.`,
    };
  }

  async fetchManifests(input: FetchManifestsInput): Promise<FetchManifestsResult> {
    const text = (input.csvText ?? this.opts.csvText ?? "").trim();
    if (!text) {
      throw new Error(`Choose a loads CSV on Imports. Expected columns: ${LOADS_CSV_COLUMNS}`);
    }
    if (text.length > 2_000_000) {
      throw new Error("That CSV is too large. Split it and import a shorter date range.");
    }
    const parsed = parseVektorLoadsCsv(text, this.opts.columnMapping, {
      from: input.from,
      to: input.to,
    });
    if (!parsed.headerFound) {
      throw new Error(`CSV header row was not found. Expected columns: ${LOADS_CSV_COLUMNS}`);
    }
    const rows: LoadImportRow[] = [];
    for (const row of parsed.rows) {
      if (!row.importRow) continue;
      rows.push(row.importRow);
    }
    const built = loadRowsToManifests(rows);
    return { manifests: built.manifests, lookups: built.lookups };
  }
}
