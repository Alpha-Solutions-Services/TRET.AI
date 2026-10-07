import { roundHalfUpDivide } from "@/lib/fee-engine/money";

/** Dollars for a PDF. Integer cents in, no floating-point multiply. */
export function formatStatementDollars(cents: number): string {
  if (!Number.isInteger(cents) || Math.abs(cents) > Number.MAX_SAFE_INTEGER) {
    throw new Error("Amount must be an integer number of cents");
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const withCommas = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${withCommas}.${String(frac).padStart(2, "0")}`;
}

/** Miles stored as integer hundredths. "432.00" from 43200. */
export function formatMilesHundredths(hundredths: number): string {
  if (!Number.isInteger(hundredths) || hundredths < 0 || hundredths > Number.MAX_SAFE_INTEGER) {
    throw new Error("Miles must be an integer number of hundredths");
  }
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  const withCommas = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withCommas}.${String(frac).padStart(2, "0")}`;
}

/** Gallons stored as integer thousandths. */
export function formatGallonsMilli(milli: number): string {
  if (!Number.isInteger(milli) || milli < 0 || milli > Number.MAX_SAFE_INTEGER) {
    throw new Error("Gallons must be an integer number of thousandths");
  }
  const whole = Math.floor(milli / 1000);
  const frac = milli % 1000;
  const withCommas = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withCommas}.${String(frac).padStart(3, "0")}`;
}

/** Cents per whole mile. Miles are hundredths. Null when miles are zero. */
export function centsPerLoadedMile(cents: number, milesHundredths: number): number | null {
  if (!Number.isInteger(cents) || !Number.isInteger(milesHundredths) || milesHundredths < 0) {
    throw new Error("Rate per mile needs integer cents and miles");
  }
  if (milesHundredths === 0) return null;
  return roundHalfUpDivide(BigInt(cents) * BigInt(100), BigInt(milesHundredths));
}

/** Average cents per load. Null when there are no loads. */
export function centsPerLoad(cents: number, loadCount: number): number | null {
  if (!Number.isInteger(cents) || !Number.isInteger(loadCount) || loadCount < 0) {
    throw new Error("Revenue per load needs integer cents and a load count");
  }
  if (loadCount === 0) return null;
  return roundHalfUpDivide(BigInt(cents), BigInt(loadCount));
}

/**
 * Diesel MPG to 2 decimals, as a string. Null when miles or diesel gallons are zero.
 * MPG hundredths = round(loaded hundredths * 1000 / gallons thousandths).
 */
export function formatDieselMpg(loadedMilesHundredths: number, dieselGallonsMilli: number): string | null {
  if (
    !Number.isInteger(loadedMilesHundredths) ||
    !Number.isInteger(dieselGallonsMilli) ||
    loadedMilesHundredths < 0 ||
    dieselGallonsMilli < 0
  ) {
    throw new Error("MPG needs integer miles and gallons");
  }
  if (loadedMilesHundredths === 0 || dieselGallonsMilli === 0) return null;
  const hundredths = roundHalfUpDivide(
    BigInt(loadedMilesHundredths) * BigInt(1000),
    BigInt(dieselGallonsMilli),
  );
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return `${whole}.${String(frac).padStart(2, "0")}`;
}
