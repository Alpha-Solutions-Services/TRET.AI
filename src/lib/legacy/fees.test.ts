import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANAGEMENT_FEE_BP,
  buildLegacyEarnings,
  feeCentsFromRate,
  feeSourceLabel,
} from "./fees";

describe("feeCentsFromRate", () => {
  it("applies 10 percent with integer half-up rounding", () => {
    expect(DEFAULT_MANAGEMENT_FEE_BP).toBe(1000);
    expect(feeCentsFromRate(275_000, 1000)).toBe(27_500);
    expect(feeCentsFromRate(1, 5000)).toBe(1);
    expect(feeCentsFromRate(1, 1000)).toBe(0);
  });
});

describe("buildLegacyEarnings", () => {
  const trucks = [
    {
      unitNumber: "03",
      truckName: "Reed",
      readable: true,
      ledgerLoads: [
        { loadId: "TBH1178", rateCents: 275_000 },
        { loadId: "TBH1186", rateCents: 100 },
        { loadId: "blank", rateCents: null },
      ],
    },
    {
      unitNumber: "4",
      truckName: "Unread",
      readable: false,
      ledgerLoads: [{ loadId: "X", rateCents: 50_000 }],
    },
  ];

  it("uses the org default, then a truck week, then a saved load amount", () => {
    const earnings = buildLegacyEarnings({
      trucks,
      orgFeeBp: 1000,
      truckWeeks: [{ unitKey: "3", feeBp: 500 }],
      loadFees: [{ unitKey: "3", loadKey: "tbh1178", feeCents: 12_00, feeBp: null }],
    });

    expect(earnings.trucks).toHaveLength(1);
    expect(earnings.trucks[0]?.loads.map((row) => row.source)).toEqual(["saved_amount", "truck_week"]);
    expect(earnings.trucks[0]?.loads[0]?.feeCents).toBe(12_00);
    expect(earnings.trucks[0]?.loads[1]?.feeCents).toBe(5);
    expect(earnings.fleetFeeCents).toBe(12_05);
    expect(earnings.fleetInsCents).toBe(275_100);
    expect(feeSourceLabel("org")).toBe("Default");
  });

  it("keeps a saved percent when the rate changes", () => {
    const earnings = buildLegacyEarnings({
      trucks: [
        {
          unitNumber: "3",
          truckName: "Reed",
          readable: true,
          ledgerLoads: [{ loadId: "TBH1178", rateCents: 200_000 }],
        },
      ],
      orgFeeBp: 1000,
      truckWeeks: [],
      loadFees: [{ unitKey: "3", loadKey: "tbh1178", feeCents: null, feeBp: 2500 }],
    });
    expect(earnings.trucks[0]?.loads[0]).toMatchObject({
      source: "saved_percent",
      feeCents: 50_000,
      feeBp: 2500,
    });
  });
});
