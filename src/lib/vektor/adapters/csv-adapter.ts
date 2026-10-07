import type {
  AdapterStatus,
  FetchManifestsInput,
  FetchManifestsResult,
  ImportSourceAdapter,
} from "./types";

/**
 * CSV export adapter. Column names are OPEN until a real Vektor orders export
 * is provided. Shows "not configured" until then.
 */
export class CsvExportAdapter implements ImportSourceAdapter {
  readonly id = "csv" as const;

  constructor(
    private readonly opts: {
      /** Column mapping config; null = not configured */
      columnMapping: Record<string, string> | null;
      /** Optional CSV text for a run (tests / future upload) */
      csvText?: string | null;
    } = { columnMapping: null },
  ) {}

  status(): AdapterStatus {
    if (!this.opts.columnMapping) {
      return {
        id: "csv",
        label: "CSV export",
        selectable: false,
        configured: false,
        message:
          "not configured — provide a real Vektor orders CSV export so column names can be mapped (OPEN until then).",
      };
    }
    return {
      id: "csv",
      label: "CSV export",
      selectable: true,
      configured: true,
      message: "Ready (column mapping configured).",
    };
  }

  async fetchManifests(_input: FetchManifestsInput): Promise<FetchManifestsResult> {
    const st = this.status();
    if (!st.selectable) {
      throw new Error(st.message);
    }
    // Parser implemented behind mapping; needs real export columns (OPEN).
    throw new Error(
      "CSV parse waiting on confirmed column mapping from a real export (OPEN).",
    );
  }
}
