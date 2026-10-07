import { roundHalfUpDivide } from "@/lib/fee-engine/money";

const GALLONS_RE = /^\d{1,7}(\.\d{1,3})?$/;

/** "100.000" → 100000. "10.5" → 10500. Rejects a fourth decimal. */
export function gallonsStringToMilli(input: string): number {
  const trimmed = input.trim();
  if (!GALLONS_RE.test(trimmed)) {
    throw new Error("Gallons must be a number with up to 3 decimal places");
  }
  const [wholePart, fracPart = ""] = trimmed.split(".");
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fracPart.padEnd(3, "0") || "0", 10);
  const milli = whole * 1000 + frac;
  if (!Number.isInteger(milli) || milli > 2_147_483_647) {
    throw new Error("Gallons value is too large");
  }
  return milli;
}

/** Tenth-cents per gallon from discounted cents and milli-gallons. $3.499 → 3499. */
export function priceTenthCentsPerGallon(
  amountCents: number,
  gallonsMilli: number,
): number | null {
  if (!Number.isInteger(amountCents) || amountCents < 0) return null;
  if (!Number.isInteger(gallonsMilli) || gallonsMilli <= 0) return null;
  return roundHalfUpDivide(BigInt(amountCents) * BigInt(10000), BigInt(gallonsMilli));
}

/**
 * MPG × 1000. Miles are hundredths. 600.00 miles and 100.000 gallons → 6000 (6.000 mpg).
 */
export function mpgMilliFromHundredths(
  milesHundredths: number,
  gallonsMilli: number,
): number | null {
  if (!Number.isInteger(milesHundredths) || milesHundredths < 0) return null;
  if (!Number.isInteger(gallonsMilli) || gallonsMilli <= 0) return null;
  return roundHalfUpDivide(BigInt(milesHundredths) * BigInt(10000), BigInt(gallonsMilli));
}

export function formatGallonsMilli(milli: number): string {
  if (!Number.isInteger(milli) || milli < 0) {
    throw new Error("Gallons must be a non-negative integer of milli-gallons");
  }
  const whole = Math.floor(milli / 1000);
  const frac = milli % 1000;
  return `${whole}.${String(frac).padStart(3, "0")}`;
}

export function formatMpgMilli(mpgMilli: number): string {
  if (!Number.isInteger(mpgMilli) || mpgMilli < 0) {
    throw new Error("MPG must be a non-negative integer of milli-mpg");
  }
  const whole = Math.floor(mpgMilli / 1000);
  const frac = mpgMilli % 1000;
  return `${whole}.${String(frac).padStart(3, "0")}`;
}

/** Numeric miles from Postgres → hundredths, via the decimal text, not a float multiply. */
export function milesToHundredths(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const text = typeof value === "number" ? value.toString() : value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return 0;
  const [wholePart, fracPart = ""] = text.split(".");
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fracPart.padEnd(2, "0").slice(0, 2) || "0", 10);
  return whole * 100 + frac;
}
