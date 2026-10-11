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

function fuelLinkOf(load: LoadWindow): FuelLink {
  if (load.tripId) return { ok: true, loadId: "", tripId: load.tripId, unclear: false, unlinked: false };
  return { ok: true, loadId: load.loadId, tripId: "", unclear: false, unlinked: false };
}

/**
 * Fill date against pickup and delivery, inclusive.
 * A fill on a handoff day goes to the new load.
 * A shared trip writes the trip group only.
 * Two loads that both fit, with no handoff and no shared trip, stay unlinked.
 */
export function linkFuelDate(isoDate: string, loads: readonly LoadWindow[]): FuelLink {
  const covering = loads.filter((load) => load.pickupDate <= isoDate && isoDate <= load.deliveryDate);
  if (covering.length === 0) {
    return { ok: true, loadId: "", tripId: "", unclear: false, unlinked: true };
  }
  const starting = covering.filter((load) => load.pickupDate === isoDate);
  const ending = covering.filter((load) => load.deliveryDate === isoDate && load.pickupDate < isoDate);
  if (starting.length === 1 && ending.length >= 1 && starting.length + ending.length === covering.length) {
    return fuelLinkOf(starting[0]!);
  }
  if (covering.length === 1) return fuelLinkOf(covering[0]!);
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

function primaryLoad(loads: readonly LoadWindow[]): LoadWindow {
  const flagged = loads.find((load) => load.primary === true);
  if (flagged) return flagged;
  const tripId = loads[0]?.tripId ?? "";
  const tripNumber = /^M-(\d+)$/.exec(tripId)?.[1];
  if (tripNumber) {
    const named = loads.find((load) => load.loadId.replace(/\D/g, "") === tripNumber);
    if (named) return named;
  }
  return [...loads].sort((a, b) => {
    const miles = (b.loadedMilesHundredths ?? 0) - (a.loadedMilesHundredths ?? 0);
    if (miles !== 0) return miles;
    return a.pickupDate.localeCompare(b.pickupDate) || a.loadId.localeCompare(b.loadId);
  })[0]!;
}

function tripPrimary(load: LoadWindow, loads: readonly LoadWindow[]): string {
  if (!load.tripId) return load.loadId;
  const group = loads.filter((row) => row.tripId === load.tripId);
  return primaryLoad(group.length > 0 ? group : [load]).loadId;
}

/**
 * A toll between pickup and delivery stays on that load.
 * A toll on empty miles, after a delivery and before the next pickup, goes to the next load.
 * Several loads on one trip use that trip's primary row.
 */
export function linkTollTime(occurredAt: string, loads: readonly LoadWindow[]): TollLink {
  const inside = loads.filter((load) => {
    const start = `${load.pickupDate}T00:00:00`;
    const end = `${load.deliveryDate}T23:59:59`;
    return occurredAt >= start && occurredAt <= end;
  });
  if (inside.length === 1) return { ok: true, loadId: tripPrimary(inside[0]!, loads), how: "inside" };
  if (inside.length > 1) {
    const trips = new Set(inside.map((load) => load.tripId).filter(Boolean));
    if (trips.size === 1 && inside.every((load) => load.tripId)) {
      return { ok: true, loadId: primaryLoad(inside).loadId, how: "inside" };
    }
    return {
      ok: false,
      reason: `More than one load covers this toll (${inside.map((load) => load.loadId).join(", ")}).`,
    };
  }
  const sorted = [...loads].sort(
    (a, b) => a.pickupDate.localeCompare(b.pickupDate) || a.loadId.localeCompare(b.loadId),
  );
  const prior = sorted.filter((load) => `${load.deliveryDate}T23:59:59` < occurredAt);
  const next = sorted.find((load) => `${load.pickupDate}T00:00:00` > occurredAt);
  if (prior.length === 0 || !next) return { ok: false, reason: "No load covers this toll time." };
  return { ok: true, loadId: tripPrimary(next, loads), how: "next" };
}
