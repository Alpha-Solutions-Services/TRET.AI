import { describe, expect, it } from "vitest";
import { countedLoadedHundredths, layoutManifestGroups } from "./manifest-miles";

describe("manifest loaded miles", () => {
  it("counts the full load once and marks the other as partial", () => {
    const laid = layoutManifestGroups([
      { loadId: "TBH--1179", manifestRef: "1179", rankHundredths: 59_600 },
      { loadId: "TBH--1184", manifestRef: null, rankHundredths: 31_400 },
      { loadId: "TBH--1192", manifestRef: "1195", rankHundredths: 92_400 },
      { loadId: "TBH--1188", manifestRef: "1195", rankHundredths: 116_500 },
    ]);
    expect(laid.map((row) => [row.loadId, row.manifestRole, row.manifestHeader])).toEqual([
      ["TBH--1179", "solo", false],
      ["TBH--1184", "solo", false],
      ["TBH--1188", "primary", true],
      ["TBH--1192", "partial", false],
    ]);
    const counted = laid.reduce(
      (sum, row) => sum + countedLoadedHundredths(row.manifestRole, row.rankHundredths),
      0,
    );
    expect(counted).toBe(59_600 + 31_400 + 116_500);
    expect(countedLoadedHundredths("partial", 92_400)).toBe(0);
  });

  it("uses the sheet Primary flag and treats trip M-1195 as manifest 1195", () => {
    const laid = layoutManifestGroups([
      { loadId: "TBH--1179", manifestRef: "M-1179", rankHundredths: 59_600, sheetPrimary: true },
      { loadId: "TBH--1184", manifestRef: "M-1184", rankHundredths: 31_400, sheetPrimary: true },
      { loadId: "TBH--1192", manifestRef: "M-1195", rankHundredths: 200_000, sheetPrimary: false },
      { loadId: "TBH--1188", manifestRef: "1195", rankHundredths: 116_500, sheetPrimary: true },
      { loadId: "TBH--1195", manifestRef: "M-1195", rankHundredths: 38_400, sheetPrimary: false },
    ]);
    expect(laid.map((row) => [row.loadId, row.manifestRole, row.manifestRef])).toEqual([
      ["TBH--1179", "solo", "1179"],
      ["TBH--1184", "solo", "1184"],
      ["TBH--1188", "primary", "1195"],
      ["TBH--1192", "partial", "1195"],
      ["TBH--1195", "partial", "1195"],
    ]);
    const counted = laid.reduce(
      (sum, row) => sum + countedLoadedHundredths(row.manifestRole, row.rankHundredths),
      0,
    );
    expect(counted).toBe(59_600 + 31_400 + 116_500);
  });

  it("keeps a single manifest member as its own load", () => {
    const laid = layoutManifestGroups([{ loadId: "TBH--1186", manifestRef: "1186", rankHundredths: 40_000 }]);
    expect(laid[0]?.manifestRole).toBe("solo");
    expect(laid[0]?.manifestHeader).toBe(false);
  });
});
