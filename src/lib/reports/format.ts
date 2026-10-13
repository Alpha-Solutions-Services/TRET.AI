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

/** Whole miles for the dashboard. 487700 hundredths is "4,877". The stored hundredths do not change. */
export function formatMilesWhole(hundredths: number): string {
  if (!Number.isInteger(hundredths) || hundredths < 0 || hundredths > Number.MAX_SAFE_INTEGER) {
    throw new Error("Miles must be an integer number of hundredths");
  }
  return formatGroupedInt(Math.floor(hundredths / 100));
}

/** Integer with thousands separators. Used while a count-up eases toward a whole number. */
export function formatGroupedInt(value: number): string {
  if (!Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new Error("Count must be an integer");
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
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

function decimalScale(places: number): number {
  if (!Number.isInteger(places) || places < 0 || places > 8) {
    throw new Error("Decimal places must be from 0 to 8");
  }
  return 10 ** places;
}

/**
 * Dollars per mile as fixed text, half up.
 * Places 4 is the Week Report rate (2.9979). Null when miles are zero or the rate is zero.
 */
export function formatDollarsPerMile(cents: number, milesHundredths: number, places: number): string | null {
  if (!Number.isInteger(cents) || !Number.isInteger(milesHundredths) || milesHundredths < 0) {
    throw new Error("Rate per mile needs integer cents and miles");
  }
  if (milesHundredths === 0) return null;
  const scale = decimalScale(places);
  const scaled = Number(roundHalfUpDivide(BigInt(cents) * BigInt(scale), BigInt(milesHundredths)));
  if (scaled <= 0) return null;
  return fixedFromScaled(scaled, scale, places);
}

/**
 * A positive sheet number as fixed text, half up.
 * Places 2 is MPG. Places 4 is rate per mile. Null when the text is not a positive number.
 * `maxScaled` rejects a figure above that scaled integer (MPG stops at 100.00).
 */
export function formatPositiveDecimal(raw: string, places: number, maxScaled?: number): string | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const scale = decimalScale(places);
  const [whole = "0", frac = ""] = cleaned.split(".");
  const digits = (frac + "0".repeat(places + 1)).slice(0, places + 1);
  const head = digits.slice(0, places);
  let scaled = Number.parseInt(whole, 10) * scale + (head ? Number.parseInt(head, 10) : 0);
  if ((digits[places] ?? "0") >= "5") scaled += 1;
  if (scaled <= 0) return null;
  if (maxScaled != null && scaled > maxScaled) return null;
  return fixedFromScaled(scaled, scale, places);
}

function fixedFromScaled(scaled: number, scale: number, places: number): string {
  const whole = Math.floor(scaled / scale);
  if (places === 0) return String(whole);
  const frac = String(scaled % scale).padStart(places, "0");
  return `${whole}.${frac}`;
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
