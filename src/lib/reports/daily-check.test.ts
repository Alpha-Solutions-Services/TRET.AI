import { describe, expect, it } from "vitest";
import { summarizeDailyCheck } from "./daily-check";

describe("daily check", () => {
  it("counts new, changed, and cancelled loads, fuel, tolls, receipts, and truck mismatches", () => {
    const summary = summarizeDailyCheck({
      loads: [{ change: "new" }, { change: "new" }, { change: "changed" }, { change: "cancelled" }],
      fuel: [{ status: "added" }, { status: "duplicate" }, { status: "unlinked" }],
      tollsAdded: 4,
      receiptsFound: 2,
      truckMismatches: ["Truck 6 sheet says 06"],
    });
    expect(summary).toEqual({
      loadsNew: 2,
      loadsChanged: 1,
      loadsCancelled: 1,
      fuelAdded: 1,
      fuelDuplicates: 1,
      fuelUnlinked: 1,
      tollsAdded: 4,
      receiptsFound: 2,
      truckMismatches: ["Truck 6 sheet says 06"],
    });
  });
});
