/** $50. Used only when a load entered in TRET is tarped and the saved rate is missing. */
export const DEFAULT_TARP_CENTS = 5_000;

export const TARP_SETTING_KEY = "tarp_cents_per_load";

/**
 * Tarps cents for one load.
 * A sheet Tarps cell wins, including a blank cell (not tarped).
 * The fee-settings rate is only for a TRET load marked tarped with no amount.
 */
export function resolveTarpCents(input: {
  sheetCents: number | null;
  storedCents: number | null;
  rateCents: number;
  storedTarped: boolean;
}): number {
  if (input.sheetCents != null) return input.sheetCents;
  if (input.storedCents != null && input.storedCents > 0) return input.storedCents;
  if (input.storedTarped) return input.rateCents >= 0 ? input.rateCents : DEFAULT_TARP_CENTS;
  return 0;
}
