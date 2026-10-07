import { describe, expect, it } from "vitest";
import {
  canonicalLegacyCategory,
  currentMonthUtc,
  expenseTotalCents,
  monthBounds,
  parseMonth,
} from "./expenses";

describe("legacy company expenses", () => {
  it("accepts the sheet category names", () => {
    expect(canonicalLegacyCategory("vektor fee")).toBe("Vektor Fee");
    expect(canonicalLegacyCategory("Spare Expense 5")).toBe("Spare Expense 5");
    expect(canonicalLegacyCategory("Office rent")).toBeNull();
  });

  it("bounds a month and totals cents", () => {
    expect(parseMonth("2026-10")).toBe("2026-10");
    expect(parseMonth("2026-13")).toBeNull();
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
    expect(currentMonthUtc(new Date("2026-10-07T23:00:00Z"))).toBe("2026-10");
    expect(expenseTotalCents([{ amount_cents: 3000 }, { amount_cents: 250 }])).toBe(3250);
  });
});
