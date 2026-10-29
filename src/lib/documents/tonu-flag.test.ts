import { describe, expect, it } from "vitest";
import { TONU_RATE_NOTE } from "@/lib/reports/owner-week";
import { buildTruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { OWNER_CONFIRMED_TONU_CENTS, applyTonuConfirmations } from "./tonu-flag";

describe("confirmed TONU rate", () => {
  it("replaces the unconfirmed flag and the placeholder amount", () => {
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      weekStart: "2026-10-05",
      weekEnd: "2026-10-11",
      loadLedger: [
        ["Delivery Date", "Load ID", "Rate", "Status", "Allocated Miles", "Toll"],
        ["10/07/2026", "TBH--1", "$1,000.00", "", "100", ""],
        ["10/09/2026", "TBH--1201", "$2,000.00", "TONU", "10", "$12.00"],
      ],
      mgmtExpenses: null,
      weeklyExpenses: [["Week Start Date", "Fuel"], ["10/05/2026", "$0.00"]],
      note: null,
    });
    expect(row.pending?.some((item) => item.reason === TONU_RATE_NOTE)).toBe(true);
    const gross = row.insCents;
    const next = applyTonuConfirmations([row], { "TBH--1201": 25_000 })[0]!;
    const tonu = next.weekLoads?.find((load) => load.loadId === "TBH--1201");
    expect(tonu?.rateCents).toBe(25_000);
    expect(tonu?.reason).toBeNull();
    expect(next.pending?.some((item) => item.reason === TONU_RATE_NOTE)).toBe(false);
    expect(next.insCents).toBe(gross);
  });

  it("drops the unconfirmed flag on the owner-confirmed TONUs and keeps gross", () => {
    expect(OWNER_CONFIRMED_TONU_CENTS["TBH--1201"]).toBe(25_000);
    expect(OWNER_CONFIRMED_TONU_CENTS["TBH--1221"]).toBe(25_000);
    const row = buildTruckWeekInsOuts({
      unitNumber: "6",
      truckName: "Truck 6",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      loadLedger: [
        ["Delivery Date", "Load ID", "Rate", "Status"],
        ["10/14/2026", "TBH--1220", "$1,000.00", ""],
        ["10/15/2026", "TBH--1221", "$2,000.00", "TONU"],
      ],
      mgmtExpenses: null,
      weeklyExpenses: [["Week Start Date", "Fuel"], ["10/12/2026", "$0.00"]],
      note: null,
    });
    const gross = row.insCents;
    const next = applyTonuConfirmations([row], OWNER_CONFIRMED_TONU_CENTS)[0]!;
    const tonu = next.weekLoads?.find((load) => load.loadId === "TBH--1221");
    expect(tonu?.rateCents).toBe(25_000);
    expect(tonu?.reason).toBeNull();
    expect(next.pending?.some((item) => item.loadId === "TBH--1221")).toBe(false);
    expect(next.insCents).toBe(gross);
  });
});
