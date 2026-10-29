import { describe, expect, it } from "vitest";
import { buildAssetReport } from "@/lib/asset-report/build";
import type { FeeRuleInput } from "@/lib/fee-engine";
import { formatStatementDollars } from "@/lib/reports/format";
import { prepareWeeklyReport } from "@/lib/reports/prepare";
import { buildOwnerTruckWeek } from "@/lib/reports/owner-week";
import type { WeeklyReportSource } from "@/lib/reports/types";
import { buildTruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { parseLoadLedger, tarpColumnIndex, TARP_COLUMN_BC, TARP_COLUMN_TRUCK_3 } from "@/lib/sheets/ledger";
import { buildWeekStatements, includeTarpInDriverPay, linesMatchNet, ownerDeductionCents, percentFeeStatement } from "@/lib/statements/engine";
import { applySheetWeek } from "@/lib/statements/sheet-week";
import type { FleetStatement, StatementContract, UnitStatement, WeekStatementInput } from "@/lib/statements/types";

const WEEK = { weekStart: "2026-10-12", weekEnd: "2026-10-18" };

function padded(headerLabel: string, column: number, amount: string): string[][] {
  const header = Array.from({ length: column + 1 }, () => "");
  header[0] = "Delivery Date";
  header[1] = "Load ID";
  header[2] = "Rate";
  header[column] = headerLabel;
  const row = Array.from({ length: column + 1 }, () => "");
  row[0] = "10/13/2026";
  row[1] = "TBH--1206";
  row[2] = "$1,000.00";
  row[column] = amount;
  return [header, row];
}

function sheetFixture(driver: string) {
  const ledger = padded("Tarps", TARP_COLUMN_BC, "$50.00");
  const weekly = [
    ["Week Start Date", "Driver Compensation", "Management Fee"],
    ["10/12/2026", driver, "$180.00"],
  ];
  return { ledger, weekly };
}

function ownerReport(unit: UnitStatement): ReturnType<typeof prepareWeeklyReport> {
  const fleet: FleetStatement = {
    grossCents: unit.grossCents,
    driverPayCents: unit.driverPayCents,
    managementFeeCents: unit.managementFeeCents,
    tolsonPayableCents: unit.tolsonPayableCents,
    legacyRetainedCents: unit.legacyRetainedCents,
    dispatchFeeCents: unit.dispatchFeeCents,
    factoringFeeCents: unit.factoringFeeCents,
    fuelCents: unit.fuelCents,
    tollsCents: unit.tollsCents,
    fixedOwnerCents: unit.fixedOwnerCents,
    fixedManagementCents: unit.fixedManagementCents,
    netCents: unit.netCents,
    loadCount: unit.loadCount,
    unitCount: 1,
  };
  const source: WeeklyReportSource = {
    weekStart: WEEK.weekStart,
    weekEnd: WEEK.weekEnd,
    locked: false,
    closedAt: null,
    units: [unit],
    fleet,
    trucks: [{ id: unit.truckId, name: `Truck ${unit.unitNumber}`, ownerName: null }],
    loads:
      unit.loadCount === 0
        ? []
        : [
            {
              truckId: unit.truckId,
              loadNumber: "TBH--1206",
              deliveryDate: "2026-10-13",
              brokerName: null,
              origin: null,
              destination: null,
              loadedMilesHundredths: unit.loadedMilesHundredths,
              deadheadMilesHundredths: unit.deadheadMilesHundredths,
              rateCents: unit.grossCents,
            },
          ],
    fuel: [],
    tolls: [],
  };
  return prepareWeeklyReport(source);
}

function weekInput(tarpCents: number, rules: FeeRuleInput[] | null): WeekStatementInput {
  const truckId = "00000000-0000-4000-8000-000000000008";
  const contracts: StatementContract[] = rules
    ? [
        {
          id: "c0000000-0000-4000-8000-000000000008",
          truckId,
          effectiveFrom: WEEK.weekStart,
          effectiveTo: null,
          rules,
        },
      ]
    : [];
  return {
    weekStart: WEEK.weekStart,
    trucks: [{ id: truckId, unitNumber: "8", truckClass: "third_party" }],
    contracts,
    loads: [
      {
        id: "load-1",
        truckId,
        unitNumber: "8",
        deliveryDate: "2026-10-13",
        storedWeekStart: WEEK.weekStart,
        grossCents: 100_000,
        loadedMilesHundredths: 0,
        deadheadMilesHundredths: 0,
        tarpCents,
      },
    ],
    fuel: [],
    tolls: [],
    fixedVersions: [],
    fixedOverrides: [],
    importRuns: [],
    rowCountDropPct: { loads: 50, fuel: 50, tolls: 50 },
  };
}

describe("statement tarps", () => {
  it("keeps sheet tarps inside driver pay on the owner week, the owner report, the statement, and the asset report", () => {
    const { ledger, weekly } = sheetFixture("$640.00");
    const owner = buildOwnerTruckWeek({
      ledger,
      weekly,
      weekReport: null,
      unitNumber: "8",
      ...WEEK,
    });
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      weekStart: WEEK.weekStart,
      weekEnd: WEEK.weekEnd,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly,
      note: null,
    });
    const statement = applySheetWeek(
      percentFeeStatement({ unitNumber: "8", grossCents: row.insCents, weekStart: WEEK.weekStart }),
      row,
    );
    const report = ownerReport(statement);
    const asset = buildAssetReport({
      ...WEEK,
      unitNumber: "8",
      ownerName: null,
      ledger,
      weekly,
      fuelLog: null,
      fleet: null,
      sheetNote: null,
    });
    const driver = 64_000;
    expect(owner.loads.find((load) => load.loadId === "TBH--1206")?.tarpCents).toBe(5_000);
    expect(owner.categories.find((item) => item.category === "Driver compensation")?.cents).toBe(driver);
    expect(owner.categories.find((item) => item.category === "Tarps")).toBeUndefined();
    expect(statement.driverPayCents).toBe(driver);
    expect(statement.lines.some((line) => line.lineCode === "TARPS")).toBe(false);
    expect(statement.lines.find((line) => line.lineCode === "DRIVER_PAY")?.amountCents).toBe(driver);
    expect(report.fleetRows.find((item) => item.label === "Driver pay")?.value).toBe(formatStatementDollars(driver));
    expect(report.fleetRows.find((item) => item.label === "Tarps")).toBeUndefined();
    expect(asset.leftExpenses.find((item) => item.label.startsWith("Driver"))?.cents).toBe(driver);
    expect(asset.leftExpenses.find((item) => item.label === "Tarps")).toBeUndefined();
    expect(statement.netCents).toBe(statement.grossCents - ownerDeductionCents(statement));
    expect(linesMatchNet(statement)).toBe(true);
    expect(owner.netCents).toBe(owner.grossCents - owner.expenseCents);
    expect(statement.netCents).toBe(owner.netCents);
    expect(asset.netCents).toBe(owner.netCents);
    expect(report.fleetRows.find((item) => item.label === "Net to owner")?.value).toBe(
      formatStatementDollars(owner.netCents),
    );
  });

  it("includes a computed tarp inside the driver pay line", () => {
    const rules: FeeRuleInput[] = [
      { kind: "DRIVER_PAY", rateBp: 2000, basePctBp: 10000 },
      { kind: "MANAGEMENT_FEE", rateBp: 0, basePctBp: 10000 },
    ];
    const statement = buildWeekStatements(weekInput(5_000, rules)).units[0]!;
    const bare = buildWeekStatements(weekInput(0, rules)).units[0]!;
    expect(statement.driverPayCents).toBe(25_000);
    expect(statement.lines.find((line) => line.lineCode === "DRIVER_PAY")?.amountCents).toBe(25_000);
    expect(statement.lines.find((line) => line.lineCode === "DRIVER_PAY")?.label).toBe("Driver pay (20% + tarps)");
    expect(statement.lines.some((line) => line.lineCode === "TARPS")).toBe(false);
    expect(statement.netCents).toBe(bare.netCents - 5_000);
    expect(linesMatchNet(statement)).toBe(true);
    const report = ownerReport(statement);
    expect(report.fleetRows.find((item) => item.label === "Driver pay")?.value).toBe("$250.00");
    expect(report.fleetRows.find((item) => item.label === "Tarps")).toBeUndefined();
    expect(report.fleetRows.find((item) => item.label === "Net to owner")?.value).toBe(
      formatStatementDollars(statement.netCents),
    );
  });

  it("shows a skipped tarp on the statement warnings when driver pay has no rate", () => {
    const week = buildWeekStatements(
      weekInput(5_000, [
        { kind: "DRIVER_PAY", rateBp: 2000, basePctBp: 10000 },
        { kind: "MANAGEMENT_FEE", rateBp: 0, basePctBp: 10000 },
      ]),
    );
    expect(week.warnings.some((row) => row.rule === "tarp_skipped")).toBe(false);
    const unit = week.units[0]!;
    const skipped = includeTarpInDriverPay(
      {
        ...unit,
        driverPayCents: 20_000,
        lines: unit.lines.map((line) =>
          line.lineCode === "DRIVER_PAY" ? { ...line, amountCents: 20_000, rateBp: null, label: "Driver pay" } : line,
        ),
      },
      5_000,
    );
    expect(skipped.warning).toEqual({
      rule: "tarp_skipped",
      message: "Truck 8: tarp skipped because driver pay has no rate.",
      ref: "8",
    });
    expect(skipped.unit.driverPayCents).toBe(20_000);
    expect(skipped.unit.netCents).toBe(unit.netCents);
  });

  it("charges no tarp when the percent-fee path has no driver pay line", () => {
    const statement = buildWeekStatements(weekInput(5_000, null)).units[0]!;
    const bare = buildWeekStatements(weekInput(0, null)).units[0]!;
    expect(statement.lines.some((line) => line.lineCode === "DRIVER_PAY")).toBe(false);
    expect(statement.lines.some((line) => line.lineCode === "TARPS")).toBe(false);
    expect(statement.driverPayCents).toBe(0);
    expect(statement.netCents).toBe(bare.netCents);
    expect(linesMatchNet(statement)).toBe(true);
    const report = ownerReport(statement);
    expect(report.fleetRows.find((item) => item.label === "Driver pay")?.value).toBe("$0.00");
    expect(report.fleetRows.find((item) => item.label === "Tarps")).toBeUndefined();
    expect(report.fleetRows.find((item) => item.label === "Net to owner")?.value).toBe(
      formatStatementDollars(statement.netCents),
    );
  });
});

describe("tarps column", () => {
  it("reads BC or BG only when that header says Tarps", () => {
    expect(tarpColumnIndex(["Delivery Date", "Load ID", "Rate"], "8")).toBe(-1);
    expect(tarpColumnIndex(["Delivery Date", "Load ID", "Rate"], "3")).toBe(-1);
    const namedElsewhere = parseLoadLedger(
      [
        ["Delivery Date", "Load ID", "Rate", "Tarps"],
        ["10/13/2026", "TBH--1206", "$10.00", "$50.00"],
      ],
      { unitNumber: "8" },
    );
    expect(namedElsewhere.rows[0]?.tarpCents).toBe(0);

    const wrongHeader = padded("Order Status", TARP_COLUMN_BC, "$71.00");
    expect(parseLoadLedger(wrongHeader, { unitNumber: "8" }).rows[0]?.tarpCents).toBe(0);

    const truck8 = padded("Tarps", TARP_COLUMN_BC, "$50.00");
    expect(tarpColumnIndex(truck8[0] ?? [], "8")).toBe(TARP_COLUMN_BC);
    expect(parseLoadLedger(truck8, { unitNumber: "8" }).rows[0]?.tarpCents).toBe(5_000);

    const truck3 = padded("Tarps", TARP_COLUMN_TRUCK_3, "$50.00");
    truck3[0]![TARP_COLUMN_BC] = "Order Status";
    truck3[1]![TARP_COLUMN_BC] = "$71.00";
    expect(tarpColumnIndex(truck3[0] ?? [], "3")).toBe(TARP_COLUMN_TRUCK_3);
    expect(parseLoadLedger(truck3, { unitNumber: "3" }).rows[0]?.tarpCents).toBe(5_000);
    expect(parseLoadLedger(truck3, { unitNumber: "8" }).rows[0]?.tarpCents).toBe(0);
  });
});
