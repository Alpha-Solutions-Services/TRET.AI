import { roundHalfUpDivide } from "@/lib/fee-engine/money";

/** New trucks: Legacy 10 percent, Tolson lease 8 percent. */
export const DEFAULT_LEGACY_FEE_BP = 1000;
export const DEFAULT_TOLSON_LEASE_FEE_BP = 800;

export type FeeRatePair = {
  legacyFeeBp: number;
  tolsonLeaseFeeBp: number;
};

export type FeeSplit = FeeRatePair & {
  legacyFeeCents: number;
  tolsonLeaseFeeCents: number;
  /** Legacy fee plus Tolson lease fee. */
  managementFeeCents: number;
};

export function unitDigits(unitNumber: string): string {
  return unitNumber.replace(/\D/g, "").replace(/^0+/, "") || unitNumber.trim();
}

/** 1, 2, …, 10. Text order would put 10 between 1 and 2. */
export function compareUnitNumbers(a: string, b: string): number {
  const left = Number(unitDigits(a));
  const right = Number(unitDigits(b));
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
  return a.localeCompare(b);
}

/** Trucks 1 and 2 are Legacy owned. Truck 3 is Tolson's. Trucks 4 to 8 and new trucks use the default. */
export function seededFeeRates(unitNumber: string): FeeRatePair {
  const unit = unitDigits(unitNumber);
  if (unit === "1" || unit === "2") return { legacyFeeBp: 0, tolsonLeaseFeeBp: 1000 };
  if (unit === "3") return { legacyFeeBp: 1000, tolsonLeaseFeeBp: 0 };
  return { legacyFeeBp: DEFAULT_LEGACY_FEE_BP, tolsonLeaseFeeBp: DEFAULT_TOLSON_LEASE_FEE_BP };
}

export function feeCentsFromGross(grossCents: number, rateBp: number): number {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error("Gross must be zero or more cents");
  }
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10000) {
    throw new Error("Fee percent must be from 0 to 100");
  }
  return Number(roundHalfUpDivide(BigInt(grossCents) * BigInt(rateBp), BigInt(10000)));
}

/** Both lines are a percent of the same weekly gross. The total is their sum. */
export function managementFeeSplit(grossCents: number, rates: FeeRatePair): FeeSplit {
  const legacyFeeCents = feeCentsFromGross(grossCents, rates.legacyFeeBp);
  const tolsonLeaseFeeCents = feeCentsFromGross(grossCents, rates.tolsonLeaseFeeBp);
  return {
    ...rates,
    legacyFeeCents,
    tolsonLeaseFeeCents,
    managementFeeCents: legacyFeeCents + tolsonLeaseFeeCents,
  };
}

/**
 * Split a sheet Management Fee cell into the two lines.
 * The parts add up to that cell. When the cell is the percent total, each part is that percent of gross.
 */
export function splitSheetManagementFee(sheetCents: number, rates: FeeRatePair): FeeSplit {
  if (!Number.isInteger(sheetCents) || sheetCents < 0) {
    throw new Error("Management fee must be zero or more cents");
  }
  const weight = rates.legacyFeeBp + rates.tolsonLeaseFeeBp;
  if (sheetCents === 0 || weight === 0) {
    return { ...rates, legacyFeeCents: 0, tolsonLeaseFeeCents: 0, managementFeeCents: 0 };
  }
  if (rates.tolsonLeaseFeeBp === 0) {
    return { ...rates, legacyFeeCents: sheetCents, tolsonLeaseFeeCents: 0, managementFeeCents: sheetCents };
  }
  if (rates.legacyFeeBp === 0) {
    return { ...rates, legacyFeeCents: 0, tolsonLeaseFeeCents: sheetCents, managementFeeCents: sheetCents };
  }
  const legacyFeeCents = Number(
    roundHalfUpDivide(BigInt(sheetCents) * BigInt(rates.legacyFeeBp), BigInt(weight)),
  );
  const tolsonLeaseFeeCents = sheetCents - legacyFeeCents;
  return { ...rates, legacyFeeCents, tolsonLeaseFeeCents, managementFeeCents: sheetCents };
}
