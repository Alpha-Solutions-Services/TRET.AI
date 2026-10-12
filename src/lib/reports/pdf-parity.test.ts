import { describe, expect, it, vi } from "vitest";
import type { TruckClass } from "@/lib/fee-engine";
import { ownerPaysManagementTotal } from "@/lib/fees/kinds";
import { buildTruckWeekInsOuts, type TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { overlaySheetStatements } from "@/lib/statements/sheet-week";
import type { UnitStatement, WeekStatements } from "@/lib/statements/types";
import { prepareWeeklyReport } from "./prepare";
import { fleetFromTrucks, fleetMpgFromTrucks } from "./trip-metrics";
import type { WeeklyReportSource } from "./types";

const WEEK = { weekStart: "2026-10-05", weekEnd: "2026-10-11" };

type Spec = {
  unit: string;
  truckClass: TruckClass;
  grossCents: number;
  milesHundredths: number;
  deadheadHundredths: number;
  mpg: string | null;
  driverCents: number;
  dispatchCents: number;
  factoringCents: number;
  managementCents: number;
  fuelCents: number;
  tollCents: number;
  miscCents: number;
  fixedCents: number;
  netCents: number;
  gallonsMilli: number;
  /** Sheet cells that still include a held TONU. Week 41 leaves those miles and that toll out. */
  heldInSheet?: { milesHundredths: number; deadheadHundredths: number; tollCents: number };
  tripOpen?: boolean;
};

const TRUCKS: Spec[] = [
  { unit: "1", truckClass: "legacy_owned", grossCents: 0, milesHundredths: 0, deadheadHundredths: 0, mpg: null, driverCents: 0, dispatchCents: 0, factoringCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, miscCents: 0, fixedCents: 72_945, netCents: -72_945, gallonsMilli: 0 },
  { unit: "2", truckClass: "legacy_owned", grossCents: 0, milesHundredths: 0, deadheadHundredths: 0, mpg: null, driverCents: 0, dispatchCents: 0, factoringCents: 0, managementCents: 0, fuelCents: 139_665, tollCents: 0, miscCents: 0, fixedCents: 78_292, netCents: -217_957, gallonsMilli: 0 },
  { unit: "3", truckClass: "tolson_owned", grossCents: 855_000, milesHundredths: 285_200, deadheadHundredths: 22_100, mpg: "7.16", driverCents: 171_000, dispatchCents: 47_025, factoringCents: 14_963, managementCents: 85_500, fuelCents: 156_430, tollCents: 64_213, miscCents: 97_488, fixedCents: 67_041, netCents: 151_340, gallonsMilli: 200_000 },
  { unit: "4", truckClass: "third_party", grossCents: 250_000, milesHundredths: 150_700, deadheadHundredths: 8_100, mpg: "8.29", driverCents: 68_125, dispatchCents: 0, factoringCents: 0, managementCents: 45_000, fuelCents: 106_556, tollCents: 0, miscCents: 227_502, fixedCents: 67_726, netCents: -264_909, gallonsMilli: 100_000 },
  { unit: "5", truckClass: "third_party", grossCents: 720_000, milesHundredths: 258_839, deadheadHundredths: 28_839, mpg: "10.65", driverCents: 192_600, dispatchCents: 0, factoringCents: 0, managementCents: 129_600, fuelCents: 108_260, tollCents: 0, miscCents: 0, fixedCents: 76_762, netCents: 212_778, gallonsMilli: 150_000 },
  { unit: "6", truckClass: "third_party", grossCents: 200_000, milesHundredths: 69_880, deadheadHundredths: 2_987, mpg: null, driverCents: 53_500, dispatchCents: 0, factoringCents: 0, managementCents: 36_000, fuelCents: 116_586, tollCents: 0, miscCents: 0, fixedCents: 83_455, netCents: -89_541, gallonsMilli: 83_616, tripOpen: true },
  { unit: "7", truckClass: "third_party", grossCents: 470_000, milesHundredths: 130_076, deadheadHundredths: 2_734, mpg: "7.42", driverCents: 128_075, dispatchCents: 0, factoringCents: 0, managementCents: 84_600, fuelCents: 158_464, tollCents: 3_647, miscCents: 10_598, fixedCents: 70_112, netCents: 14_504, gallonsMilli: 153_055 },
  {
    unit: "8",
    truckClass: "third_party",
    grossCents: 790_000,
    milesHundredths: 265_000,
    deadheadHundredths: 24_100,
    mpg: "7.04",
    driverCents: 211_325,
    dispatchCents: 0,
    factoringCents: 0,
    managementCents: 142_200,
    fuelCents: 158_816,
    tollCents: 3_661,
    miscCents: 33_420,
    fixedCents: 80_462,
    netCents: 160_116,
    gallonsMilli: 254_757,
    heldInSheet: { milesHundredths: 266_000, deadheadHundredths: 25_100, tollCents: 4_861 },
  },
];

function dollars(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function miles(hundredths: number): string {
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

function header(): string[] {
  const cells = Array.from({ length: 48 }, () => "");
  cells[0] = "Delivery Date";
  cells[1] = "Load ID";
  cells[2] = "Rate";
  cells[3] = "Status";
  cells[4] = "Trip Group";
  cells[15] = "Allocated Miles";
  cells[44] = "Toll Expense";
  cells[47] = "Alloc Deadhead";
  return cells;
}

function ledger(spec: Spec): string[][] {
  const sheet = spec.heldInSheet ?? spec;
  const row = Array.from({ length: 48 }, () => "");
  row[0] = "10/06/2026";
  row[1] = `TBH--11${spec.unit}0`;
  row[2] = dollars(spec.grossCents);
  row[4] = `M-${spec.unit}`;
  row[15] = spec.milesHundredths === 0 ? "" : miles(spec.milesHundredths);
  row[44] = spec.tollCents === 0 ? "" : dollars(spec.tollCents);
  row[47] = spec.deadheadHundredths === 0 ? "" : miles(spec.deadheadHundredths);
  const rows = [header(), row];
  if (spec.heldInSheet) {
    const tonu = Array.from({ length: 48 }, () => "");
    tonu[0] = "10/09/2026";
    tonu[1] = "TBH--1201";
    tonu[2] = "$2,000.00";
    tonu[3] = "TONU";
    tonu[15] = miles(sheet.milesHundredths - spec.milesHundredths);
    tonu[44] = dollars(sheet.tollCents - spec.tollCents);
    tonu[47] = miles(sheet.deadheadHundredths - spec.deadheadHundredths);
    rows.push(tonu);
  }
  if (spec.tripOpen) {
    const later = Array.from({ length: 48 }, () => "");
    later[0] = "10/12/2026";
    later[1] = "TBH--1181";
    later[2] = "$1,000.00";
    later[4] = `M-${spec.unit}`;
    rows.push(later);
  }
  return rows;
}

function weekly(spec: Spec): string[][] {
  const toll = spec.heldInSheet?.tollCents ?? spec.tollCents;
  return [
    ["Week Start Date", "Driver Compensation", "Management Fee", "Dispatch Fee", "Factoring Fee", "Fuel", "Toll Fees", "Insurance", "Misc"],
    [
      "10/05/2026",
      dollars(spec.driverCents),
      dollars(spec.managementCents),
      dollars(spec.dispatchCents),
      dollars(spec.factoringCents),
      dollars(spec.fuelCents),
      dollars(toll),
      dollars(spec.fixedCents),
      dollars(spec.miscCents),
    ],
  ];
}

function weekReport(spec: Spec): string[][] {
  const shown = spec.heldInSheet ?? spec;
  const grid = Array.from({ length: 32 }, () => Array.from({ length: 15 }, () => ""));
  grid[3]![1] = "Total Revenue";
  grid[3]![2] = dollars(spec.grossCents);
  grid[17]![1] = "Deadhead Miles";
  grid[17]![2] = shown.deadheadHundredths === 0 ? "" : miles(shown.deadheadHundredths);
  grid[18]![1] = "Total Miles";
  grid[18]![2] = shown.milesHundredths === 0 ? "" : miles(shown.milesHundredths);
  grid[21]![1] = "Dispatch Fee";
  grid[21]![2] = dollars(spec.dispatchCents);
  grid[22]![1] = "Factoring Fee";
  grid[22]![2] = dollars(spec.factoringCents);
  grid[23]![1] = "Driver Pay";
  grid[23]![2] = dollars(spec.driverCents);
  grid[24]![1] = "Management Fee";
  grid[24]![2] = dollars(spec.managementCents);
  grid[25]![13] = "Misc Expenses (1-5)";
  grid[25]![14] = dollars(spec.miscCents);
  grid[28]![1] = "Fuel Total Cost";
  grid[28]![2] = dollars(spec.fuelCents);
  grid[29]![13] = "Toll Fees";
  grid[29]![14] = dollars(shown.tollCents);
  if (spec.mpg) grid[30]![2] = spec.mpg;
  return grid;
}

function fuelLog(spec: Spec): string[][] {
  if (spec.gallonsMilli <= 0) return [["Date", "Gallons", "Item"]];
  const gallons = `${Math.floor(spec.gallonsMilli / 1000)}.${String(spec.gallonsMilli % 1000).padStart(3, "0")}`;
  return [
    ["Date", "Gallons", "Item"],
    ["10/06/2026", gallons, "ULSD"],
  ];
}

function dashboardRow(spec: Spec): TruckWeekInsOuts {
  return buildTruckWeekInsOuts({
    unitNumber: spec.unit,
    truckName: `Truck ${spec.unit}`,
    truckClass: spec.truckClass,
    ...WEEK,
    loadLedger: spec.grossCents === 0 && !spec.tripOpen ? [header()] : ledger(spec),
    mgmtExpenses: null,
    weeklyExpenses: weekly(spec),
    weekReport: weekReport(spec),
    fuelLog: fuelLog(spec),
    note: null,
  });
}

function blankUnit(spec: Spec): UnitStatement {
  return {
    truckId: `truck-${spec.unit}`,
    unitNumber: spec.unit,
    truckClass: spec.truckClass,
    contractId: null,
    grossCents: 0,
    driverPayCents: 0,
    managementFeeCents: 0,
    tolsonPayableCents: 0,
    legacyRetainedCents: 0,
    dispatchFeeCents: 0,
    factoringFeeCents: 0,
    fuelCents: 0,
    tollsCents: 0,
    fixedOwnerCents: 0,
    fixedManagementCents: 0,
    netCents: 0,
    loadCount: 0,
    loadedMilesHundredths: 0,
    deadheadMilesHundredths: 0,
    lines: [],
  };
}

function statementsFor(rows: TruckWeekInsOuts[], specs: Spec[]): WeekStatements {
  const shell: WeekStatements = {
    weekStart: WEEK.weekStart,
    weekEnd: WEEK.weekEnd,
    units: specs.map(blankUnit),
    fleet: {
      grossCents: 0,
      driverPayCents: 0,
      managementFeeCents: 0,
      tolsonPayableCents: 0,
      legacyRetainedCents: 0,
      dispatchFeeCents: 0,
      factoringFeeCents: 0,
      fuelCents: 0,
      tollsCents: 0,
      fixedOwnerCents: 0,
      fixedManagementCents: 0,
      netCents: 0,
      loadCount: 0,
      unitCount: 0,
    },
    blockers: [],
    warnings: [],
    closeAllowed: true,
  };
  return overlaySheetStatements(shell, rows);
}

function sourceFor(rows: TruckWeekInsOuts[], specs: Spec[], perTruck: boolean): WeeklyReportSource {
  const page = statementsFor(rows, specs);
  return {
    ...WEEK,
    locked: false,
    closedAt: null,
    units: page.units,
    fleet: page.fleet,
    trucks: [],
    loads: [],
    fuel: rows
      .filter((row) => (row.reportDieselGallonsMilli ?? 0) > 0)
      .map((row) => ({
        unitNumber: row.unitNumber,
        amountCents: row.categories.find((item) => item.category === "Fuel")?.cents ?? 0,
        gallonsMilli: row.reportDieselGallonsMilli ?? 0,
        product: "diesel" as const,
      })),
    tolls: rows
      .filter((row) => (row.categories.find((item) => item.category === "Toll fees")?.cents ?? 0) > 0)
      .map((row) => ({
        unitNumber: row.unitNumber,
        amountCents: row.categories.find((item) => item.category === "Toll fees")?.cents ?? 0,
      })),
    perTruck,
    sheetUnits: rows.map((row) => ({
      unitNumber: row.unitNumber,
      mpg: row.mpg ?? null,
      mpgKnown: row.readable,
      mpgFromSheet: row.mpgFromSheet === true,
      tripOpen: row.tripOpen === true,
    })),
  };
}

function tollCents(row: TruckWeekInsOuts): number {
  return row.categories.find((item) => item.category === "Toll fees")?.cents ?? 0;
}

describe("owner PDF and dashboard parity", () => {
  const rows = TRUCKS.map(dashboardRow);

  it("matches MPG, tolls, deadhead, and net on every truck", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const spec of TRUCKS) {
      const row = rows.find((item) => item.unitNumber === spec.unit)!;
      const report = prepareWeeklyReport(sourceFor([row], [spec], true));
      const unit = report.units[0]!;
      const statement = statementsFor([row], [spec]).units[0]!;
      expect(row.mpg ?? null, spec.unit).toBe(spec.mpg);
      expect(row.tripOpen === true, spec.unit).toBe(spec.tripOpen === true);
      expect(tollCents(row), spec.unit).toBe(spec.tollCents);
      expect(statement.tollsCents, spec.unit).toBe(spec.tollCents);
      expect(row.deadheadMilesHundredths, spec.unit).toBe(spec.deadheadHundredths);
      expect(statement.deadheadMilesHundredths, spec.unit).toBe(spec.deadheadHundredths);
      expect(row.truckMilesHundredths, spec.unit).toBe(spec.milesHundredths);
      expect(statement.loadedMilesHundredths + statement.deadheadMilesHundredths, spec.unit).toBe(spec.milesHundredths);
      expect(row.netCents, spec.unit).toBe(spec.netCents);
      expect(statement.netCents, spec.unit).toBe(spec.netCents);
      expect(row.outsCents, spec.unit).toBe(spec.grossCents - spec.netCents);
      const mpg = unit.performance.find((item) => item.label === "MPG")?.value;
      expect(mpg, spec.unit).toBe(spec.mpg ?? "Not stored");
      expect(report.fleetChart.mpg, spec.unit).toBe(spec.mpg);
      expect(report.totalsHeading, spec.unit).toBe(`Truck ${spec.unit} totals`);
      expect(report.fleetChart.summary, spec.unit).toContain(`Truck ${spec.unit} earned`);
      if (!ownerPaysManagementTotal(spec.truckClass)) {
        expect(statement.tolsonPayableCents, spec.unit).toBe(row.managementFeeCents ?? 0);
      }
    }
    warn.mockRestore();
  });

  it("matches fleet tolls, deadhead, truck miles, expenses, net, and MPG", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const report = prepareWeeklyReport(sourceFor(rows, TRUCKS, false));
    const fleet = statementsFor(rows, TRUCKS).fleet;
    expect(fleet.tollsCents).toBe(71_521);
    expect(fleet.netCents).toBe(-106_614);
    expect(rows.reduce((sum, row) => sum + (row.deadheadMilesHundredths ?? 0), 0)).toBe(88_860);
    expect(rows.reduce((sum, row) => sum + (row.truckMilesHundredths ?? 0), 0)).toBe(1_159_695);
    expect(rows.reduce((sum, row) => sum + row.outsCents, 0)).toBe(3_391_614);
    expect(report.totalsHeading).toBe("Fleet totals");
    expect(report.fleetChart.summary).toContain("the fleet earned");
    const figures = fleetFromTrucks(
      rows.map((row) => ({
        grossCents: row.insCents,
        totalMilesHundredths: row.truckMilesHundredths ?? 0,
        mainMilesHundredths: row.loadedMilesHundredths ?? 0,
        gallonsMilli: row.reportDieselGallonsMilli ?? row.dieselGallonsMilli ?? 0,
        mpg: row.mpg ?? null,
      })),
    );
    expect(report.fleetChart.mpg).toBe(figures.mpg);
    expect(report.fleetChart.mpg).toBe(
      fleetMpgFromTrucks(
        rows.map((row) => ({
          truckMilesHundredths: row.truckMilesHundredths ?? 0,
          gallonsMilli: row.reportDieselGallonsMilli ?? 0,
          mpg: row.mpg ?? null,
        })),
      ),
    );
    warn.mockRestore();
  });

  it("counts the held TONU deadhead and toll in week 42, on the dashboard and the statement", () => {
    const spec = TRUCKS.find((item) => item.unit === "8")!;
    const week = { weekStart: "2026-10-12", weekEnd: "2026-10-18" };
    const row = buildTruckWeekInsOuts({
      unitNumber: spec.unit,
      truckName: "Truck 8",
      truckClass: spec.truckClass,
      ...week,
      loadLedger: ledger(spec),
      mgmtExpenses: null,
      weeklyExpenses: [["Week Start Date", "Driver Compensation", "Toll Fees"], ["10/12/2026", "$0.00", "$0.00"]],
      weekReport: null,
      fuelLog: null,
      note: null,
    });
    const statement = statementsFor([row], [spec]).units[0]!;
    expect(row.insCents).toBe(0);
    expect(statement.grossCents).toBe(0);
    expect(row.deadheadMilesHundredths).toBe(1_000);
    expect(statement.deadheadMilesHundredths).toBe(1_000);
    expect(row.truckMilesHundredths).toBe(1_000);
    expect(tollCents(row)).toBe(1_200);
    expect(statement.tollsCents).toBe(1_200);
    expect(row.netCents).toBe(-1_200);
    expect(statement.netCents).toBe(-1_200);
  });

  it("uses truck miles over diesel gallons for fleet MPG", () => {
    expect(
      fleetMpgFromTrucks([{ truckMilesHundredths: 1_159_695, gallonsMilli: 1_637_860, mpg: "7.00" }]),
    ).toBe("7.08");
    expect(
      fleetMpgFromTrucks([{ truckMilesHundredths: 1_160_695, gallonsMilli: 1_637_860, mpg: "7.00" }]),
    ).toBe("7.09");
  });
});
