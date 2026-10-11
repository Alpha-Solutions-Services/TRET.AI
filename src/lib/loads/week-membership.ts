import { manifestGroupKey } from "@/lib/loads/manifest-miles";

export type WeekMember = {
  loadId: string;
  pickupDay: string | null;
  deliveryDay: string | null;
  /** Trip or manifest id. Kept for callers. It does not pull a load into the week. */
  tripRef?: string | null;
};

export function dayInSpan(day: string | null | undefined, from: string, to: string): boolean {
  if (!day) return false;
  return day >= from && day <= to;
}

export function tripKeyOf(ref: string | null | undefined): string | null {
  return manifestGroupKey(ref);
}

/**
 * A load counts only in the Monday–Sunday week of its Vektor delivery date.
 * A load picked up before the week is included when it delivers in the week.
 * In-transit loads (no delivery date) are not counted. They stay Pending.
 * Sharing a trip does not pull another load into the week.
 */
export function loadsInWeek<T extends WeekMember>(loads: readonly T[], from: string, to: string): T[] {
  return loads.filter((load) => dayInSpan(load.deliveryDay, from, to));
}

/** In transit through the end of the week. Shown as Pending and not counted. */
export function pendingLoads<T extends WeekMember>(loads: readonly T[], to: string): T[] {
  return loads.filter((load) => !load.deliveryDay && Boolean(load.pickupDay) && load.pickupDay! <= to);
}
