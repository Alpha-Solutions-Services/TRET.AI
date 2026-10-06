/**
 * Convert a percent string (0–100, up to 2 decimals) to integer basis points.
 * 5.5 → 550, 2.65 → 265, 100 → 10000. No floating-point multiply.
 */
export function percentStringToBp(input: string): number {
  const trimmed = input.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Enter a number from 0 to 100 with up to 2 decimal places");
  }
  const [wholePart, fracPart = ""] = trimmed.split(".");
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fracPart.padEnd(2, "0") || "0", 10);
  const bp = whole * 100 + frac;
  if (bp < 0 || bp > 10000) {
    throw new Error("Value must be between 0 and 100");
  }
  // Reject 100.01 etc. already via bp check; also reject whole > 100 with empty frac handled.
  if (whole > 100 || (whole === 100 && frac !== 0)) {
    throw new Error("Value must be between 0 and 100");
  }
  return bp;
}

/** Format basis points as a percent string without float (550 → "5.5"). */
export function bpToPercentString(bp: number): string {
  if (!Number.isInteger(bp) || bp < 0 || bp > 10000) {
    throw new Error("basis points must be an integer from 0 to 10000");
  }
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  if (frac === 0) return String(whole);
  if (frac % 10 === 0) return `${whole}.${frac / 10}`;
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

export function tryPercentStringToBp(input: string): { ok: true; bp: number } | { ok: false; error: string } {
  try {
    return { ok: true, bp: percentStringToBp(input) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid percent",
    };
  }
}
