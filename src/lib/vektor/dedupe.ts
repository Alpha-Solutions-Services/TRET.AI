import { canonicalLoadId, loadMatchKey } from "@/lib/loads/load-id";
import { unitKey } from "@/lib/sheets/mismatch";

export type ExistingLoadRef = {
  id: string;
  loadId: string | null;
  unitNumber: string | null;
  manifestId: string;
  importRunId: string | null;
};

/**
 * Match a load by normalized id and truck, preferring the canonical id and a
 * hand entered row. A shared manifest id is not a key.
 */
export function chooseExistingLoad<T extends ExistingLoadRef>(
  rows: T[],
  incoming: { loadId: string; unitNumber: string; manifestId: string },
): T | null {
  const key = loadMatchKey(incoming.loadId);
  const unit = unitKey(incoming.unitNumber);
  const byKey = rows.filter(
    (row) =>
      Boolean(row.loadId) &&
      loadMatchKey(row.loadId) === key &&
      key !== "" &&
      unitKey(row.unitNumber ?? "") === unit,
  );
  const canonical = canonicalLoadId(incoming.loadId);
  const preferred =
    byKey.find((row) => row.loadId === canonical) ??
    byKey.find((row) => row.importRunId == null) ??
    byKey[0] ??
    null;
  if (preferred) return preferred;
  return rows.find((row) => row.manifestId === incoming.manifestId) ?? null;
}

/**
 * Row-count drop compares the last successful run of the same source and the same kind.
 * A toll file must not become the baseline for a loads import.
 */
export function sameSourcePreviousCount(
  runs: Array<{ source: string | null; rowsFetched: number; kind?: string | null }>,
  source: string,
  kind = "loads",
): number | null {
  const match = runs.find((run) => run.source === source && run.kind === kind);
  return match ? match.rowsFetched : null;
}
