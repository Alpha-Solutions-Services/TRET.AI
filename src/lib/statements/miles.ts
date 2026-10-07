/**
 * Miles on a statement are integer hundredths. Money is never converted here.
 * "332.10" → 33210. A non-integer number is rejected so a float cannot sneak in.
 */

export function milesValueToHundredths(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Miles must be zero or more");
    }
    const hundredths = Math.round(value * 100);
    if (Math.abs(value * 100 - hundredths) > 1e-6) {
      throw new Error("Miles are not an exact hundredth");
    }
    if (!Number.isInteger(hundredths)) {
      throw new Error("Miles must be an integer number of hundredths");
    }
    return hundredths;
  }
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid miles: ${value}`);
  }
  const [wholePart, fracPart = ""] = trimmed.split(".");
  return (
    Number.parseInt(wholePart, 10) * 100 +
    Number.parseInt(fracPart.padEnd(2, "0") || "0", 10)
  );
}
