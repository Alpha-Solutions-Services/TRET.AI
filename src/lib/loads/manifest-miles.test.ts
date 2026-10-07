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

  it("keeps a single manifest member as its own load", () => {
    const laid = layoutManifestGroups([{ loadId: "TBH--1186", manifestRef: "1186", rankHundredths: 40_000 }]);
    expect(laid[0]?.manifestRole).toBe("solo");
    expect(laid[0]?.manifestHeader).toBe(false);
  });
});
