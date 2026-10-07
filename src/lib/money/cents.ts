/**
 * Dollar strings and integer cents. Never use floating-point for money.
 * 10.10 dollars is 1010 cents (a float multiply would not be exact).
 */

const DOLLAR_RE = /^\d{1,10}(\.\d{1,2})?$/;

/** Postgres integer upper bound, in cents. */
export const MAX_CENTS = 2_147_483_647;

export function assertCents(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents`);
  }
  if (value < 0) {
    throw new Error(`${label} must be zero or more cents`);
  }
  if (value > MAX_CENTS) {
    throw new Error(`${label} is too large`);
  }
}

export function centsInputError(value: number): string | null {
  try {
    assertCents(value, "Amount");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Amount must be a whole number of cents.";
  }
}

/** "10.10" → 1010. "0.29" → 29. Rejects more than two decimal places. */
export function dollarStringToCents(input: string): number {
  const trimmed = input.trim();
  if (!DOLLAR_RE.test(trimmed)) {
    throw new Error("Enter a dollar amount with up to 2 decimal places");
  }
  const [wholePart, fracPart = ""] = trimmed.split(".");
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fracPart.padEnd(2, "0") || "0", 10);
  if (!Number.isInteger(whole) || !Number.isInteger(frac)) {
    throw new Error("Enter a dollar amount with up to 2 decimal places");
  }
  const cents = whole * 100 + frac;
  assertCents(cents, "Amount");
  return cents;
}

export function tryDollarStringToCents(
  input: string,
): { ok: true; cents: number } | { ok: false; error: string } {
  try {
    return { ok: true, cents: dollarStringToCents(input) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid amount",
    };
  }
}

/** 1010 → "10.10". Integer division only. Display may exceed one database integer. */
export function centsToDollarString(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0 || cents > Number.MAX_SAFE_INTEGER) {
    throw new Error("Amount must be an integer number of cents");
  }
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${whole}.${String(frac).padStart(2, "0")}`;
}
