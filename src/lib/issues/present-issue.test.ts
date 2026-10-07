import { describe, expect, it } from "vitest";
import { issueRuleLabel, presentIssue } from "./present-issue";

describe("presentIssue", () => {
  it("hides a Vektor proto dump behind a plain headline", () => {
    const raw =
      'Vektor rejected the manifest list. Filters are a JSON string. A nested object fails proto decode with unexpected token { at column 12. proto: syntax error (line 1:12): unexpected token {';
    const presented = presentIssue(raw, "import_error");
    expect(presented.headline).toBe("Vektor import failed. Date filters are wrong.");
    expect(presented.detail).toBe(raw.replace(/\s+/g, " "));
    expect(presented.headline).not.toContain("{");
    expect(presented.headline).not.toContain("\u2014");
  });

  it("says an empty close week in plain language", () => {
    const raw = "Week 2026-10-05 has no loads, fuel, tolls, or fixed expenses to close.";
    expect(presentIssue(raw).headline).toBe("This week has nothing to close yet.");
  });

  it("keeps a short plain message as the headline", () => {
    const raw = "Truck 03 has fuel that is not linked.";
    expect(presentIssue(raw, "unlinked_fuel")).toEqual({ headline: raw, detail: raw });
    expect(issueRuleLabel("unlinked_fuel")).toBe("Fuel not linked");
    expect(issueRuleLabel("import_error")).toBe("Import");
  });
});
