import { describe, expect, it } from "vitest";
import { loadsInWeek } from "./week-membership";

const WEEK = { from: "2026-10-05", to: "2026-10-11" };

describe("week membership", () => {
  it("keeps in-transit loads, a delivery on Sunday, and earlier loads on the same trip", () => {
    const rows = loadsInWeek(
      [
        { loadId: "TBH--1199", pickupDay: "2026-10-09", deliveryDay: "2026-10-11", tripRef: "M-1199" },
        { loadId: "TBH--1200", pickupDay: "2026-10-08", deliveryDay: null, tripRef: "M-1200" },
        { loadId: "TBH--1178", pickupDay: "2026-09-30", deliveryDay: "2026-10-05", tripRef: "M-1178" },
        { loadId: "TBH--1170", pickupDay: "2026-09-28", deliveryDay: "2026-09-30", tripRef: "M-1178" },
        { loadId: "TBH--1201", pickupDay: "2026-10-09", deliveryDay: "2026-10-12", tripRef: "M-1201" },
        { loadId: "TBH--1202", pickupDay: "2026-10-10", deliveryDay: "2026-10-12", tripRef: "M-1189" },
        { loadId: "TBH--1189", pickupDay: "2026-10-06", deliveryDay: "2026-10-07", tripRef: "M-1189" },
        { loadId: "TBH--1196", pickupDay: "2026-10-12", deliveryDay: "2026-10-14", tripRef: null },
      ],
      WEEK.from,
      WEEK.to,
    );
    expect(rows.map((row) => row.loadId).sort()).toEqual([
      "TBH--1170",
      "TBH--1178",
      "TBH--1189",
      "TBH--1199",
      "TBH--1200",
      "TBH--1201",
      "TBH--1202",
    ]);
  });
});
