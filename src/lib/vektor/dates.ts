import { weekBoundsForDate } from "@/lib/fee-engine";
import type { AppointmentType, VektorStop } from "./types";

const USABLE_APPOINTMENT: AppointmentType[] = [
  "APPOINTMENT_TYPE_FIXED",
  "APPOINTMENT_TYPE_RANGE",
];

/**
 * Normalize a Vektor timestamp to "YYYY-MM-DD HH:mm:ss" when possible.
 */
export function normalizeTimestamp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const local = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (local) return `${local[1]} ${local[2]}`;
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `${dateOnly[1]} 00:00:00`;
  return null;
}

export function timestampToDate(ts: string | null): string | null {
  if (!ts) return null;
  return ts.slice(0, 10);
}

/**
 * Resolve stop completion time.
 * checkedOutAt → arrivedAt → appointmentStartAtLocal only if FIXED or RANGE.
 * NEED_TO_SET is never a date.
 */
export function resolveStopDate(stop: VektorStop | undefined): string | null {
  if (!stop) return null;

  const checkout = normalizeTimestamp(stop.checkedOutAt ?? null);
  if (checkout) return checkout;

  const arrived = normalizeTimestamp(stop.arrivedAt ?? null);
  if (arrived) return arrived;

  const apptType = stop.appointmentType ?? "";
  if (apptType === "APPOINTMENT_TYPE_NEED_TO_SET") return null;
  if (!USABLE_APPOINTMENT.includes(apptType)) return null;

  return normalizeTimestamp(stop.appointmentStartAtLocal ?? null);
}

/** Only pickup / dropoff order stops. TYPE_START and others are ignored. */
export function findStop(
  stops: VektorStop[] | undefined,
  type: "pickup" | "dropoff",
): VektorStop | undefined {
  return (stops ?? []).find(
    (s) => (s.orderStopType ?? "").toLowerCase() === type,
  );
}

export function monthKeyFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function weekFieldsFromDeliveryDate(deliveryDateOrTs: string): {
  weekStart: string;
  weekEnd: string;
  monthKey: string;
} {
  const day = timestampToDate(deliveryDateOrTs) ?? deliveryDateOrTs.slice(0, 10);
  const bounds = weekBoundsForDate(day);
  return {
    weekStart: bounds.start,
    weekEnd: bounds.end,
    monthKey: monthKeyFromDate(day),
  };
}
