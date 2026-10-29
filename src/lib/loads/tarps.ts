import { canonicalLoadId } from "@/lib/loads/load-id";
import { sheetAmountToCents } from "@/lib/sheets/cell";

/** $50. Used when import settings have no tarp rate yet. */
export const DEFAULT_TARP_CENTS = 5_000;

export const TARP_SETTING_KEY = "tarp_cents_per_load";

/**
 * Owner-confirmed tarped loads for the week of 2026-10-12.
 * Each one takes the configured tarps amount unless the sheet names a different amount.
 */
export const WEEK_42_TARPED_LOAD_IDS = [
  "TBH--1203",
  "TBH--1204",
  "TBH--1206",
  "TBH--1208",
  "TBH--1209",
  "TBH--1212",
  "TBH--1214",
  "TBH--1216",
  "TBH--1218",
  "TBH--1225",
] as const;

export function defaultTarpByLoadId(rateCents = DEFAULT_TARP_CENTS): Map<string, number> {
  return new Map(WEEK_42_TARPED_LOAD_IDS.map((id) => [id, rateCents]));
}

/**
 * Tarps amount for one load, in cents.
 * A sheet amount wins. Yes uses the rate. No is zero.
 * A blank cell uses the listed amount when this load is tarped.
 */
export function tarpCentsForLoad(input: {
  loadId: string;
  tarpRaw: string | null;
  rateCents: number;
  listedCents: number | null;
}): number {
  const raw = (input.tarpRaw ?? "").trim();
  if (raw) {
    if (/^(no|n|false)$/i.test(raw)) return 0;
    if (/^(yes|y|true|tarped)$/i.test(raw)) return input.listedCents ?? input.rateCents;
    const money = sheetAmountToCents(raw);
    if (money != null && money >= 0) return money;
  }
  const listed = input.listedCents;
  if (listed != null) return listed;
  const id = canonicalLoadId(input.loadId);
  if (id !== input.loadId && input.listedCents != null) return input.listedCents;
  return 0;
}

export function listedTarpCents(loadId: string, byLoadId: ReadonlyMap<string, number>): number | null {
  const id = canonicalLoadId(loadId);
  if (byLoadId.has(id)) return byLoadId.get(id) ?? null;
  if (byLoadId.has(loadId)) return byLoadId.get(loadId) ?? null;
  return null;
}
