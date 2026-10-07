import { describe, expect, it } from "vitest";
import { alignSheetAndVektor } from "./align";

describe("sheet and Vektor alignment", () => {
  it("lines loads up by number and names rate, date, and miles gaps", () => {
    const rows = alignSheetAndVektor({
      weekStart: "2026-10-05",
      sheet: [
        {
          unitNumber: "8",
          loadId: "TBH1179",
          deliveryDay: "2026-10-06",
          rateCents: 700_000,
          loadedMilesHundredths: 41_200,
          deadheadMilesHundredths: 1_500,
        },
        {
          unitNumber: "8",
          loadId: "TBH1184",
          deliveryDay: "2026-10-08",
          rateCents: 180_000,
          loadedMilesHundredths: 10_000,
          deadheadMilesHundredths: 0,
        },
      ],
      vektor: [
        {
          unitNumber: "08",
          loadId: "TBH1179",
          deliveryDay: "2026-10-07",
          rateCents: 650_000,
          loadedMilesHundredths: 40_000,
          deadheadMilesHundredths: 1_500,
        },
        {
          unitNumber: "8",
          loadId: "TBH9999",
          deliveryDay: "2026-10-09",
          rateCents: 100_000,
          loadedMilesHundredths: 2_000,
          deadheadMilesHundredths: null,
        },
      ],
    });
    expect(rows.map((row) => row.loadId)).toEqual(["TBH1179", "TBH1184", "TBH9999"]);
    expect(rows[0]?.highlights).toEqual(["rate", "date", "loaded_miles"]);
    expect(rows[0]?.notes.join(" ")).toContain("$7000.00");
    expect(rows[0]?.notes.join(" ")).toContain("2026-10-06");
    expect(rows[1]?.highlights).toEqual(["missing_vektor"]);
    expect(rows[2]?.highlights).toEqual(["missing_sheet"]);
    expect(rows[2]?.sheet).toBeNull();
  });
});
