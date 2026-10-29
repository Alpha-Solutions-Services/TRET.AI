import { describe, expect, it } from "vitest";
import { buildTruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { parseLoadLedger, tarpColumnIndex, TARP_COLUMN_BC, TARP_COLUMN_TRUCK_3 } from "@/lib/sheets/ledger";
import { applySheetWeek } from "@/lib/statements/sheet-week";
import { applyTarps, linesMatchNet, ownerDeductionCents, tarpLineCents } from "@/lib/statements/engine";
import { percentFeeStatement } from "@/lib/statements/engine";

describe("statement tarps", () => {
  it("moves sheet tarps out of driver pay onto their own line without changing the total", () => {
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      loadLedger: [
        ["Delivery Date", "Load ID", "Rate", "Tarps"],
        ["10/13/2026", "TBH--1206", "$1,750.00", "$50.00"],
        ["10/14/2026", "TBH--1209", "$1,200.00", ""],
      ],
      mgmtExpenses: null,
      weeklyExpenses: [["Week Start Date", "Driver Compensation"], ["10/12/2026", "$640.00"]],
      note: null,
    });
    expect(row.outsCents).toBe(64_000);
    expect(row.netCents).toBe(row.insCents - row.outsCents);
    const base = percentFeeStatement({
      unitNumber: "8",
      grossCents: row.insCents,
      weekStart: "2026-10-12",
    });
    const statement = applySheetWeek(base, row);
    expect(tarpLineCents(statement)).toBe(5_000);
    expect(statement.driverPayCents + tarpLineCents(statement)).toBe(64_000);
    expect(statement.netCents).toBe(statement.grossCents - ownerDeductionCents(statement));
    expect(linesMatchNet(statement)).toBe(true);
  });

  it("adds tarps when driver pay was computed from the rate", () => {
    const base = percentFeeStatement({
      unitNumber: "8",
      grossCents: 100_000,
      weekStart: "2026-10-12",
    });
    const before = base.netCents;
    const next = applyTarps(base, 5_000, false);
    expect(tarpLineCents(next)).toBe(5_000);
    expect(next.driverPayCents).toBe(base.driverPayCents);
    expect(next.netCents).toBe(before - 5_000);
    expect(linesMatchNet(next)).toBe(true);
  });
});

describe("tarps column", () => {
  it("reads column BC, and column BG on truck 3", () => {
    expect(tarpColumnIndex(["Delivery Date", "Load ID", "Rate"], "8")).toBe(TARP_COLUMN_BC);
    expect(tarpColumnIndex(["Delivery Date", "Load ID", "Rate"], "3")).toBe(TARP_COLUMN_TRUCK_3);
    const named = parseLoadLedger(
      [
        ["Delivery Date", "Load ID", "Rate", "Tarps"],
        ["10/13/2026", "TBH--1206", "$10.00", "$50.00"],
      ],
      { unitNumber: "8" },
    );
    expect(named.rows[0]?.tarpCents).toBe(5_000);
    const truck3 = Array.from({ length: TARP_COLUMN_TRUCK_3 + 1 }, () => "");
    truck3[0] = "Delivery Date";
    truck3[1] = "Load ID";
    truck3[2] = "Rate";
    const row = Array.from({ length: TARP_COLUMN_TRUCK_3 + 1 }, () => "");
    row[0] = "10/13/2026";
    row[1] = "TBH--1";
    row[2] = "$10.00";
    row[TARP_COLUMN_TRUCK_3] = "$50.00";
    const parsed = parseLoadLedger([truck3, row], { unitNumber: "3" });
    expect(parsed.rows[0]?.tarpCents).toBe(5_000);
  });
});
