import type { FuelTollSettings } from "./types";

/**
 * Seed values for import_settings. OPEN until the owner confirms them.
 * Validators receive a FuelTollSettings object. They do not read these numbers
 * except as the fallback when a settings row is missing.
 */
export const FUEL_TOLL_SETTING_DEFAULTS: FuelTollSettings = {
  priceMinTenthCents: 1500,
  priceMaxTenthCents: 10000,
  dieselTankGallonsMilli: 300_000,
  defTankGallonsMilli: 50_000,
  mpgMinMilli: 2_000,
  mpgMaxMilli: 12_000,
  rowCountDropBlockPct: 50,
};

const KEYS = {
  priceMinTenthCents: "fuel_ppg_min_tenth_cents",
  priceMaxTenthCents: "fuel_ppg_max_tenth_cents",
  dieselTankGallonsMilli: "fuel_tank_gallons_milli",
  defTankGallonsMilli: "def_tank_gallons_milli",
  mpgMinMilli: "mpg_min_milli",
  mpgMaxMilli: "mpg_max_milli",
} as const;

export function fuelTollSettingsFromRows(
  rows: Array<{ key: string; value_int: number | null }>,
  kind: "fuel" | "toll",
): FuelTollSettings {
  const map = new Map(rows.map((row) => [row.key, row.value_int]));
  const pick = (key: string, fallback: number) => {
    const value = map.get(key);
    return value == null ? fallback : value;
  };
  const dropKey =
    kind === "fuel" ? "fuel_row_count_drop_block_pct" : "toll_row_count_drop_block_pct";
  return {
    priceMinTenthCents: pick(KEYS.priceMinTenthCents, FUEL_TOLL_SETTING_DEFAULTS.priceMinTenthCents),
    priceMaxTenthCents: pick(KEYS.priceMaxTenthCents, FUEL_TOLL_SETTING_DEFAULTS.priceMaxTenthCents),
    dieselTankGallonsMilli: pick(
      KEYS.dieselTankGallonsMilli,
      FUEL_TOLL_SETTING_DEFAULTS.dieselTankGallonsMilli,
    ),
    defTankGallonsMilli: pick(
      KEYS.defTankGallonsMilli,
      FUEL_TOLL_SETTING_DEFAULTS.defTankGallonsMilli,
    ),
    mpgMinMilli: pick(KEYS.mpgMinMilli, FUEL_TOLL_SETTING_DEFAULTS.mpgMinMilli),
    mpgMaxMilli: pick(KEYS.mpgMaxMilli, FUEL_TOLL_SETTING_DEFAULTS.mpgMaxMilli),
    rowCountDropBlockPct: pick(dropKey, FUEL_TOLL_SETTING_DEFAULTS.rowCountDropBlockPct),
  };
}
