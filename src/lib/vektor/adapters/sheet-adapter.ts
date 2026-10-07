import { inWeek } from "@/lib/sheets/cell";
import { parseLoadLedger } from "@/lib/sheets/ledger";
import type { SheetGrid } from "@/lib/sheets/ins-outs";
import { loadRowsToManifests, type LoadImportRow } from "./load-rows";
import type { ImportWindowReport } from "../mcp/window";
import type {
  AdapterStatus,
  FetchManifestsInput,
  FetchManifestsResult,
  ImportSourceAdapter,
} from "./types";

export type SheetLedgerSource = {
  unitNumber: string;
  grid: SheetGrid | null;
  note: string | null;
};

/**
 * Optional path: promote each truck Load Ledger into loads for the import
 * dates. Ins and Outs stay a sheet read and do not require this import.
 */
export class SheetLedgerAdapter implements ImportSourceAdapter {
  readonly id = "sheet" as const;

  constructor(
    private readonly opts: {
      loadLedgers?: () => Promise<SheetLedgerSource[]>;
    } = {},
  ) {}

  status(): AdapterStatus {
    return {
      id: "sheet",
      label: "Google Sheet Load Ledger",
      selectable: true,
      configured: true,
      message:
        "Optional. Promotes each active truck Load Ledger into loads for the import dates when Vektor is unavailable. Ins and Outs still read the sheet directly. Private sheets need GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
    };
  }

  async fetchManifests(input: FetchManifestsInput): Promise<FetchManifestsResult> {
    if (!this.opts.loadLedgers) {
      throw new Error("Google Sheet import is not wired on this run.");
    }
    const sources = await this.opts.loadLedgers();
    const notes: string[] = [];
    const rows: LoadImportRow[] = [];
    for (const source of sources) {
      if (!source.grid) {
        notes.push(`Unit ${source.unitNumber}: ${source.note ?? "Load Ledger was not read."}`);
        continue;
      }
      const parsed = parseLoadLedger(source.grid);
      if (!parsed.headerFound) {
        notes.push(
          `Unit ${source.unitNumber}: Load Ledger header was not found. Expected Delivery Date, Load ID, and Rate.`,
        );
        continue;
      }
      for (const row of parsed.rows) {
        if (!inWeek(row.deliveryDay, input.from, input.to)) continue;
        if (row.rateCents == null) continue;
        rows.push({
          unitNumber: source.unitNumber,
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
    }
    if (rows.length === 0 && notes.length > 0) {
      throw new Error(notes.join(" "));
    }
    const built = loadRowsToManifests(rows);
    const report: ImportWindowReport = {
      queryFrom: input.from,
      queryTo: input.to,
      rangeFrom: input.from,
      rangeTo: input.to,
      fetchedInWindow: built.manifests.length,
      deliveredByFirstStopDate: 0,
      deliveredByDeliveryDate: built.manifests.length,
      keptForImport: built.manifests.length,
      statusCounts: {},
      filterLabel: "google sheet load ledger",
      payloadNote: notes.length ? notes.join(" ") : null,
    };
    return { manifests: built.manifests, lookups: built.lookups, report };
  }
}
