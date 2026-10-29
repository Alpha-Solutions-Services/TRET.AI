import { describe, expect, it } from "vitest";
import { TBH_1201 } from "../../../fixtures/sheets/tbh-1201";
import { TONU_RATE_NOTE } from "@/lib/reports/owner-week";
import { buildTruckWeekInsOuts } from "@/lib/sheets/ins-outs";

describe("confirmed TONU rate", () => {
  it("counts TBH--1201 in the delivery week and does not add it again", () => {
    const confirmed = { [TBH_1201.loadId]: TBH_1201.rateCents };
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      weekStart: TBH_1201.weekStart,
      weekEnd: TBH_1201.weekEnd,
      loadLedger: [
        ["Delivery Date", "Pickup Date", "Load ID", "Rate", "Status", "Allocated Miles", "Toll"],
        ["10/13/2026", "", "TBH--1", "$1,000.00", "", "100", ""],
        [TBH_1201.deliverySheet, TBH_1201.pickupSheet, TBH_1201.loadId, "$2,000.00", "TONU", "10", "$50.00"],
      ],
      mgmtExpenses: null,
      weeklyExpenses: [["Week Start Date", "Fuel"], ["10/12/2026", "$0.00"]],
      note: null,
      confirmedCentsByLoadId: confirmed,
    });
    const tonu = row.weekLoads?.find((load) => load.loadId === TBH_1201.loadId);
    expect(tonu?.rateCents).toBe(TBH_1201.rateCents);
    expect(tonu?.reason).toBeNull();
    expect(tonu?.pickupDay).toBe(TBH_1201.pickupDay);
    expect(row.pending?.some((item) => item.reason === TONU_RATE_NOTE)).toBe(false);
    expect(row.insCents).toBe(125_000);
  });

  it("confirms only the loads in the confirmation map", () => {
    const confirmed = { [TBH_1201.loadId]: TBH_1201.rateCents, "TBH--1221": 25_000 };
    const row = buildTruckWeekInsOuts({
      unitNumber: "6",
      truckName: "Truck 6",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      loadLedger: [
        ["Delivery Date", "Pickup Date", "Load ID", "Rate", "Status"],
        ["10/14/2026", "", "TBH--1220", "$1,000.00", ""],
        ["10/15/2026", "", "TBH--1221", "$2,000.00", "TONU"],
        ["10/15/2026", "10/14/2026", "TBH--1217", "$150.00", "TONU"],
      ],
      mgmtExpenses: null,
      weeklyExpenses: [["Week Start Date", "Fuel"], ["10/12/2026", "$0.00"]],
      note: null,
      confirmedCentsByLoadId: confirmed,
    });
    const tonu = row.weekLoads?.find((load) => load.loadId === "TBH--1221");
    expect(tonu?.rateCents).toBe(25_000);
    expect(tonu?.reason).toBeNull();
    expect(row.pending?.some((item) => item.loadId === "TBH--1221")).toBe(false);
    expect(row.weekLoads?.find((load) => load.loadId === "TBH--1217")?.reason).toBe(TONU_RATE_NOTE);
    expect(row.insCents).toBe(125_000);
  });
});
