import { describe, expect, it } from "vitest";
import { buildTruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { outsFromWeeklyExpenses } from "@/lib/sheets/weekly-expenses";

const WEEK = { weekStart: "2026-10-05", weekEnd: "2026-10-11" };

/** Truck 8 weekly row. Listed lines match the asset report categories. */
const TRUCK_8 = [
  [
    "Week Start Date",
    "Driver Compensation",
    "Management Fee",
    "Dispatch Fee",
    "Factoring Fee",
    "Fuel",
    "Insurance",
    "Maintenance Escrow Weekly",
    "ELD Fee",
    "Yard Fee",
    "GPS Tracker",
    "Toll Fees",
    "Truck Pymts",
    "Moved to Management",
  ],
  [
    "10/05/2026",
    "$1,400.00",
    "$700.00",
    "$350.00",
    "$122.50",
    "$456.59",
    "$288.71",
    "$200.00",
    "$47.25",
    "$12.93",
    "$8.50",
    "$18.06",
    "$447.23",
    "$99.00",
  ],
];

describe("weekly expense parsing", () => {
  it("reads the same Weekly Expenses row the asset report uses", () => {
    const outs = outsFromWeeklyExpenses(TRUCK_8, WEEK.weekStart, WEEK.weekEnd);
    expect(outs.headerFound).toBe(true);
    expect(outs.rowFound).toBe(true);
    expect(outs.categories).toEqual([
      { category: "Driver compensation", cents: 140_000 },
      { category: "Management fee", cents: 70_000 },
      { category: "Truck payments", cents: 44_723 },
      { category: "Dispatch fee", cents: 35_000 },
      { category: "Factoring fee", cents: 12_250 },
      { category: "Fuel", cents: 45_659 },
      { category: "Insurance", cents: 28_871 },
      { category: "Maintenance Escrow Weekly", cents: 20_000 },
      { category: "ELD fee", cents: 4_725 },
      { category: "Yard fee", cents: 1_293 },
      { category: "GPS tracker", cents: 850 },
      { category: "Toll fees", cents: 1_806 },
    ]);
    expect(outs.outsCents).toBe(405_177);
    expect(outs.categories.some((row) => row.category === "Moved to Management")).toBe(false);
  });

  it("prefers Weekly Expenses over Mgmt Expenses for dashboard outs", () => {
    const built = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Brison Hunter",
      ...WEEK,
      loadLedger: [
        ["Delivery Date", "Load ID", "Rate"],
        ["10/06/2026", "TBH1179", "$7,000.00"],
      ],
      mgmtExpenses: [
        ["Date", "Category", "Amount"],
        ["10/05/2026", "Vektor Fee", "$30.00"],
      ],
      weeklyExpenses: TRUCK_8,
      note: null,
    });
    expect(built.outsFromWeekly).toBe(true);
    expect(built.insCents).toBe(700_000);
    expect(built.outsCents).toBe(405_177);
    expect(built.netCents).toBe(700_000 - 405_177);
    expect(built.categories.find((row) => row.category === "Fuel")?.cents).toBe(45_659);
    expect(built.categories.find((row) => row.category === "Vektor Fee")).toBeUndefined();
  });
});
