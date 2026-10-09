import { describe, expect, it } from "vitest";
import { locateWeeklyExpenseCell, weeklyExpenseTab } from "./fixed-expense-cells";

describe("fixed expense sheet cells", () => {
  const grid = [
    ["Week Start Date", "Driver Compensation", "Insurance", "ELD Fee", "Dispatch Fee"],
    ["10/05/2026", "$1,580.00", "$288.71", "$47.25", "$395.00"],
  ];

  it("finds the insurance cell for the week", () => {
    expect(weeklyExpenseTab("3")).toBe("Truck #03 Weekly Expenses");
    expect(locateWeeklyExpenseCell(grid, "2026-10-05", "2026-10-11", ["insurance"])).toEqual({
      a1: "C2",
      header: "Insurance",
    });
  });
});
