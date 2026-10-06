/**
 * Convert a Vektor decimal money string (e.g. "2500.00") to integer cents.
 * No floating-point multiply.
 */
export function decimalStringToCents(input: string): number {
  const trimmed = input.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid money amount: ${input}`);
  }
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fracPart = ""] = raw.split(".");
  const cents =
    Number.parseInt(wholePart, 10) * 100 +
    Number.parseInt(fracPart.padEnd(2, "0") || "0", 10);
  return negative ? -cents : cents;
}

export function decimalStringToMiles(input: string | null | undefined): number | null {
  if (input == null || input === "") return null;
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid distance: ${input}`);
  }
  const [w, f = ""] = trimmed.split(".");
  // Store as number with 2 decimal places via integer hundredths then /100
  const hundredths =
    Number.parseInt(w, 10) * 100 + Number.parseInt(f.padEnd(2, "0") || "0", 10);
  return hundredths / 100;
}
