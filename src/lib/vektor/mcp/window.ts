import { findStop, normalizeTimestamp, resolveStopDate, timestampToDate } from "../dates";
import type { VektorManifest } from "../types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDay(value: string, label: string): void {
  if (!DAY.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

export function addUtcDays(isoDay: string, days: number): string {
  assertIsoDay(isoDay, "date");
  const [year, month, day] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Manifest list filter is first-stop based, so the query is wider than the delivery week. */
export function expandFirstStopWindow(from: string, to: string): {
  queryFrom: string;
  queryTo: string;
} {
  assertIsoDay(from, "from");
  assertIsoDay(to, "to");
  if (from > to) {
    throw new Error("Import from date is after to date");
  }
  return {
    queryFrom: addUtcDays(from, -14),
    queryTo: addUtcDays(to, 7),
  };
}

export function manifestDeliveryDay(manifest: VektorManifest): string | null {
  return timestampToDate(resolveStopDate(findStop(manifest.stops, "dropoff")));
}

/** The list filter field matches the first stop, which may be a previous load's TYPE_START. */
export function firstStopAppointmentDay(manifest: VektorManifest): string | null {
  const raw = manifest.stops?.[0]?.appointmentStartAtLocal ?? null;
  return timestampToDate(normalizeTimestamp(raw));
}

export function inInclusiveRange(day: string | null, from: string, to: string): boolean {
  if (!day) return false;
  return day >= from && day <= to;
}

export type ImportWindowReport = {
  queryFrom: string;
  queryTo: string;
  rangeFrom: string;
  rangeTo: string;
  fetchedInWindow: number;
  deliveredByFirstStopDate: number;
  deliveredByDeliveryDate: number;
  keptForImport: number;
  statusCounts: Record<string, number>;
  /** Which list filter actually returned rows, or the one that was tried last. */
  filterLabel?: string;
  /** Operator note when the list was empty or a different filter was used. Keys and counts only. */
  payloadNote?: string | null;
};

export function summarizeManifestWindow(
  manifests: VektorManifest[],
  rangeFrom: string,
  rangeTo: string,
): { kept: VektorManifest[]; report: ImportWindowReport } {
  const window = expandFirstStopWindow(rangeFrom, rangeTo);
  const statusCounts: Record<string, number> = {};
  let deliveredByFirstStopDate = 0;
  let deliveredByDeliveryDate = 0;
  const kept: VektorManifest[] = [];

  for (const manifest of manifests) {
    statusCounts[manifest.status] = (statusCounts[manifest.status] ?? 0) + 1;
    const delivered = manifest.status === "STATUS_DELIVERED";
    if (delivered && inInclusiveRange(firstStopAppointmentDay(manifest), rangeFrom, rangeTo)) {
      deliveredByFirstStopDate += 1;
    }
    const deliveryDay = manifestDeliveryDay(manifest);
    if (delivered && inInclusiveRange(deliveryDay, rangeFrom, rangeTo)) {
      deliveredByDeliveryDate += 1;
    }
    if (inInclusiveRange(deliveryDay, rangeFrom, rangeTo)) {
      kept.push(manifest);
    }
  }

  return {
    kept,
    report: {
      queryFrom: window.queryFrom,
      queryTo: window.queryTo,
      rangeFrom,
      rangeTo,
      fetchedInWindow: manifests.length,
      deliveredByFirstStopDate,
      deliveredByDeliveryDate,
      keptForImport: kept.length,
      statusCounts,
    },
  };
}

export function formatImportResultMessage(input: {
  source: string;
  fetched: number;
  promoted: number;
  updated: number;
  rejected: number;
  report?: ImportWindowReport | null;
}): string {
  const parts = [
    `Source ${input.source}: fetched ${input.fetched}. Promoted ${input.promoted}, updated ${input.updated}, rejected ${input.rejected}.`,
  ];
  if (input.report) {
    parts.push(
      `Query window ${input.report.queryFrom} to ${input.report.queryTo} (delivery week ${input.report.rangeFrom} to ${input.report.rangeTo}). Delivered by first-stop date: ${input.report.deliveredByFirstStopDate}. Delivered by delivery date: ${input.report.deliveredByDeliveryDate}.`,
    );
    if (input.report.filterLabel) {
      parts.push(`List filter: ${input.report.filterLabel}.`);
    }
    if (input.report.payloadNote) {
      parts.push(input.report.payloadNote);
    }
  }
  if (input.fetched === 0) {
    parts.push("No manifests were returned for this range. The import did not silently record zero rows.");
  }
  return parts.join(" ");
}
