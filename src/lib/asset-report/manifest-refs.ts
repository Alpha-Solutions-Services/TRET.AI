import { loadMatchKey } from "@/lib/loads/load-id";
import { unitKey } from "@/lib/sheets/mismatch";

/** A loads row used only to attach a Vektor manifest to a sheet load. */
export type ManifestLoadRow = {
  load_id: string | null;
  source_manifest_ref: string | null;
  truck_unit_number: string | null;
  /** Kept so callers can pass the query row. Delivery date does not decide the match. */
  delivery_date?: string | null;
};

/**
 * Map a canonical load id to its Vektor manifest.
 * Sheet rows and Vektor rows match on letters and digits (TBH1188 and TBH--1188).
 * A blank delivery date still counts. In Transit orders in the Oct 5 export have no delivery date,
 * and a week filter dropped them, so the report counted every load on the manifest.
 * A blank manifest does not erase a manifest already stored on another row for the same load.
 */
export function manifestRefsByLoad(rows: readonly ManifestLoadRow[], unitNumber: string): Record<string, string> {
  const wanted = unitKey(unitNumber);
  const map: Record<string, string> = {};
  for (const row of rows) {
    const ref = row.source_manifest_ref?.trim() ?? "";
    if (!row.load_id || !ref || !row.truck_unit_number) continue;
    if (unitKey(row.truck_unit_number) !== wanted) continue;
    const key = loadMatchKey(row.load_id);
    if (!map[key]) map[key] = ref;
  }
  return map;
}
