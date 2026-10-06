import type { WeekBounds } from "./types";
import { assertIsoDate } from "./contracts";

/**
 * Monday–Sunday week containing the given date (inclusive).
 * Example: week of 2026-09-21 ends 2026-09-27.
 */
export function weekBoundsForDate(date: string): WeekBounds {
  assertIsoDate(date, "date");
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0=Sun … 6=Sat. Monday-based offset from Monday.
  const day = utc.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;

  const start = new Date(utc);
  start.setUTCDate(start.getUTCDate() - daysFromMonday);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    start: formatUtcDate(start),
    end: formatUtcDate(end),
  };
}

function formatUtcDate(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
