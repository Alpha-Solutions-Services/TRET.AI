import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInbox,
  canResolveIssue,
  countOpenIssues,
  filterInbox,
  type ImportIssueInput,
} from "@/lib/issues/inbox";
import { buildManagementPnl, type PnlOperatingExpense } from "@/lib/overview/pnl";
import { buildSheetWeekSnapshot, buildWeekSnapshot } from "@/lib/overview/snapshot";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { buildWeekStatements } from "@/lib/statements/engine";
import type { StatementBlocker, StatementContract, WeekStatementInput } from "@/lib/statements/types";

const WEEK = "2026-09-21";

type StatementFixture = {
  trucks: WeekStatementInput["trucks"];
  contracts: StatementContract[];
  loads: WeekStatementInput["loads"];
  fuel: WeekStatementInput["fuel"];
  tolls: WeekStatementInput["tolls"];
  fixedVersions: WeekStatementInput["fixedVersions"];
};

type OverviewFixture = {
  operatingExpenses: PnlOperatingExpense[];
  importIssues: ImportIssueInput[];
};

function readStatementFixture(): StatementFixture {
  return JSON.parse(
    readFileSync(resolve("fixtures/statements/week-2026-09-21.json"), "utf8"),
  ) as StatementFixture;
}

function readOverviewFixture(): OverviewFixture {
  return JSON.parse(readFileSync(resolve("fixtures/overview/week-2026-09-21.json"), "utf8")) as OverviewFixture;
}

function statementInput(fixture: StatementFixture): WeekStatementInput {
  return {
    weekStart: WEEK,
    trucks: fixture.trucks,
    contracts: fixture.contracts,
    loads: fixture.loads,
    fuel: fixture.fuel,
    tolls: fixture.tolls,
    fixedVersions: fixture.fixedVersions,
    fixedOverrides: [],
    importRuns: [],
    rowCountDropPct: { loads: 50, fuel: 50, tolls: 50 },
  };
}

describe("overview snapshot for 2026-09-21", () => {
  const result = buildWeekStatements(statementInput(readStatementFixture()));
  const snapshot = buildWeekSnapshot(result.units);

  it("lists gross, fees, fuel, tolls, owner fixed, and net in integer cents", () => {
    // Unit 02 fees = driver 64000 + Tolson 32000 + dispatch 17600 + factoring 8480 = 122080.
    // 320000 - 122080 - 50000 - 1234 - 12000 = 134686.
    // Unit 03 fees = driver 116000 + management 87000 + dispatch 29000 + factoring 15370 = 247370.
    // 580000 - 247370 - 25000 - 500 - 1500 = 305630.
    const owned = snapshot.units.find((row) => row.unitNumber === "02");
    const managed = snapshot.units.find((row) => row.unitNumber === "03");
    expect(owned).toMatchObject({
      grossCents: 320_000,
      feesCents: 122_080,
      fuelCents: 50_000,
      tollsCents: 1_234,
      fixedCents: 12_000,
      netCents: 134_686,
    });
    expect(managed).toMatchObject({
      grossCents: 580_000,
      feesCents: 247_370,
      fuelCents: 25_000,
      tollsCents: 500,
      fixedCents: 1_500,
      netCents: 305_630,
    });
    expect(snapshot.fleet).toMatchObject({
      unitNumber: "Fleet",
      grossCents: 900_000,
      feesCents: 369_450,
      fuelCents: 75_000,
      tollsCents: 1_734,
      fixedCents: 13_500,
      netCents: 440_316,
    });
    for (const row of [...snapshot.units, snapshot.fleet]) {
      expect(row.grossCents - row.feesCents - row.fuelCents - row.tollsCents - row.fixedCents).toBe(
        row.netCents,
      );
      expect(Number.isInteger(row.netCents)).toBe(true);
    }
  });

  it("rejects a float gross", () => {
    const units = result.units.map((unit) => ({ ...unit }));
    units[0]!.grossCents = 320_000.5;
    expect(() => buildWeekSnapshot(units)).toThrow(/integer/);
  });
});

describe("sheet week snapshot", () => {
  it("uses sheet ins and outs so the fleet row is not zero", () => {
    const row = (unitNumber: string, insCents: number, categories: Array<{ category: string; cents: number }>): TruckWeekInsOuts => {
      const outsCents = categories.reduce((sum, category) => sum + category.cents, 0);
      return {
        unitNumber,
        truckName: unitNumber,
        truckClass: "third_party",
        insCents,
        outsCents,
        netCents: insCents - outsCents,
        loadCount: 1,
        categories,
        outsFromWeekly: true,
        note: null,
        noteDetail: null,
        readable: true,
        ledgerLoads: [],
        recentWeeks: [],
      };
    };
    const snapshot = buildSheetWeekSnapshot([
      row("8", 700_000, [
        { category: "Driver compensation", cents: 140_000 },
        { category: "Management fee", cents: 70_000 },
        { category: "Fuel", cents: 45_659 },
        { category: "Toll fees", cents: 1_806 },
        { category: "Insurance", cents: 28_871 },
      ]),
      row("3", 2_595_000, [
        { category: "Driver compensation", cents: 400_000 },
        { category: "Fuel", cents: 200_000 },
        { category: "Toll pass", cents: 10_000 },
        { category: "Truck payments", cents: 1_099_590 },
      ]),
    ]);
    expect(snapshot.fleet.grossCents).toBe(3_295_000);
    expect(snapshot.fleet.feesCents).toBe(610_000);
    expect(snapshot.fleet.fuelCents).toBe(245_659);
    expect(snapshot.fleet.tollsCents).toBe(11_806);
    expect(snapshot.fleet.fixedCents).toBe(1_128_461);
    expect(snapshot.fleet.netCents).toBe(1_299_074);
    expect(snapshot.fleet.grossCents - snapshot.fleet.feesCents - snapshot.fleet.fuelCents - snapshot.fleet.tollsCents - snapshot.fleet.fixedCents).toBe(
      snapshot.fleet.netCents,
    );
  });
});

describe("management P&L for 2026-09-21", () => {
  const statements = buildWeekStatements(statementInput(readStatementFixture()));
  const overview = readOverviewFixture();

  it("keeps Legacy retained on managed trucks and expenses in the week", () => {
    // Retained is unit 03 only: 5% of 580000 = 29000. Unit 02 retained is 0.
    // Dispatch Legacy keeps: 17600 + 29000 = 46600. Income = 75600.
    // Yard fee charged to management = 500.
    // Operating expenses on 21 Sep (10000) and 27 Sep (2500) count. 20 Sep and 28 Sep do not.
    // Expenses = 13000. Net = 62600. Tolson 90000 is not in that net.
    const pnl = buildManagementPnl({
      weekStart: WEEK,
      units: statements.units,
      operatingExpenses: overview.operatingExpenses,
    });
    expect(pnl).toMatchObject({
      weekStart: WEEK,
      weekEnd: "2026-09-27",
      legacyRetainedCents: 29_000,
      dispatchFeeCents: 46_600,
      incomeCents: 75_600,
      fixedManagementCents: 500,
      operatingExpenseCents: 12_500,
      expenseCents: 13_000,
      netCents: 62_600,
      tolsonPayableCents: 90_000,
    });
    expect(pnl.netCents).toBe(pnl.incomeCents - pnl.expenseCents);
    expect(pnl.netCents).not.toBe(pnl.incomeCents - pnl.expenseCents - pnl.tolsonPayableCents);
  });

  it("does not count Legacy retained stored on an owned truck", () => {
    const units = statements.units.map((unit) => ({ ...unit }));
    const owned = units.find((unit) => unit.unitNumber === "02");
    expect(owned).toBeTruthy();
    owned!.legacyRetainedCents = 1_000;
    const pnl = buildManagementPnl({
      weekStart: WEEK,
      units,
      operatingExpenses: [],
    });
    expect(pnl.legacyRetainedCents).toBe(29_000);
  });

  it("rejects a float operating expense", () => {
    expect(() =>
      buildManagementPnl({
        weekStart: WEEK,
        units: statements.units,
        operatingExpenses: [{ expenseDate: WEEK, amountCents: 10.5 }],
      }),
    ).toThrow(/integer/);
  });
});

describe("issues inbox for 2026-09-21", () => {
  const overview = readOverviewFixture();
  const closeCheck: StatementBlocker = {
    rule: "unlinked_fuel",
    message: "Unit 04 has fuel and no delivered load this week.",
    ref: "04",
  };
  const rows = buildInbox({
    weekStart: WEEK,
    imports: overview.importIssues,
    blockers: [closeCheck],
  });

  it("lists overlapping Warn and Block import issues and the close check", () => {
    const open = filterInbox(rows, { severity: "all", status: "open" });
    expect(open.map((row) => row.rule)).toEqual([
      "unlinked_fuel",
      "row_count_drop",
      "vektor_auth",
      "truck_unmatched",
    ]);
    expect(open.find((row) => row.rule === "unlinked_fuel")).toMatchObject({
      source: "close",
      severity: "Block",
      status: "open",
      resolvable: false,
    });
    expect(open.find((row) => row.rule === "truck_unmatched")?.severity).toBe("Warn");
    expect(countOpenIssues(rows)).toBe(4);
  });

  it("filters by severity and status", () => {
    expect(filterInbox(rows, { severity: "Warn", status: "open" }).map((row) => row.rule)).toEqual([
      "truck_unmatched",
    ]);
    expect(filterInbox(rows, { severity: "Block", status: "resolved" })).toEqual([]);
    expect(filterInbox(rows, { severity: "all", status: "resolved" }).map((row) => row.rule)).toEqual([
      "already_resolved",
    ]);
    expect(rows.some((row) => row.rule === "note" || row.rule === "ignored_status" || row.rule === "prior_week")).toBe(
      false,
    );
  });

  it("allows resolve only for an open import issue", () => {
    const warn = rows.find((row) => row.rule === "truck_unmatched");
    const resolved = rows.find((row) => row.rule === "already_resolved");
    const close = rows.find((row) => row.source === "close");
    expect(warn && canResolveIssue(warn)).toBe(true);
    expect(resolved && canResolveIssue(resolved)).toBe(false);
    expect(close && canResolveIssue(close)).toBe(false);
  });
});
