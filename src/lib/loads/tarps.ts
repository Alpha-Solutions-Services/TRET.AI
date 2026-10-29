import { sheetAmountToCents } from "@/lib/sheets/cell";

/** $50. Used only when a load entered in TRET is tarped and has no amount yet. */
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
  if (input.storedTarped) return input.rateCents > 0 ? input.rateCents : DEFAULT_TARP_CENTS;
  return 0;
}

/** A Tarps cell is a dollar amount. Blank, zero, and non-amounts are not tarped. */
export function tarpDollarsToCents(raw: string | null | undefined): number {
  const cents = sheetAmountToCents(raw ?? "");
  return cents != null && cents > 0 ? cents : 0;
}
