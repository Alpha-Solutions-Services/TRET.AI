import { describe, expect, it } from "vitest";
import { linkFuelDate, linkTollTime } from "./link";

describe("fuel and toll linking", () => {
  it("sends a handoff-day fill to the new load", () => {
    const linked = linkFuelDate("2026-10-07", [
      { loadId: "TBH--1", tripId: "", pickupDate: "2026-10-05", deliveryDate: "2026-10-07" },
      { loadId: "TBH--2", tripId: "M-2", pickupDate: "2026-10-07", deliveryDate: "2026-10-09" },
    ]);
    expect(linked).toEqual({ ok: true, loadId: "", tripId: "M-2", unclear: false, unlinked: false });
  });

  it("leaves two overlapping loads unlinked", () => {
    const linked = linkFuelDate("2026-10-07", [
      { loadId: "TBH--1", tripId: "", pickupDate: "2026-10-05", deliveryDate: "2026-10-08" },
      { loadId: "TBH--2", tripId: "", pickupDate: "2026-10-06", deliveryDate: "2026-10-09" },
    ]);
    expect(linked.ok).toBe(false);
  });

  it("allows a toll credit to be linked and sends empty miles to the next load", () => {
    const linked = linkTollTime("2026-10-07T11:00:00", [
      { loadId: "TBH--1", tripId: "", pickupDate: "2026-10-01", deliveryDate: "2026-10-04" },
      { loadId: "TBH--2", tripId: "M-9", pickupDate: "2026-10-08", deliveryDate: "2026-10-10", primary: true },
      { loadId: "TBH--3", tripId: "M-9", pickupDate: "2026-10-08", deliveryDate: "2026-10-10", primary: false },
    ]);
    expect(linked).toEqual({ ok: true, loadId: "TBH--2", how: "next" });
  });
});
