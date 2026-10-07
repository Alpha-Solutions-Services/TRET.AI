import { parseCsv } from "@/lib/fuel-tolls/csv";
import { canonicalLoadId } from "@/lib/loads/load-id";
import { cleanCell, columnIndex, isEmptyCell, normalizeHeader, sheetDay } from "@/lib/sheets/cell";
import { parseLoadLedger } from "@/lib/sheets/ledger";
import { unitKey } from "@/lib/sheets/mismatch";
import type { LoadImportRow } from "./adapters/load-rows";

export const VEKTOR_CSV_PRESET: Record<string, string> = {
  load_id: "Order ID",
  rate: "Gross",
  unit: "Truck Reference ID",
  driver: "Drivers",
  loaded_miles: "Loaded Miles",
  deadhead_miles: "Empty Miles",
  pickup_date: "Origin Datetime",
  delivery_date: "Order Date Delivered",
  delivery_date_fallback: "Destination Datetime",
  broker: "Broker Name",
};

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

export type CsvLoadPreview = {
  loadId: string;
  unitNumber: string;
  statusLabel: string;
  deliveryDay: string | null;
  rateCents: number | null;
  action: "import" | "skip";
  reason: string | null;
  importRow: LoadImportRow | null;
};

export function applyColumnMapping(grid: string[][], mapping: Record<string, string> | null): string[][] {
  if (!mapping) return grid;
  const rename = new Map<string, string>();
  for (const [field, header] of Object.entries(mapping)) {
    const canonical = CANONICAL[field];
    if (canonical && header.trim()) rename.set(header.trim().toLowerCase(), canonical);
  }
  if (rename.size === 0) return grid;
  return grid.map((row) => row.map((cell) => rename.get(cell.trim().toLowerCase()) ?? cell));
}

export function importStatus(raw: string | null): { delivered: boolean; label: string } {
  const text = (raw ?? "").trim();
  if (!text) return { delivered: true, label: "Delivered" };
  if (/^status_delivered$/i.test(text) || /^delivered$/i.test(text)) {
    return { delivered: true, label: "Delivered" };
  }
  if (/en route/i.test(text)) return { delivered: false, label: "En Route" };
  if (/^booked$/i.test(text) || /^status_booked$/i.test(text)) {
    return { delivered: false, label: "Booked" };
  }
  if (/in transit/i.test(text)) return { delivered: false, label: "In Transit" };
  if (/^status_deleted$/i.test(text) || /^deleted$/i.test(text)) {
    return { delivered: false, label: "Deleted" };
  }
  return { delivered: false, label: text };
}

export function statusSkipReason(label: string): string {
  return `Skipped: status is ${label}. Only Delivered loads import.`;
}

function sameStamp(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const left = sheetDay(a);
  const right = sheetDay(b);
  if (!left || !right || left !== right) return false;
  const leftTime = cleanCell(a).slice(10, 16).trim();
  const rightTime = cleanCell(b).slice(10, 16).trim();
  if (!leftTime || !rightTime) return true;
  return leftTime === rightTime;
}

function headerIndex(header: string[], names: string[]): number {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return header.findIndex((cell) => wanted.has(normalizeHeader(cell)));
}

function cellAt(row: string[], index: number): string | null {
  if (index < 0) return null;
  const text = row[index] ?? "";
  if (isEmptyCell(text)) return null;
  const cleaned = cleanCell(text);
  return cleaned || null;
}

export function parseVektorLoadsCsv(
  text: string,
  mapping: Record<string, string> | null,
  range?: { from: string; to: string },
): { headerFound: boolean; rows: CsvLoadPreview[] } {
  const grid = applyColumnMapping(parseCsv(text), mapping);
  const fallback = mapping?.delivery_date_fallback?.trim();
  const parsed = parseLoadLedger(grid, {
    keepUndated: true,
    deliveryFallback: fallback ? [fallback] : [],
  });
  if (!parsed.headerFound) return { headerFound: false, rows: [] };

  const headerIndexRow = grid.findIndex((row) =>
    row.some((cell) => {
      const name = normalizeHeader(cell);
      return name === "load id" || name === "order id";
    }),
  );
  const header = headerIndexRow >= 0 ? (grid[headerIndexRow] ?? []) : [];
  const manifestCol = columnIndex(header, ["manifest id"]);
  const orderDateCol = headerIndex(header, ["order date delivered", "delivery date"]);
  const originAtCol = headerIndex(header, ["origin datetime"]);
  const destAtCol = headerIndex(header, ["destination datetime"]);
  const startCol = headerIndex(header, ["start at"]);
  const endCol = headerIndex(header, ["end at"]);

  const rawByKey = new Map<
    string,
    { manifestRef: string | null; orderDelivered: string | null; originAt: string | null; destAt: string | null; startAt: string | null; endAt: string | null }
  >();
  const manifestCounts = new Map<string, number>();
  if (headerIndexRow >= 0) {
    for (const row of grid.slice(headerIndexRow + 1)) {
      const loadId = canonicalLoadId((row[columnIndex(header, ["load id", "order id"])] ?? "").replace(/\s+/g, ""));
      if (!loadId) continue;
      const manifestRef = cellAt(row, manifestCol);
      rawByKey.set(loadId, {
        manifestRef,
        orderDelivered: cellAt(row, orderDateCol),
        originAt: cellAt(row, originAtCol),
        destAt: cellAt(row, destAtCol),
        startAt: cellAt(row, startCol),
        endAt: cellAt(row, endCol),
      });
      if (manifestRef) manifestCounts.set(manifestRef, (manifestCounts.get(manifestRef) ?? 0) + 1);
    }
  }

  const rows: CsvLoadPreview[] = [];
  for (const row of parsed.rows) {
    const status = importStatus(row.status);
    const unitRaw = (row.unitNumber ?? parsed.unitHint ?? "").trim();
    const unitNumber = unitRaw ? unitKey(unitRaw) : "";
    const raw = rawByKey.get(row.loadId);
    const shared = Boolean(raw?.manifestRef && (manifestCounts.get(raw.manifestRef) ?? 0) > 1);
    const deliveryManifest =
      shared &&
      (row.deliverySource === "fallback" ||
        sameStamp(raw?.orderDelivered ?? null, raw?.destAt ?? null) ||
        sameStamp(raw?.orderDelivered ?? null, raw?.endAt ?? null));
    const pickupManifest =
      shared &&
      (sameStamp(row.pickupDay, raw?.originAt ?? null) || sameStamp(row.pickupDay, raw?.startAt ?? null));
    const importRow: LoadImportRow = {
      unitNumber: unitRaw,
      loadId: row.loadId,
      deliveryDay: row.deliveryDay,
      pickupDay: row.pickupDay,
      rateCents: row.rateCents ?? 0,
      loadedMilesHundredths: row.loadedMilesHundredths,
      deadheadMilesHundredths: row.deadheadMilesHundredths,
      origin: row.origin,
      destination: row.destination,
      driverName: row.driver,
      brokerName: row.broker,
      manifestId: null,
      status: row.status,
      deliveryDateKind: deliveryManifest ? "manifest" : "order",
      pickupDateKind: pickupManifest ? "manifest" : "order",
      sourceManifestRef: raw?.manifestRef ?? null,
    };

    let action: "import" | "skip" = "import";
    let reason: string | null = null;
    if (!status.delivered) {
      action = "skip";
      reason = statusSkipReason(status.label);
    } else if (!row.deliveryDay) {
      action = "skip";
      reason = "Skipped: delivery date is empty.";
    } else if (row.rateCents == null) {
      action = "skip";
      reason = "Skipped: rate is empty.";
    } else if (!unitRaw) {
      action = "skip";
      reason = "Skipped: truck is empty.";
    } else if (range && (row.deliveryDay < range.from || row.deliveryDay > range.to)) {
      action = "skip";
      reason = "Skipped: delivery date is outside the selected dates.";
    }

    rows.push({
      loadId: row.loadId,
      unitNumber,
      statusLabel: status.label,
      deliveryDay: row.deliveryDay || null,
      rateCents: row.rateCents,
      action,
      reason,
      importRow: action === "import" ? importRow : null,
    });
  }
  return { headerFound: true, rows };
}
