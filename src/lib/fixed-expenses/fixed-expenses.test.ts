import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMondayIsoDate, mondayDateError, weekBoundsForDate } from "@/lib/fee-engine";
import { centsToDollarString, dollarStringToCents } from "@/lib/money/cents";
import { FIXED_EXPENSE_KINDS } from "./kinds";
import { lookupWeeklyFixedExpense, type FixedExpenseOverride, type FixedExpenseVersion } from "./lookup";

const TRUCK = "truck-1";

function version(partial: Partial<FixedExpenseVersion> & Pick<FixedExpenseVersion, "id" | "effectiveFrom">): FixedExpenseVersion {
  return {
    truckId: TRUCK,
    kind: "ELD_FEE",
    weeklyAmountCents: 1500,
    chargedTo: "owner",
    effectiveTo: null,
    ...partial,
  };
}

describe("Monday rule", () => {
  it("accepts a Monday and rejects the other days of the sample week", () => {
    expect(isMondayIsoDate("2026-09-21")).toBe(true);
    expect(mondayDateError("2026-09-21")).toBeNull();
    expect(isMondayIsoDate("2026-09-22")).toBe(false);
    expect(isMondayIsoDate("2026-09-27")).toBe(false);
    expect(mondayDateError("2026-09-22")).toBe("Effective from must be a Monday.");
    expect(mondayDateError("2026-02-31")).toMatch(/not a valid calendar date/);
    expect(weekBoundsForDate("2026-09-23")).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
    expect(isMondayIsoDate(weekBoundsForDate("2026-09-23").start)).toBe(true);
  });
});

describe("cents", () => {
  it("parses dollar strings as integer cents without floating-point multiply", () => {
    // 10.10 * 100 is not exact in IEEE floats. The parser must still yield 1010.
    expect(dollarStringToCents("10.10")).toBe(1010);
    expect(dollarStringToCents("0.29")).toBe(29);
    expect(dollarStringToCents("1.15")).toBe(115);
    expect(dollarStringToCents("0")).toBe(0);
    expect(dollarStringToCents("0.01")).toBe(1);
    expect(dollarStringToCents("20")).toBe(2000);
    expect(dollarStringToCents(" 2.65 ")).toBe(265);
    expect(centsToDollarString(1010)).toBe("10.10");
    expect(centsToDollarString(5)).toBe("0.05");
    expect(centsToDollarString(2000)).toBe("20.00");
  });

  it("rejects fractions of a cent, negatives, and non-integers", () => {
    expect(() => dollarStringToCents("10.101")).toThrow(/2 decimal places/);
    expect(() => dollarStringToCents("-1.00")).toThrow(/2 decimal places/);
    expect(() => dollarStringToCents("1e2")).toThrow(/2 decimal places/);
    expect(() => dollarStringToCents("")).toThrow(/2 decimal places/);
    expect(() => centsToDollarString(10.5)).toThrow(/integer number of cents/);
    expect(() => centsToDollarString(-1)).toThrow(/integer number of cents/);
  });
});

describe("effective-date lookup", () => {
  const versions: FixedExpenseVersion[] = [
    version({
      id: "a",
      effectiveFrom: "2026-09-07",
      effectiveTo: "2026-09-20",
      weeklyAmountCents: 1500,
      chargedTo: "owner",
    }),
    version({
      id: "b",
      effectiveFrom: "2026-09-21",
      effectiveTo: null,
      weeklyAmountCents: 2000,
      chargedTo: "management",
    }),
  ];

  it("returns the version whose Monday range covers the week", () => {
    expect(
      lookupWeeklyFixedExpense({
        versions,
        overrides: [],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-14",
      }),
    ).toEqual({
      amountCents: 1500,
      chargedTo: "owner",
      source: "version",
      sourceId: "a",
    });

    expect(
      lookupWeeklyFixedExpense({
        versions,
        overrides: [],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-21",
      }).amountCents,
    ).toBe(2000);

    expect(
      lookupWeeklyFixedExpense({
        versions,
        overrides: [],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-28",
      }),
    ).toMatchObject({ amountCents: 2000, chargedTo: "management", source: "version" });
  });

  it("errors when nothing covers the week, the week is not a Monday, or ranges overlap", () => {
    expect(() =>
      lookupWeeklyFixedExpense({
        versions,
        overrides: [],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-08-31",
      }),
    ).toThrow(/No fixed expense covers week/);

    expect(() =>
      lookupWeeklyFixedExpense({
        versions,
        overrides: [],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-22",
      }),
    ).toThrow(/must be a Monday/);

    expect(() =>
      lookupWeeklyFixedExpense({
        versions: [
          version({ id: "x", effectiveFrom: "2026-09-07", effectiveTo: null }),
          version({ id: "y", effectiveFrom: "2026-09-21", effectiveTo: null, weeklyAmountCents: 1 }),
        ],
        overrides: [],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-21",
      }),
    ).toThrow(/More than one fixed expense/);
  });

  it("does not use another truck or another kind", () => {
    expect(() =>
      lookupWeeklyFixedExpense({
        versions,
        overrides: [],
        truckId: "other",
        kind: "ELD_FEE",
        weekStart: "2026-09-21",
      }),
    ).toThrow(/No fixed expense/);

    expect(() =>
      lookupWeeklyFixedExpense({
        versions,
        overrides: [],
        truckId: TRUCK,
        kind: "YARD_FEE",
        weekStart: "2026-09-21",
      }),
    ).toThrow(/No fixed expense/);
  });
});

describe("overrides", () => {
  const versions: FixedExpenseVersion[] = [
    version({
      id: "b",
      effectiveFrom: "2026-09-21",
      weeklyAmountCents: 2000,
      chargedTo: "management",
    }),
  ];

  const override: FixedExpenseOverride = {
    id: "o1",
    truckId: TRUCK,
    kind: "ELD_FEE",
    weekStart: "2026-09-21",
    amountCents: 500,
    chargedTo: "owner",
  };

  it("replaces the version amount and charged_to for that week only", () => {
    expect(
      lookupWeeklyFixedExpense({
        versions,
        overrides: [override],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-21",
      }),
    ).toEqual({
      amountCents: 500,
      chargedTo: "owner",
      source: "override",
      sourceId: "o1",
    });

    expect(
      lookupWeeklyFixedExpense({
        versions,
        overrides: [override],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-28",
      }),
    ).toMatchObject({ amountCents: 2000, source: "version" });
  });

  it("uses an override even when no version exists, and rejects a bad override amount", () => {
    expect(
      lookupWeeklyFixedExpense({
        versions: [],
        overrides: [override],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-21",
      }).source,
    ).toBe("override");

    expect(() =>
      lookupWeeklyFixedExpense({
        versions: [],
        overrides: [{ ...override, amountCents: -1 }],
        truckId: TRUCK,
        kind: "ELD_FEE",
        weekStart: "2026-09-21",
      }),
    ).toThrow(/zero or more cents/);
  });
});

describe("migration file", () => {
  const sql = readFileSync(
    resolve("supabase/migrations/20261007130000_fixed_expenses_monday_rule.sql"),
    "utf8",
  );

  it("lists every expense kind, charged_to default owner, and the Monday check on fee versions", () => {
    expect(FIXED_EXPENSE_KINDS).toHaveLength(10);
    for (const kind of FIXED_EXPENSE_KINDS) {
      expect(sql).toContain(`'${kind}'`);
    }
    expect(sql).toContain("assert_effective_monday");
    expect(sql).toContain("create or replace function public.create_fee_rate_version");
    expect(sql).toContain("truck_fixed_expenses");
    expect(sql).toContain("truck_fixed_expense_overrides");
    expect(sql).toContain("mgmt_operating_expenses");
    expect(sql).toContain("default 'owner'");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("change_log");
  });
});
