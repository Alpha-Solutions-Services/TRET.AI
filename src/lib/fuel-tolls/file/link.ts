import { canonicalLoadId } from "@/lib/loads/load-id";
import type { LoadWindow } from "./types";

/** Trip groups stay M-1195. Load ids stay TBH--1192. */
export function canonicalTripId(raw: string | null | undefined): string {
  const compact = (raw ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, "");
  if (!compact || compact === "-" || /^n\/a$/i.test(compact)) return "";
  const match = /^M-*(\d+)$/i.exec(compact);
  if (!match) return "";
  return `M-${match[1]}`;
}

export function canonicalStoredLoadId(raw: string | null | undefined): string {
  const id = canonicalLoadId(raw);
  return id && id !== "-" ? id : "";
}

export function isoToUs(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${month}/${day}/${year}`;
}

export type FuelLink =
  | { ok: true; loadId: string; tripId: string; unclear: false; unlinked: boolean }
  | { ok: false; unclear: true; reason: string };

/** Fill date against pickup and delivery, inclusive. Shared trip writes M-#### only. */
export function linkFuelDate(isoDate: string, loads: readonly LoadWindow[]): FuelLink {
  const covering = loads.filter((load) => load.pickupDate <= isoDate && isoDate <= load.deliveryDate);
  if (covering.length === 0) {
    return { ok: true, loadId: "", tripId: "", unclear: false, unlinked: true };
  }
  if (covering.length === 1) {
    const load = covering[0]!;
    if (load.tripId) return { ok: true, loadId: "", tripId: load.tripId, unclear: false, unlinked: false };
    return { ok: true, loadId: load.loadId, tripId: "", unclear: false, unlinked: false };
  }
  const trips = new Set(covering.map((load) => load.tripId).filter(Boolean));
  if (trips.size === 1 && covering.every((load) => load.tripId)) {
    return { ok: true, loadId: "", tripId: [...trips][0]!, unclear: false, unlinked: false };
  }
  const names = covering.map((load) => load.tripId || load.loadId).join(", ");
  return {
    ok: false,
    unclear: true,
    reason: `Two loads cover ${isoToUs(isoDate)} (${names}), so Load ID and Trip Group ID were left blank.`,
  };
}

export type TollLink =
  | { ok: true; loadId: string; how: "inside" | "next" }
  | { ok: false; reason: string };

/**
 * A toll inside pickup through delivery stays on that load.
 * After a delivery, empty miles go to the next load.
 */
export function linkTollTime(occurredAt: string, loads: readonly LoadWindow[]): TollLink {
  const inside = loads.filter((load) => {
    const start = `${load.pickupDate}T00:00:00`;
    const end = `${load.deliveryDate}T23:59:59`;
    return occurredAt >= start && occurredAt <= end;
  });
  if (inside.length === 1) return { ok: true, loadId: inside[0]!.loadId, how: "inside" };
  if (inside.length > 1) {
    return {
      ok: false,
      reason: `More than one load covers this toll (${inside.map((load) => load.loadId).join(", ")}).`,
    };
  }
  const afterDelivery = loads.some((load) => `${load.deliveryDate}T23:59:59` < occurredAt);
  if (!afterDelivery) {
    return { ok: false, reason: "No load covers this toll time." };
  }
  const next = [...loads]
    .filter((load) => `${load.pickupDate}T00:00:00` > occurredAt)
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate) || a.loadId.localeCompare(b.loadId))[0];
  if (!next) return { ok: false, reason: "No load covers this toll, and there is no next load for the empty miles." };
  return { ok: true, loadId: next.loadId, how: "next" };
}
