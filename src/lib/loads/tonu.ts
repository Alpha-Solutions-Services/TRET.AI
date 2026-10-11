import { tryDollarStringToCents } from "@/lib/money/cents";
import { weekBoundsForDate } from "@/lib/fee-engine/week";

export const TONU_UNCONFIRMED = "TONU rate unconfirmed";

export type TonuRead =
  | { status: "confirmed"; amountCents: number; loadedMilesHundredths: 0 }
  | { status: "hold"; flag: typeof TONU_UNCONFIRMED; amountCents: null };

/**
 * A marked TONU uses the TONU amount written on the rate con and sets loaded miles to 0.
 * If the only amount is the full freight rate, the load is held into the next week.
 */
export function readTonuRateCon(text: string, freightRateCents: number): TonuRead {
  const labeled = /tonu[^0-9$]{0,40}\$?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i.exec(text);
  if (labeled?.[1]) {
    const parsed = tryDollarStringToCents(labeled[1].replace(/,/g, ""));
    if (parsed.ok && parsed.cents !== freightRateCents) {
      return { status: "confirmed", amountCents: parsed.cents, loadedMilesHundredths: 0 };
    }
  }
  return { status: "hold", flag: TONU_UNCONFIRMED, amountCents: null };
}

/** Monday of the week after the delivery week. The load is not counted in the delivery week. */
export function tonuHoldWeekStart(deliveryDay: string): string {
  const delivery = weekBoundsForDate(deliveryDay);
  const next = new Date(`${delivery.end}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return weekBoundsForDate(next.toISOString().slice(0, 10)).start;
}
