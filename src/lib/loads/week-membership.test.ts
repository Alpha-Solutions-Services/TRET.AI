import { describe, expect, it } from "vitest";
import { loadsInWeek, pendingLoads } from "./week-membership";

const WEEK_41 = { from: "2026-10-05", to: "2026-10-11" };
const WEEK_40 = { from: "2026-09-28", to: "2026-10-04" };
const WEEK_42 = { from: "2026-10-12", to: "2026-10-18" };

const ROWS = [
  { loadId: "TBH--1199", pickupDay: "2026-10-09", deliveryDay: "2026-10-11", tripRef: "M-1199" },
  { loadId: "TBH--1200", pickupDay: "2026-10-08", deliveryDay: null, tripRef: "M-1200" },
  { loadId: "TBH--1178", pickupDay: "2026-09-30", deliveryDay: "2026-10-05", tripRef: "M-1178" },
  { loadId: "TBH--1170", pickupDay: "2026-09-28", deliveryDay: "2026-10-04", tripRef: "M-1178" },
  { loadId: "TBH--1201", pickupDay: "2026-10-09", deliveryDay: "2026-10-12", tripRef: "M-1201" },
  { loadId: "TBH--1202", pickupDay: "2026-10-10", deliveryDay: "2026-10-12", tripRef: "M-1189" },
  { loadId: "TBH--1189", pickupDay: "2026-10-06", deliveryDay: "2026-10-07", tripRef: "M-1189" },
  { loadId: "TBH--1196", pickupDay: "2026-10-12", deliveryDay: "2026-10-14", tripRef: null },
];

describe("week membership", () => {
  it("counts a load only in the week it is delivered", () => {
    expect(loadsInWeek(ROWS, WEEK_41.from, WEEK_41.to).map((row) => row.loadId).sort()).toEqual([
      "TBH--1178",
      "TBH--1189",
      "TBH--1199",
    ]);
    expect(loadsInWeek(ROWS, WEEK_40.from, WEEK_40.to).map((row) => row.loadId)).toEqual(["TBH--1170"]);
    expect(loadsInWeek(ROWS, WEEK_42.from, WEEK_42.to).map((row) => row.loadId).sort()).toEqual([
      "TBH--1196",
      "TBH--1201",
      "TBH--1202",
    ]);
  });

  it("keeps a pickup from the prior week when delivery is in this week", () => {
    const ids = loadsInWeek(ROWS, WEEK_41.from, WEEK_41.to).map((row) => row.loadId);
    expect(ids).toContain("TBH--1178");
    expect(ids).not.toContain("TBH--1170");
  });

  it("shows in-transit loads as pending and does not count them", () => {
    expect(loadsInWeek(ROWS, WEEK_41.from, WEEK_41.to).some((row) => row.loadId === "TBH--1200")).toBe(false);
    expect(pendingLoads(ROWS, WEEK_41.to).map((row) => row.loadId)).toEqual(["TBH--1200"]);
  });
});
