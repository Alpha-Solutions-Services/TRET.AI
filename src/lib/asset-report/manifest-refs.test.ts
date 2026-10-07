import { describe, expect, it } from "vitest";
import { manifestRefsByLoad } from "./manifest-refs";

describe("manifest refs from loads", () => {
  it("keeps in-transit orders that have no delivery date", () => {
    const map = manifestRefsByLoad(
      [
        { load_id: "TBH--1188", source_manifest_ref: "1195", truck_unit_number: "08", delivery_date: null },
        { load_id: "TBH--1195", source_manifest_ref: "1195", truck_unit_number: "8", delivery_date: null },
        { load_id: "TBH--1192", source_manifest_ref: "1195", truck_unit_number: "8", delivery_date: "2026-10-08" },
        { load_id: "TBH1188", source_manifest_ref: null, truck_unit_number: "8", delivery_date: "2026-10-08" },
        { load_id: "TBH--1184", source_manifest_ref: "1184", truck_unit_number: "08", delivery_date: "2026-10-06" },
        { load_id: "TBH--1190", source_manifest_ref: "1191", truck_unit_number: "06", delivery_date: "2026-10-07" },
      ],
      "8",
    );
    expect(map).toEqual({
      TBH1188: "1195",
      TBH1195: "1195",
      TBH1192: "1195",
      TBH1184: "1184",
    });
  });
});
