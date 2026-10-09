import { weekBoundsForDate } from "@/lib/fee-engine";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday of the last week that has already ended. The week that contains today is still open. */
export function lastFinishedWeekStart(today = new Date().toISOString().slice(0, 10)): string {
  const currentMonday = weekBoundsForDate(today).start;
  return shiftIso(currentMonday, -7);
}

/** Owners get the report on the Monday that starts the next week. */
export function deliveryMonday(weekStart: string): string {
  return shiftIso(weekBoundsForDate(weekStart).start, 7);
}

export function isoWeekNumber(weekStart: string): number {
  const monday = weekBoundsForDate(weekStart).start;
  const [year, month, day] = monday.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  return Math.floor((date.getTime() - week1Monday.getTime()) / 86_400_000 / 7) + 1;
}

export function formatDeliveryMonday(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `Monday ${MONTHS[(month ?? 1) - 1]} ${day}`;
}

export function reportDeliveryLabel(weekStart: string): string {
  const monday = weekBoundsForDate(weekStart).start;
  return `Report for week ${isoWeekNumber(monday)}, deliver ${formatDeliveryMonday(deliveryMonday(monday))}`;
}
