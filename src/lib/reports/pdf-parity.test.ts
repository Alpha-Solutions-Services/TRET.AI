import { inflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { TruckClass } from "@/lib/fee-engine";
import { ownerPaysManagementTotal } from "@/lib/fees/kinds";
import { buildTruckWeekInsOuts, type TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { overlaySheetStatements } from "@/lib/statements/sheet-week";
import type { UnitStatement, WeekStatements } from "@/lib/statements/types";
import { weeklyStatementPdf } from "./build";
import { alignPdfDetails } from "./pdf-details";
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
  /** Week Report C28 diesel gallons. DEF is not included. */
  gallonsMilli: number;
  /** Week Report C31 when the displayed MPG is the diesel figure instead. */
  sheetMpg?: string | null;
  defGallonsMilli?: number;
  /** Fuel log gallons when they differ from C28. The PDF must not use this for MPG. */
  fuelLogMilli?: number;
  /** Owner PDF MPG when it is not the dashboard C31 figure. */
  statementMpg?: string | null;
  /** Sheet cells that still include a held TONU. Miles move to the count week. The toll cell stays as written. */
  heldInSheet?: { milesHundredths: number; deadheadHundredths: number; tollCents: number };
  tripOpen?: boolean;
};

const TRUCKS: Spec[] = [
  { unit: "1", truckClass: "legacy_owned", grossCents: 0, milesHundredths: 0, deadheadHundredths: 0, mpg: null, driverCents: 0, dispatchCents: 0, factoringCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, miscCents: 0, fixedCents: 72_945, netCents: -72_945, gallonsMilli: 0 },
  { unit: "2", truckClass: "legacy_owned", grossCents: 0, milesHundredths: 0, deadheadHundredths: 0, mpg: null, driverCents: 0, dispatchCents: 0, factoringCents: 0, managementCents: 0, fuelCents: 139_665, tollCents: 0, miscCents: 0, fixedCents: 78_292, netCents: -217_957, gallonsMilli: 0 },
  { unit: "3", truckClass: "tolson_owned", grossCents: 855_000, milesHundredths: 285_200, deadheadHundredths: 22_100, mpg: "7.35", sheetMpg: "7.16", driverCents: 171_000, dispatchCents: 47_025, factoringCents: 14_963, managementCents: 85_500, fuelCents: 156_430, tollCents: 64_213, miscCents: 97_488, fixedCents: 67_041, netCents: 151_340, gallonsMilli: 388_027, defGallonsMilli: 10_297 },
  { unit: "4", truckClass: "third_party", grossCents: 250_000, milesHundredths: 150_700, deadheadHundredths: 8_100, mpg: "8.44", sheetMpg: "8.29", driverCents: 68_125, dispatchCents: 0, factoringCents: 0, managementCents: 45_000, fuelCents: 106_556, tollCents: 0, miscCents: 227_502, fixedCents: 67_726, netCents: -264_909, gallonsMilli: 178_554, defGallonsMilli: 3_231 },
  { unit: "5", truckClass: "third_party", grossCents: 720_000, milesHundredths: 258_839, deadheadHundredths: 28_839, mpg: "10.90", sheetMpg: "10.65", driverCents: 192_600, dispatchCents: 0, factoringCents: 0, managementCents: 129_600, fuelCents: 108_260, tollCents: 0, miscCents: 0, fixedCents: 76_762, netCents: 212_778, gallonsMilli: 237_467, defGallonsMilli: 5_574 },
  { unit: "6", truckClass: "third_party", grossCents: 200_000, milesHundredths: 69_880, deadheadHundredths: 2_987, mpg: null, driverCents: 53_500, dispatchCents: 0, factoringCents: 0, managementCents: 36_000, fuelCents: 116_586, tollCents: 0, miscCents: 0, fixedCents: 83_455, netCents: -89_541, gallonsMilli: 83_616, tripOpen: true },
  { unit: "7", truckClass: "third_party", grossCents: 470_000, milesHundredths: 130_076, deadheadHundredths: 2_734, mpg: "7.42", driverCents: 128_075, dispatchCents: 0, factoringCents: 0, managementCents: 84_600, fuelCents: 158_464, tollCents: 3_647, miscCents: 10_598, fixedCents: 70_112, netCents: 14_504, gallonsMilli: 158_818, tripOpen: true },
  {
    unit: "8",
    truckClass: "third_party",
    grossCents: 790_000,
    milesHundredths: 265_000,
    deadheadHundredths: 24_100,
    mpg: "9.82",
    sheetMpg: "7.04",
    driverCents: 211_325,
    dispatchCents: 0,
    factoringCents: 0,
    managementCents: 142_200,
    fuelCents: 158_816,
    tollCents: 4_861,
    miscCents: 33_420,
    fixedCents: 80_462,
    netCents: 158_916,
    gallonsMilli: 269_857,
    defGallonsMilli: 12_353,
    fuelLogMilli: 254_757,
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
    tonu[44] = "$50.00";
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
    ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)", "Dispatch Fee", "Factoring Fee", "Fuel", "Toll Fees", "Insurance", "Misc"],
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
  grid[24]![1] = "Total Fees (Legacy+Tolson)";
  grid[24]![2] = dollars(spec.managementCents);
  grid[25]![13] = "Misc Expenses (1-5)";
  grid[25]![14] = dollars(spec.miscCents);
  grid[28]![1] = "Fuel Total Cost";
  grid[28]![2] = dollars(spec.fuelCents);
  grid[29]![13] = "Toll Fees";
  grid[29]![14] = dollars(shown.tollCents);
  const sheetMpg = spec.sheetMpg === undefined ? spec.mpg : spec.sheetMpg;
  if (sheetMpg) grid[30]![2] = sheetMpg;
  if (spec.gallonsMilli > 0) grid[27]![2] = gallonText(spec.gallonsMilli);
  if ((spec.defGallonsMilli ?? 0) > 0) {
    grid[26]![1] = "DEF gallons";
    grid[26]![2] = gallonText(spec.defGallonsMilli ?? 0);
  }
  return grid;
}

function gallonText(milli: number): string {
  return `${Math.floor(milli / 1000)}.${String(milli % 1000).padStart(3, "0")}`;
}

function fuelLog(spec: Spec): string[][] {
  const milli = spec.fuelLogMilli ?? spec.gallonsMilli;
  if (milli <= 0) return [["Date", "Gallons", "Item"]];
  const gallons = gallonText(milli);
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
      const shownMpg = spec.statementMpg === undefined ? spec.mpg : spec.statementMpg;
      expect(mpg, spec.unit).toBe(shownMpg ?? "Not stored");
      expect(report.fleetChart.mpg, spec.unit).toBe(shownMpg);
      expect(report.totalsHeading, spec.unit).toBe(`Truck ${spec.unit} totals`);
      expect(report.fleetChart.summary, spec.unit).toContain(`Truck ${spec.unit} earned`);
      if (!ownerPaysManagementTotal(spec.truckClass)) {
        expect(statement.tolsonPayableCents, spec.unit).toBe(
          row.categories.find((item) => item.category === "Management fee")?.cents ?? 0,
        );
      }
    }
    warn.mockRestore();
  });

  it("matches fleet tolls, deadhead, truck miles, expenses, net, and MPG", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const report = prepareWeeklyReport(sourceFor(rows, TRUCKS, false));
    const fleet = statementsFor(rows, TRUCKS).fleet;
    expect(fleet.tollsCents).toBe(72_721);
    expect(fleet.netCents).toBe(-107_814);
    expect(rows.reduce((sum, row) => sum + (row.deadheadMilesHundredths ?? 0), 0)).toBe(88_860);
    expect(rows.reduce((sum, row) => sum + (row.truckMilesHundredths ?? 0), 0)).toBe(1_159_695);
    expect(rows.reduce((sum, row) => sum + row.outsCents, 0)).toBe(3_392_814);
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
    expect(report.fleetChart.mpg).toBe("8.81");
    expect(report.fleetChart.mpg).toBe(figures.mpg);
    expect(report.fleetChart.mpg).toBe(
      fleetMpgFromTrucks(
        rows.map((row) => ({
          truckMilesHundredths: row.truckMilesHundredths ?? 0,
          gallonsMilli: row.reportDieselGallonsMilli ?? 0,
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
    expect(tollCents(row)).toBe(5_000);
    expect(statement.tollsCents).toBe(5_000);
    expect(row.netCents).toBe(-5_000);
    expect(statement.netCents).toBe(-5_000);
  });

  it("uses truck miles over diesel gallons for fleet MPG", () => {
    expect(fleetMpgFromTrucks([{ truckMilesHundredths: 1_159_695, gallonsMilli: 1_316_339 }])).toBe("8.81");
    expect(fleetMpgFromTrucks([{ truckMilesHundredths: 1_160_695, gallonsMilli: 1_316_339 }])).toBe("8.82");
  });

  it("renders week 41 PDF and statement MPG, and the shared-trip footnote only for a shared trip", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const built = TRUCKS.map(dashboardRow).map((row) => {
      if (row.unitNumber !== "3" && row.unitNumber !== "4") return row;
      return {
        ...row,
        weekLoads: (row.weekLoads ?? []).map((load, index) =>
          index === 0 ? { ...load, sheetPrimary: false as const, ledgerMilesHundredths: 100 } : load,
        ),
      };
    });
    const aligned = alignPdfDetails(baitSource(built, TRUCKS), built);
    const statement = prepareWeeklyReport(aligned);
    const note = "Shared trip. Each row shows its own loaded miles. The total counts the trip once.";
    expect(mpgOf(statement, "3")).toBe("7.35");
    expect(mpgOf(statement, "4")).toBe("8.44");
    expect(mpgOf(statement, "5")).toBe("10.90");
    expect(mpgOf(statement, "6")).toBe("Not stored");
    expect(mpgOf(statement, "7")).toBe("7.42");
    expect(mpgOf(statement, "8")).toBe("9.82");
    expect(statement.units.find((unit) => unit.unitNumber === "8")?.fuelSummary.find((row) => row.label === "Diesel gallons")?.value).toBe(
      "269.857",
    );
    expect(statement.units.find((unit) => unit.unitNumber === "8")?.fuelSummary.find((row) => row.label === "DEF gallons")?.value).toBe(
      "12.353",
    );
    expect(statement.units.find((unit) => unit.unitNumber === "8")?.fuelSummary.find((row) => row.label === "Discounted fuel (booked)")?.value).toBe(
      "$1,588.16",
    );
    expect(statement.fleetChart.mpg).toBe("8.81");
    expect(statement.units.find((unit) => unit.unitNumber === "3")?.loadNote).toBeNull();
    expect(statement.units.find((unit) => unit.unitNumber === "4")?.loadNote).toBeNull();
    expect(statement.units.find((unit) => unit.unitNumber === "7")?.loadNote).toBe(note);

    const fleetPdf = pdfText(await weeklyStatementPdf(aligned));
    expect(sliceUnit(fleetPdf, "6")).toContain("Not stored");
    expect(sliceUnit(fleetPdf, "6")).not.toContain("8.00");
    expect(sliceUnit(fleetPdf, "7")).toContain("7.42");
    expect(sliceUnit(fleetPdf, "7")).not.toContain("8.32");
    expect(sliceUnit(fleetPdf, "7")).toContain(note);
    expect(sliceUnit(fleetPdf, "3")).toContain("7.35");
    expect(sliceUnit(fleetPdf, "4")).toContain("8.44");
    expect(sliceUnit(fleetPdf, "5")).toContain("10.90");
    expect(sliceUnit(fleetPdf, "8")).toContain("9.82");
    expect(sliceUnit(fleetPdf, "8")).toContain("269.857");
    expect(sliceUnit(fleetPdf, "8")).toContain("12.353");
    expect(sliceUnit(fleetPdf, "8")).not.toContain("9.46");
    expect(sliceUnit(fleetPdf, "8")).not.toContain("7.04");
    expect(sliceUnit(fleetPdf, "8")).not.toContain("254.757");
    expect(sliceUnit(fleetPdf, "3")).not.toContain(note);
    expect(sliceUnit(fleetPdf, "4")).not.toContain(note);
    const fleetPage = fleetPdf.slice(fleetPdf.indexOf("Fleet totals"));
    expect(fleetPage).toContain("8.81");
    expect(fleetPage).not.toContain("8.28");
    expect(fleetPage).not.toContain("7.08");

    for (const unit of ["3", "4", "6", "7", "8"] as const) {
      const one = pdfText(await weeklyStatementPdf(perTruck(aligned, unit)));
      expect(one).toContain(`Truck ${unit} totals`);
      expect(mpgOf(prepareWeeklyReport(perTruck(aligned, unit)), unit)).toBe(mpgOf(statement, unit));
      if (unit === "6") expect(one).not.toContain("8.00");
      if (unit === "7") expect(one).toContain("7.42");
      if (unit === "8") expect(one).toContain("9.82");
      if (unit === "3" || unit === "4") expect(one).not.toContain(note);
      if (unit === "7") expect(one).toContain(note);
    }
    warn.mockRestore();
  });
});

const SHARED_UNITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

function mpgOf(report: ReturnType<typeof prepareWeeklyReport>, unit: string): string | undefined {
  return report.units.find((row) => row.unitNumber === unit)?.performance.find((row) => row.label === "MPG")?.value;
}

function sliceUnit(text: string, unit: string): string {
  const start = text.indexOf(`Unit ${unit}`);
  const next = SHARED_UNITS.map((item) => text.indexOf(`Unit ${item}`, start + 1)).filter((at) => at > start);
  const fleet = text.indexOf("Fleet totals", start + 1);
  const stops = [...next, fleet].filter((at) => at > start);
  const end = stops.length > 0 ? Math.min(...stops) : text.length;
  return text.slice(start, end);
}

function baitSource(rows: TruckWeekInsOuts[], specs: Spec[]): WeeklyReportSource {
  const page = statementsFor(rows, specs);
  return {
    ...WEEK,
    locked: false,
    closedAt: null,
    units: page.units,
    fleet: page.fleet,
    trucks: [],
    loads: [],
    fuel: specs
      .filter((spec) => (spec.fuelLogMilli ?? spec.gallonsMilli) > 0)
      .map((spec) => ({
        unitNumber: spec.unit,
        amountCents: spec.fuelCents,
        gallonsMilli: spec.fuelLogMilli ?? spec.gallonsMilli,
        product: "diesel" as const,
      })),
    tolls: [],
    perTruck: false,
  };
}

function perTruck(source: WeeklyReportSource, unitNumber: string): WeeklyReportSource {
  const unit = source.units.find((row) => row.unitNumber === unitNumber);
  if (!unit) throw new Error(`missing ${unitNumber}`);
  return {
    ...source,
    perTruck: true,
    units: [unit],
    fleet: {
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
    },
    loads: source.loads.filter((load) => load.truckId === unit.truckId),
    fuel: source.fuel.filter((row) => row.unitNumber === unit.unitNumber),
    tolls: source.tolls.filter((row) => row.unitNumber === unit.unitNumber),
  };
}

function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const chunks: string[] = [];
  let index = 0;
  while (index < raw.length) {
    const start = raw.indexOf("stream\n", index);
    if (start < 0) break;
    const dataStart = start + "stream\n".length;
    const end = raw.indexOf("\nendstream", dataStart);
    if (end < 0) break;
    const slice = raw.subarray(dataStart, end);
    let content = "";
    try {
      content = inflateSync(slice).toString("latin1");
    } catch {
      content = slice.toString("latin1");
    }
    chunks.push(decodePdfStrings(content));
    index = end + "\nendstream".length;
  }
  return chunks.join("\n");
}

function decodePdfStrings(content: string): string {
  const parts: string[] = [];
  for (const match of content.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = match[1] ?? "";
    let text = "";
    for (let i = 0; i + 1 < hex.length; i += 2) {
      text += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
    }
    parts.push(text);
  }
  return parts.join("\n");
}
