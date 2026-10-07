import { describe, expect, it } from "vitest";
import { driverNamesEqual } from "./drivers";
import { canonicalLoadId, loadMatchKey } from "./load-id";
import { chooseExistingLoad, sameSourcePreviousCount } from "@/lib/vektor/dedupe";

describe("canonical load ids", () => {
  it("stores the Vektor double hyphen form and matches letters and digits", () => {
    expect(canonicalLoadId("TBH1192")).toBe("TBH--1192");
    expect(canonicalLoadId("TBH-1192")).toBe("TBH--1192");
    expect(canonicalLoadId("TBH--1192")).toBe("TBH--1192");
    expect(loadMatchKey("TBH--1192")).toBe(loadMatchKey("TBH1192"));
    expect(loadMatchKey("tbh--1192")).toBe("TBH1192");
  });

  it("updates the canonical hand entered row instead of inserting another", () => {
    const chosen = chooseExistingLoad(
      [
        { id: "sheet-form", loadId: "TBH1192", unitNumber: "8", manifestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", importRunId: "run-1" },
        { id: "hand", loadId: "TBH--1192", unitNumber: "08", manifestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", importRunId: null },
      ],
      { loadId: "TBH--1192", unitNumber: "8", manifestId: "cccccccc-cccc-cccc-cccc-cccccccccccc" },
    );
    expect(chosen?.id).toBe("hand");
  });

  it("does not let a small CSV run set the Vektor connection baseline", () => {
    expect(
      sameSourcePreviousCount(
        [
          { source: "csv", rowsFetched: 7 },
          { source: "mcp", rowsFetched: 40 },
        ],
        "mcp",
      ),
    ).toBe(40);
    expect(sameSourcePreviousCount([{ source: "csv", rowsFetched: 7 }], "mcp")).toBeNull();
  });
});

describe("driver names", () => {
  it("treats a short name and the full legal name as the same driver", () => {
    expect(driverNamesEqual("John Reed", "John Douglas Reed")).toBe(true);
    expect(driverNamesEqual("Jose", "Jose Rodriguez")).toBe(true);
    expect(driverNamesEqual("Andrew King", "Andrew Colin King")).toBe(true);
    expect(driverNamesEqual("John Reed", "John Smith")).toBe(false);
    expect(driverNamesEqual("", "Jose Rodriguez")).toBe(false);
  });
});
