import { parseCsv } from "@/lib/fuel-tolls/csv";
import { parseLoadLedger } from "@/lib/sheets/ledger";
import { inWeek } from "@/lib/sheets/cell";
import { loadRowsToManifests, type LoadImportRow } from "./load-rows";
import type {
  AdapterStatus,
  FetchManifestsInput,
  FetchManifestsResult,
  ImportSourceAdapter,
} from "./types";

export const LOADS_CSV_COLUMNS =
  "Delivery Date, Load ID, Rate, and Unit or Truck #. Optional: Pick Up Date, Loaded Miles, Deadhead Miles, Origin, Destination, Driver, Broker/Customer, Manifest ID, Status. A Load Ledger export uses those headers. A Truck # cell above the header is used when the Unit column is absent.";

/**
 * Working CSV path. Column names match the truck Load Ledger and a Vektor
 * orders export that uses the same headers. Mapping JSON can rename a header.
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
    const grid = applyMapping(parseCsv(text), this.opts.columnMapping);
    const parsed = parseLoadLedger(grid);
    if (!parsed.headerFound) {
      throw new Error(`CSV header row was not found. Expected columns: ${LOADS_CSV_COLUMNS}`);
    }
    const rows: LoadImportRow[] = [];
    for (const row of parsed.rows) {
      if (!inWeek(row.deliveryDay, input.from, input.to)) continue;
      if (row.rateCents == null) continue;
      const unit = (row.unitNumber ?? parsed.unitHint ?? "").trim();
      if (!unit) {
        throw new Error(
          `Load ${row.loadId} has no unit. Add a Unit or Truck # column, or a Truck # cell above the header.`,
        );
      }
      rows.push({
        unitNumber: unit,
        loadId: row.loadId,
        deliveryDay: row.deliveryDay,
        pickupDay: row.pickupDay,
        rateCents: row.rateCents,
        loadedMilesHundredths: row.loadedMilesHundredths,
        deadheadMilesHundredths: row.deadheadMilesHundredths,
        origin: row.origin,
        destination: row.destination,
        driverName: row.driver ?? parsed.driverHint,
        brokerName: row.broker,
        manifestId: row.manifestId,
        status: row.status,
      });
    }
    const built = loadRowsToManifests(rows);
    return { manifests: built.manifests, lookups: built.lookups };
  }
}

function applyMapping(grid: string[][], mapping: Record<string, string> | null): string[][] {
  if (!mapping) return grid;
  const rename = new Map<string, string>();
  for (const [field, header] of Object.entries(mapping)) {
    const canonical = CANONICAL[field];
    if (canonical && header.trim()) rename.set(header.trim().toLowerCase(), canonical);
  }
  if (rename.size === 0) return grid;
  return grid.map((row) => row.map((cell) => rename.get(cell.trim().toLowerCase()) ?? cell));
}

const CANONICAL: Record<string, string> = {
  delivery_date: "Delivery Date",
  load_id: "Load ID",
  rate: "Rate",
  unit: "Unit",
  pickup_date: "Pick Up Date",
  loaded_miles: "Loaded Miles",
  deadhead_miles: "Deadhead Miles",
  origin: "Origin",
  destination: "Destination",
  driver: "Driver",
  broker: "Broker/Customer",
  manifest_id: "Manifest ID",
  status: "Status",
};
