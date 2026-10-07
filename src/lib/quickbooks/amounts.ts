import { assertCents, centsToDollarString, dollarStringToCents } from "@/lib/money/cents";

/**
 * QuickBooks sends a dollar amount as a JSON number or a string.
 * Extra fractional digits are half-up to cents. A leading minus stays signed.
 */
export function qboAmountToSignedCents(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("QuickBooks amount is not a number");
    const negative = value < 0 || Object.is(value, -0);
    const text = Math.abs(value).toFixed(2);
    const cents = dollarStringToCents(text);
    return negative ? -cents : cents;
  }
  if (typeof value !== "string") throw new Error("QuickBooks amount is missing");
  const trimmed = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) throw new Error("QuickBooks amount is not a dollar value");
  const negative = match[1] === "-";
  const whole = match[2] ?? "0";
  const frac = match[3] ?? "";
  let centsText: string;
  if (frac.length <= 2) {
    centsText = `${whole}.${frac.padEnd(2, "0")}`;
  } else {
    let cents = Number.parseInt(frac.slice(0, 2), 10);
    const roundUp = frac[2] !== undefined && frac[2] >= "5";
    if (roundUp) cents += 1;
    const extraWhole = cents >= 100 ? 1 : 0;
    const fracDigits = String(cents % 100).padStart(2, "0");
    const wholeNumber = Number.parseInt(whole, 10) + extraWhole;
    centsText = `${wholeNumber}.${fracDigits}`;
  }
  const cents = dollarStringToCents(centsText);
  return negative ? -cents : cents;
}

export function assertNonNegativeCents(cents: number, label: string): void {
  assertCents(cents, label);
}

export { centsToDollarString };
