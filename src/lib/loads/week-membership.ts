import { manifestGroupKey } from "@/lib/loads/manifest-miles";

export type WeekMember = {
  loadId: string;
  pickupDay: string | null;
  deliveryDay: string | null;
  /** Trip or manifest id. Loads on a trip stay with that trip. */
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
 * Sheet week: Monday through Sunday.
 * A load is in the week when its pickup or delivery falls in the week.
 * A load picked up earlier stays in the week when it delivers in the week,
 * or when another load on the same trip is in the week.
 */
export function loadsInWeek<T extends WeekMember>(loads: readonly T[], from: string, to: string): T[] {
  const direct = new Set<string>();
  for (const load of loads) {
    if (dayInSpan(load.deliveryDay, from, to) || dayInSpan(load.pickupDay, from, to)) {
      direct.add(load.loadId);
    }
  }
  const trips = new Set<string>();
  for (const load of loads) {
    const trip = tripKeyOf(load.tripRef);
    if (trip && direct.has(load.loadId)) trips.add(trip);
  }
  return loads.filter((load) => {
    if (direct.has(load.loadId)) return true;
    const trip = tripKeyOf(load.tripRef);
    return Boolean(trip && trips.has(trip));
  });
}
