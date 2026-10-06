import { weekBoundsForDate } from "@/lib/fee-engine";
import type { AppointmentType, VektorStop } from "./types";

const USABLE_APPOINTMENT: AppointmentType[] = [
  "APPOINTMENT_TYPE_FIXED",
  "APPOINTMENT_TYPE_RANGE",
];

/**
 * Resolve stop completion date.
 * checkedOutAt → arrivedAt → appointmentStartAtLocal only if FIXED or RANGE.
 * NEED_TO_SET is never a date.
 */
export function resolveStopDate(stop: VektorStop | undefined): string | null {
  if (!stop) return null;

  const fromIso = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = iso.includes("T") ? iso.slice(0, 10) : iso.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // local "2026-09-11 08:00:00"
    const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?.[1] ?? null;
  };

  const checkout = fromIso(stop.checkedOutAt ?? null);
  if (checkout) return checkout;

  const arrived = fromIso(stop.arrivedAt ?? null);
  if (arrived) return arrived;

  const apptType = stop.appointmentType ?? "";
  if (apptType === "APPOINTMENT_TYPE_NEED_TO_SET") return null;
  if (!USABLE_APPOINTMENT.includes(apptType)) return null;

  return fromIso(stop.appointmentStartAtLocal ?? null);
}

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

export function weekFieldsFromDeliveryDate(deliveryDate: string): {
  weekStart: string;
  weekEnd: string;
  monthKey: string;
} {
  const bounds = weekBoundsForDate(deliveryDate);
  return {
    weekStart: bounds.start,
    weekEnd: bounds.end,
    monthKey: monthKeyFromDate(deliveryDate),
  };
}
