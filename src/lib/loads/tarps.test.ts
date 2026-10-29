import { describe, expect, it } from "vitest";
import { DEFAULT_TARP_CENTS, WEEK_42_TARPED_LOAD_IDS, defaultTarpByLoadId, listedTarpCents, tarpCentsForLoad } from "./tarps";

describe("tarps", () => {
  it("charges $50 for each owner-confirmed week 42 tarped load", () => {
    const listed = defaultTarpByLoadId();
    expect(WEEK_42_TARPED_LOAD_IDS).toHaveLength(10);
    let total = 0;
    for (const id of WEEK_42_TARPED_LOAD_IDS) {
      const cents = tarpCentsForLoad({
        loadId: id,
        tarpRaw: null,
        rateCents: DEFAULT_TARP_CENTS,
        listedCents: listedTarpCents(id, listed),
      });
      expect(cents, id).toBe(5_000);
      total += cents;
    }
    expect(total).toBe(50_000);
  });

  it("uses a sheet amount, a yes, or a no before the default list", () => {
    const listed = defaultTarpByLoadId(7_500);
    expect(
      tarpCentsForLoad({
        loadId: "TBH--1203",
        tarpRaw: "$80.00",
        rateCents: 7_500,
        listedCents: listedTarpCents("TBH--1203", listed),
      }),
    ).toBe(8_000);
    expect(
      tarpCentsForLoad({
        loadId: "TBH--1",
        tarpRaw: "Yes",
        rateCents: 7_500,
        listedCents: listedTarpCents("TBH--1", listed),
      }),
    ).toBe(7_500);
    expect(
      tarpCentsForLoad({
        loadId: "TBH--1203",
        tarpRaw: "No",
        rateCents: 7_500,
        listedCents: listedTarpCents("TBH--1203", listed),
      }),
    ).toBe(0);
    expect(
      tarpCentsForLoad({
        loadId: "TBH--1",
        tarpRaw: null,
        rateCents: 5_000,
        listedCents: null,
      }),
    ).toBe(0);
  });
});
