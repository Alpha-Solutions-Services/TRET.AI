import { describe, expect, it } from "vitest";
import {
  calculateFeeLines,
  findContractForDate,
  weekBoundsForDate,
  type FeeContractRecord,
  type FeeRuleInput,
} from "./index";

const FULL_GROSS = 10000; // 100% of gross in basis points

describe("calculateFeeLines — third-party sample week", () => {
  it("computes driver, management, factoring, Tolson, and Legacy on $5,800.00", () => {
    // Hand-calc: gross 580000¢
    // DRIVER_PAY 20% of 100% = 580000×2000/10000 = 116000¢ ($1,160.00)
    // MANAGEMENT_FEE 15% = 87000¢ ($870.00)
    // FACTORING_FEE 2.65% = 580000×265/10000 = 15370¢ ($153.70)
    // TOLSON_PAYABLE 10% = 58000¢ ($580.00)
    // LEGACY_RETAINED 5% = 29000¢ ($290.00)
    const rules: FeeRuleInput[] = [
      { kind: "DRIVER_PAY", rateBp: 2000, basePctBp: FULL_GROSS },
      { kind: "MANAGEMENT_FEE", rateBp: 1500, basePctBp: FULL_GROSS },
      { kind: "FACTORING_FEE", rateBp: 265, basePctBp: FULL_GROSS },
      { kind: "TOLSON_PAYABLE", rateBp: 1000, basePctBp: FULL_GROSS },
      { kind: "LEGACY_RETAINED", rateBp: 500, basePctBp: FULL_GROSS },
    ];

    const lines = calculateFeeLines({
      grossCents: 580_000,
      truckClass: "third_party",
      rules,
    });

    const byKind = Object.fromEntries(lines.map((l) => [l.kind, l.amountCents]));
    expect(byKind.DRIVER_PAY).toBe(116_000);
    expect(byKind.MANAGEMENT_FEE).toBe(87_000);
    expect(byKind.FACTORING_FEE).toBe(15_370);
    expect(byKind.TOLSON_PAYABLE).toBe(58_000);
    expect(byKind.LEGACY_RETAINED).toBe(29_000);
  });
});

describe("calculateFeeLines — legacy-owned", () => {
  it("computes Tolson payable and has no management line on $5,800.00", () => {
    // Hand-calc: TOLSON_PAYABLE 10% of 580000¢ = 58000¢ ($580.00); no MANAGEMENT_FEE
    const lines = calculateFeeLines({
      grossCents: 580_000,
      truckClass: "legacy_owned",
      rules: [
        { kind: "TOLSON_PAYABLE", rateBp: 1000, basePctBp: FULL_GROSS },
        { kind: "DRIVER_PAY", rateBp: 2000, basePctBp: FULL_GROSS },
      ],
    });

    expect(lines.find((l) => l.kind === "MANAGEMENT_FEE")).toBeUndefined();
    expect(lines.find((l) => l.kind === "TOLSON_PAYABLE")?.amountCents).toBe(58_000);
  });
});

describe("calculateFeeLines — dispatch fee bases", () => {
  const gross = 580_000;

  it("5% on full gross = $290.00", () => {
    // Hand-calc: 580000×500/10000 = 29000¢ ($290.00)
    const [line] = calculateFeeLines({
      grossCents: gross,
      truckClass: "legacy_owned",
      rules: [{ kind: "DISPATCH_FEE", rateBp: 500, basePctBp: FULL_GROSS }],
    });
    expect(line!.amountCents).toBe(29_000);
  });

  it("5.5% on full gross = $319.00", () => {
    // Hand-calc: 580000×550/10000 = 31900¢ ($319.00)
    const [line] = calculateFeeLines({
      grossCents: gross,
      truckClass: "legacy_owned",
      rules: [{ kind: "DISPATCH_FEE", rateBp: 550, basePctBp: FULL_GROSS }],
    });
    expect(line!.amountCents).toBe(31_900);
  });

  it("5.5% on a 95% base = $303.05", () => {
    // Hand-calc: 580000×9500×550/100000000 = 30305¢ ($303.05)
    // Which base is correct for dispatch is OPEN; this proves the engine follows the rule.
    const [line] = calculateFeeLines({
      grossCents: gross,
      truckClass: "legacy_owned",
      rules: [{ kind: "DISPATCH_FEE", rateBp: 550, basePctBp: 9500 }],
    });
    expect(line!.amountCents).toBe(30_305);
  });
});

describe("rounding half up", () => {
  it("$1,700 × 2.65% = $45.05", () => {
    // Hand-calc: 170000×265/10000 = 4505¢ ($45.05)
    const [line] = calculateFeeLines({
      grossCents: 170_000,
      truckClass: "legacy_owned",
      rules: [{ kind: "FACTORING_FEE", rateBp: 265, basePctBp: FULL_GROSS }],
    });
    expect(line!.amountCents).toBe(4_505);
  });

  it("$900 × 5.5% = $49.50", () => {
    // Hand-calc: 90000×550/10000 = 4950¢ ($49.50)
    const [line] = calculateFeeLines({
      grossCents: 90_000,
      truckClass: "legacy_owned",
      rules: [{ kind: "DISPATCH_FEE", rateBp: 550, basePctBp: FULL_GROSS }],
    });
    expect(line!.amountCents).toBe(4_950);
  });

  it("$950 × 5.5% = $52.25", () => {
    // Hand-calc: 95000×550/10000 = 5225¢ ($52.25)
    const [line] = calculateFeeLines({
      grossCents: 95_000,
      truckClass: "legacy_owned",
      rules: [{ kind: "DISPATCH_FEE", rateBp: 550, basePctBp: FULL_GROSS }],
    });
    expect(line!.amountCents).toBe(5_225);
  });

  it("$10.50 × 5% = 52.5¢ → $0.53 (half up)", () => {
    // Hand-calc: 1050×500/10000 = 52.5 → round half up = 53¢ ($0.53)
    const [line] = calculateFeeLines({
      grossCents: 1_050,
      truckClass: "legacy_owned",
      rules: [{ kind: "DISPATCH_FEE", rateBp: 500, basePctBp: FULL_GROSS }],
    });
    expect(line!.amountCents).toBe(53);
  });

  it("$1,001.00 × 2.65% = 26.5265 → $26.53", () => {
    // Hand-calc: 100100×265/10000 = 2652.65 → round half up = 2653¢ ($26.53)
    const [line] = calculateFeeLines({
      grossCents: 100_100,
      truckClass: "legacy_owned",
      rules: [{ kind: "FACTORING_FEE", rateBp: 265, basePctBp: FULL_GROSS }],
    });
    expect(line!.amountCents).toBe(2_653);
  });
});

describe("findContractForDate", () => {
  const base: FeeContractRecord[] = [
    {
      id: "c1",
      truckId: "t1",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-06-30",
    },
    {
      id: "c2",
      truckId: "t1",
      effectiveFrom: "2026-07-01",
      effectiveTo: null,
    },
  ];

  it("matches inclusive start and end boundaries", () => {
    // Hand-calc: 2026-01-01 and 2026-06-30 are inside c1; 2026-07-01 is c2
    expect(findContractForDate(base, "2026-01-01").id).toBe("c1");
    expect(findContractForDate(base, "2026-06-30").id).toBe("c1");
    expect(findContractForDate(base, "2026-07-01").id).toBe("c2");
  });

  it("errors when no contract covers the date", () => {
    // Hand-calc: empty list → no cover for any date
    expect(() => findContractForDate([], "2026-03-15")).toThrow(/No fee contract/);
  });

  it("errors when overlapping contracts both cover the date in memory", () => {
    // Hand-calc: both ranges include 2026-06-15
    const overlapping: FeeContractRecord[] = [
      { id: "a", truckId: "t1", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" },
      { id: "b", truckId: "t1", effectiveFrom: "2026-06-01", effectiveTo: "2026-12-31" },
    ];
    expect(() => findContractForDate(overlapping, "2026-06-15")).toThrow(
      /More than one fee contract/,
    );
  });
});

describe("invalid inputs", () => {
  it("rejects float cents", () => {
    // Hand-calc: 100.5 is not an integer cent amount
    expect(() =>
      calculateFeeLines({
        grossCents: 100.5,
        truckClass: "legacy_owned",
        rules: [{ kind: "DISPATCH_FEE", rateBp: 500, basePctBp: FULL_GROSS }],
      }),
    ).toThrow(/integer/);
  });

  it("rejects negative rate", () => {
    // Hand-calc: rateBp -1 is outside 0..10000
    expect(() =>
      calculateFeeLines({
        grossCents: 100_000,
        truckClass: "legacy_owned",
        rules: [{ kind: "DISPATCH_FEE", rateBp: -1, basePctBp: FULL_GROSS }],
      }),
    ).toThrow(/rateBp/);
  });

  it("rejects Tolson + Legacy not equal to management", () => {
    // Hand-calc: 1000 + 400 = 1400 ≠ 1500 management
    expect(() =>
      calculateFeeLines({
        grossCents: 580_000,
        truckClass: "third_party",
        rules: [
          { kind: "MANAGEMENT_FEE", rateBp: 1500, basePctBp: FULL_GROSS },
          { kind: "TOLSON_PAYABLE", rateBp: 1000, basePctBp: FULL_GROSS },
          { kind: "LEGACY_RETAINED", rateBp: 400, basePctBp: FULL_GROSS },
        ],
      }),
    ).toThrow(/must equal MANAGEMENT_FEE/);
  });
});

describe("weekBoundsForDate", () => {
  it("week of 2026-09-21 is Mon 2026-09-21 through Sun 2026-09-27", () => {
    // Hand-calc: 2026-09-21 is Monday → start 2026-09-21, end 2026-09-27
    expect(weekBoundsForDate("2026-09-21")).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
  });

  it("Sunday 2026-09-27 stays in the same week", () => {
    // Hand-calc: Sunday maps back to Monday 2026-09-21 … 2026-09-27
    expect(weekBoundsForDate("2026-09-27")).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
  });

  it("Monday 2026-09-28 starts the next week", () => {
    // Hand-calc: next Monday → 2026-09-28 … 2026-10-04
    expect(weekBoundsForDate("2026-09-28")).toEqual({
      start: "2026-09-28",
      end: "2026-10-04",
    });
  });
});
