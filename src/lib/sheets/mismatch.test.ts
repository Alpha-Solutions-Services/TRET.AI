import { describe, expect, it } from "vitest";
import { compareSheetLoads, unitKey } from "./mismatch";
import { importIssueInWeek } from "@/lib/issues/inbox";

describe("sheet versus loads", () => {
  it("warns when a sheet load is missing or the rate differs", () => {
    expect(unitKey("03")).toBe(unitKey("3"));
    const mismatches = compareSheetLoads({
      weekStart: "2026-10-05",
      sheet: [
        { unitNumber: "3", loadId: "TBH1178", rateCents: 275_000 },
        { unitNumber: "03", loadId: "TBH1186", rateCents: 320_000 },
      ],
      vektor: [
        { unitNumber: "3", loadId: "TBH1186", rateCents: 300_000 },
      ],
    });
    expect(mismatches.map((row) => row.rule)).toEqual(["sheet_load_missing", "sheet_rate_diff"]);
    expect(mismatches[1]?.message).toContain("$3200.00");
    expect(mismatches[1]?.message).toContain("$3000.00");
    expect(
      importIssueInWeek(
        {
          id: "1",
          severity: "Warn",
          rule: "sheet_load_missing",
          message: mismatches[0]!.message,
          ref: mismatches[0]!.ref,
          status: "open",
          createdAt: "2026-10-07T00:00:00Z",
          rangeFrom: null,
          rangeTo: null,
        },
        "2026-10-05",
        "2026-10-11",
      ),
    ).toBe(true);
    expect(
      importIssueInWeek(
        {
          id: "1",
          severity: "Warn",
          rule: "sheet_load_missing",
          message: "x",
          ref: mismatches[0]!.ref,
          status: "open",
          createdAt: "2026-10-07T00:00:00Z",
          rangeFrom: null,
          rangeTo: null,
        },
        "2026-09-28",
        "2026-10-04",
      ),
    ).toBe(false);
  });
});
