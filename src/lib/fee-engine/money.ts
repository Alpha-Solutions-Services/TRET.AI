/**
 * Money helpers. Never use floating-point for money.
 * Amounts are integer cents. Rates/bases are integer basis points.
 */

export function assertInteger(
  value: number,
  label: string,
): asserts value is number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer (got ${value})`);
  }
}

export function assertNonNegativeInteger(value: number, label: string): void {
  assertInteger(value, label);
  if (value < 0) {
    throw new Error(`${label} must be >= 0 (got ${value})`);
  }
}

/**
 * Round half up to the nearest integer for a non-negative rational n/d.
 * Single shared rounding function for fee lines.
 */
export function roundHalfUpDivide(numerator: bigint, denominator: bigint): number {
  if (denominator <= BigInt(0)) {
    throw new Error("denominator must be > 0");
  }
  if (numerator < BigInt(0)) {
    throw new Error("numerator must be >= 0 for fee rounding");
  }
  // (n + d/2) / d rounds half up for non-negative values.
  const rounded = (numerator + denominator / BigInt(2)) / denominator;
  return Number(rounded);
}

/**
 * cents = round(grossCents * basePctBp / 10000 * rateBp / 10000)
 */
export function applyRateToGrossCents(
  grossCents: number,
  basePctBp: number,
  rateBp: number,
): number {
  assertNonNegativeInteger(grossCents, "grossCents");
  assertNonNegativeInteger(basePctBp, "basePctBp");
  assertNonNegativeInteger(rateBp, "rateBp");
  if (basePctBp > 10000) {
    throw new Error(`basePctBp must be <= 10000 (got ${basePctBp})`);
  }
  if (rateBp > 10000) {
    throw new Error(`rateBp must be <= 10000 (got ${rateBp})`);
  }

  const numerator =
    BigInt(grossCents) * BigInt(basePctBp) * BigInt(rateBp);
  const denominator = BigInt(10000) * BigInt(10000);
  return roundHalfUpDivide(numerator, denominator);
}
