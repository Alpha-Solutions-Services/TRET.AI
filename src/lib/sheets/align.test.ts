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
    expect(rows.map((row) => row.loadId)).toEqual(["TBH--1179", "TBH--1184", "TBH--9999"]);
    expect(rows[0]?.highlights).toEqual(["rate", "date", "loaded_miles"]);
    expect(rows[0]?.notes.join(" ")).toContain("$7000.00");
    expect(rows[0]?.notes.join(" ")).toContain("2026-10-06");
    expect(rows[1]?.highlights).toEqual(["missing_vektor"]);
    expect(rows[2]?.highlights).toEqual(["missing_sheet"]);
    expect(rows[2]?.sheet).toBeNull();
  });

  it("matches TBH1192 to TBH--1192 and ignores blank deadhead versus zero", () => {
    const rows = alignSheetAndVektor({
      weekStart: "2026-10-05",
      sheet: [
        {
          unitNumber: "8",
          loadId: "TBH1192",
          deliveryDay: "2026-10-08",
          rateCents: 170_000,
          loadedMilesHundredths: 92_400,
          deadheadMilesHundredths: null,
          driverName: "Quinn",
        },
      ],
      vektor: [
        {
          unitNumber: "08",
          loadId: "TBH--1192",
          deliveryDay: "2026-10-08",
          rateCents: 170_000,
          loadedMilesHundredths: 92_400,
          deadheadMilesHundredths: 0,
          driverName: "Quinn Ellis Parker",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.loadId).toBe("TBH--1192");
    expect(rows[0]?.highlights).toEqual([]);
  });

  it("labels a shared manifest date and does not flag it", () => {
    const rows = alignSheetAndVektor({
      weekStart: "2026-10-05",
      sheet: [
        {
          unitNumber: "6",
          loadId: "TBH--1183",
          deliveryDay: "2026-10-06",
          pickupDay: "2026-10-06",
          rateCents: 80_000,
          loadedMilesHundredths: 72_600,
          deadheadMilesHundredths: 0,
        },
      ],
      vektor: [
        {
          unitNumber: "6",
          loadId: "TBH--1183",
          deliveryDay: "2026-10-07",
          pickupDay: "2026-10-05",
          rateCents: 80_000,
          loadedMilesHundredths: 72_600,
          deadheadMilesHundredths: 0,
          deliveryDateKind: "manifest",
          pickupDateKind: "manifest",
        },
      ],
    });
    expect(rows[0]?.highlights).toEqual([]);
    expect(rows[0]?.notes.join(" ")).toContain("manifest date");
  });

  it("groups two loads on one Vektor manifest and counts loaded miles once", () => {
    const rows = alignSheetAndVektor({
      weekStart: "2026-10-05",
      sheet: [
        {
          unitNumber: "8",
          loadId: "TBH1188",
          deliveryDay: "2026-10-08",
          rateCents: 180_000,
          loadedMilesHundredths: 116_500,
          deadheadMilesHundredths: 15_300,
        },
        {
          unitNumber: "8",
          loadId: "TBH1192",
          deliveryDay: "2026-10-08",
          rateCents: 170_000,
          loadedMilesHundredths: 92_400,
          deadheadMilesHundredths: 0,
        },
      ],
      vektor: [
        {
          unitNumber: "8",
          loadId: "TBH--1188",
          deliveryDay: "2026-10-08",
          rateCents: 180_000,
          loadedMilesHundredths: 116_500,
          deadheadMilesHundredths: 15_300,
          manifestRef: "1195",
        },
        {
          unitNumber: "8",
          loadId: "TBH--1192",
          deliveryDay: "2026-10-08",
          rateCents: 170_000,
          loadedMilesHundredths: 92_400,
          deadheadMilesHundredths: 0,
          manifestRef: "1195",
        },
      ],
    });
    expect(rows.map((row) => [row.loadId, row.manifestRole, row.manifestRef])).toEqual([
      ["TBH--1188", "primary", "1195"],
      ["TBH--1192", "partial", "1195"],
    ]);
    expect(rows[0]?.manifestHeader).toBe(true);
  });

  it("lets the sheet Primary flag choose the full load on trip M-1195", () => {
    const rows = alignSheetAndVektor({
      weekStart: "2026-10-05",
      sheet: [
        {
          unitNumber: "8",
          loadId: "TBH--1192",
          deliveryDay: "2026-10-08",
          rateCents: 170_000,
          loadedMilesHundredths: 92_400,
          deadheadMilesHundredths: 0,
          manifestRef: "M-1195",
          sheetPrimary: false,
        },
        {
          unitNumber: "8",
          loadId: "TBH--1188",
          deliveryDay: "2026-10-08",
          rateCents: 180_000,
          loadedMilesHundredths: 116_500,
          deadheadMilesHundredths: 15_300,
          manifestRef: "M-1195",
          sheetPrimary: true,
        },
        {
          unitNumber: "8",
          loadId: "TBH--1195",
          deliveryDay: "2026-10-08",
          rateCents: 90_000,
          loadedMilesHundredths: 38_400,
          deadheadMilesHundredths: 0,
          manifestRef: "M-1195",
          sheetPrimary: false,
        },
      ],
      vektor: [],
    });
    expect(rows.map((row) => [row.loadId, row.manifestRole, row.manifestRef])).toEqual([
      ["TBH--1188", "primary", "1195"],
      ["TBH--1192", "partial", "1195"],
      ["TBH--1195", "partial", "1195"],
    ]);
  });

  it("shows a status mismatch when the normalized load id matches", () => {
    const rows = alignSheetAndVektor({
      weekStart: "2026-10-05",
      sheet: [
        {
          unitNumber: "6",
          loadId: "TBH1191",
          deliveryDay: "2026-10-07",
          rateCents: 150_000,
          loadedMilesHundredths: 10_000,
          deadheadMilesHundredths: 0,
          status: "Delivered",
        },
        {
          unitNumber: "6",
          loadId: "TBH--1181",
          deliveryDay: "2026-10-07",
          rateCents: 120_000,
          loadedMilesHundredths: 8_000,
          deadheadMilesHundredths: 0,
          status: "Delivered",
        },
      ],
      vektor: [
        {
          unitNumber: "06",
          loadId: "TBH--1191",
          deliveryDay: "2026-10-07",
          rateCents: 150_000,
          loadedMilesHundredths: 10_000,
          deadheadMilesHundredths: 0,
          status: "In Transit",
        },
        {
          unitNumber: "6",
          loadId: "TBH1181",
          deliveryDay: "2026-10-07",
          rateCents: 120_000,
          loadedMilesHundredths: 8_000,
          deadheadMilesHundredths: 0,
          status: "In Transit",
        },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.highlights.includes("status"))).toBe(true);
    expect(rows.every((row) => row.highlights.includes("missing_vektor"))).toBe(false);
    expect(rows[0]?.notes.join(" ")).toContain("Status differs");
  });
});
