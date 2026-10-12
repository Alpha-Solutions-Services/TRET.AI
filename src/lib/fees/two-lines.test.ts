import { describe, expect, it } from "vitest";
import { feeCentsFromGross, managementFeeSplit, seededFeeRates, splitSheetManagementFee } from "./two-lines";

/** Week 41 gross in cents. T6 excludes week 42. T8 holds the TONU placeholder out. */
const WEEK_41_GROSS = [
  { unit: "1", gross: 0, legacy: 0, tolson: 0 },
  { unit: "2", gross: 0, legacy: 0, tolson: 0 },
  { unit: "3", gross: 855_000, legacy: 85_500, tolson: 0 },
  { unit: "4", gross: 250_000, legacy: 25_000, tolson: 20_000 },
  { unit: "5", gross: 720_000, legacy: 72_000, tolson: 57_600 },
  { unit: "6", gross: 200_000, legacy: 20_000, tolson: 16_000 },
  { unit: "7", gross: 470_000, legacy: 47_000, tolson: 37_600 },
  { unit: "8", gross: 790_000, legacy: 79_000, tolson: 63_200 },
  { unit: "9", gross: 0, legacy: 0, tolson: 0 },
  { unit: "10", gross: 0, legacy: 0, tolson: 0 },
] as const;

describe("week 41 fee lines", () => {
  it("uses the CEO percents of each truck's weekly gross", () => {
    for (const truck of WEEK_41_GROSS) {
      const rates = seededFeeRates(truck.unit);
      const split = managementFeeSplit(truck.gross, rates);
      expect(split.legacyFeeCents, truck.unit).toBe(truck.legacy);
      expect(split.tolsonLeaseFeeCents, truck.unit).toBe(truck.tolson);
      expect(split.managementFeeCents, truck.unit).toBe(truck.legacy + truck.tolson);
      expect(feeCentsFromGross(truck.gross, rates.legacyFeeBp), truck.unit).toBe(truck.legacy);
      expect(feeCentsFromGross(truck.gross, rates.tolsonLeaseFeeBp), truck.unit).toBe(truck.tolson);
    }
  });

  it("matches a sheet Management Fee cell that was updated to that total", () => {
    for (const truck of WEEK_41_GROSS) {
      const rates = seededFeeRates(truck.unit);
      const sheet = truck.legacy + truck.tolson;
      const split = splitSheetManagementFee(sheet, rates);
      expect(split.managementFeeCents, truck.unit).toBe(sheet);
      expect(split.legacyFeeCents, truck.unit).toBe(truck.legacy);
      expect(split.tolsonLeaseFeeCents, truck.unit).toBe(truck.tolson);
    }
  });

  it("gives a new truck Legacy 10 percent and Tolson lease 8 percent", () => {
    expect(seededFeeRates("11")).toEqual({ legacyFeeBp: 1000, tolsonLeaseFeeBp: 800 });
    expect(seededFeeRates("9")).toEqual({ legacyFeeBp: 1000, tolsonLeaseFeeBp: 800 });
    expect(seededFeeRates("1")).toEqual({ legacyFeeBp: 0, tolsonLeaseFeeBp: 1000 });
    expect(seededFeeRates("3")).toEqual({ legacyFeeBp: 1000, tolsonLeaseFeeBp: 0 });
  });
});
