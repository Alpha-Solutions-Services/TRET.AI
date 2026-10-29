import { describe, expect, it } from "vitest";
import { centsPerLoadedMile } from "@/lib/reports/format";
import { TBH_1201 } from "@/lib/loads/tbh-1201";
import { managementFeeSplit, seededFeeRates } from "@/lib/fees/two-lines";
import { buildOwnerTruckWeek, readWeekReportMoney, SHEET_FEE_DIFFERS, TONU_RATE_NOTE, tonuReportIncludedMessage, tonuReportOmittedMessage, weekReportApplies, weekReportGallons } from "@/lib/reports/owner-week";
import { tonuReportBlockers, unreadExpenseBlockers } from "@/lib/statements/sheet-week";
import { lockPayload } from "@/lib/statements/engine";
import { buildAssetReport } from "@/lib/asset-report/build";
import { buildTruckWeekInsOuts, fuelLogGallons } from "@/lib/sheets/ins-outs";
import { percentFeeStatement } from "@/lib/statements/engine";
import { applySheetWeek } from "@/lib/statements/sheet-week";
import { TARP_COLUMN_BC } from "@/lib/sheets/ledger";
import { findFuelLogHeader, locateFuelLogColumns } from "@/lib/fuel-tolls/file/sheet-columns";
import { compareDailyCheck } from "@/lib/reports/daily-check";

const WEEK = { weekStart: "2026-10-05", weekEnd: "2026-10-11" };

/** Week 41 truck 8 tolls from the 10/29 sheet read. The $12 is TBH--1195, not TBH--1178. */
function week41TollLedger(): string[][] {
  const header = Array.from({ length: 48 }, () => "");
  header[0] = "Delivery Date";
  header[1] = "Load ID";
  header[2] = "Rate";
  header[3] = "Status";
  header[4] = "Trip Group";
  header[15] = "Allocated Miles";
  header[44] = "Toll Expense";
  header[6] = "Pickup Date";
  header[47] = "Alloc Deadhead";
  const row = (day: string, id: string, rate: string, status: string, trip: string, miles: string, toll: string, deadhead: string, pickup = "") => {
    const cells = Array.from({ length: 48 }, () => "");
    cells[0] = day;
    cells[1] = id;
    cells[2] = rate;
    cells[3] = status;
    cells[4] = trip;
    cells[6] = pickup;
    cells[15] = miles;
    cells[44] = toll;
    cells[47] = deadhead;
    return cells;
  };
  return [
    header,
    row("10/05/2026", "TBH--1179", "$2,400.00", "", "", "", "$5.72", ""),
    row("10/06/2026", "TBH--1184", "$1,100.00", "", "", "", "$12.34", ""),
    row("10/08/2026", "TBH--1188", "$1,800.00", "", "M-1195", "2650.00", "$18.55", "241.00"),
    row("10/08/2026", "TBH--1192", "$1,700.00", "", "M-1195", "", "$0.00", ""),
    row("10/08/2026", "TBH--1195", "$900.00", "", "M-1195", "", "$12.00", ""),
    row(TBH_1201.deliverySheet, TBH_1201.loadId, "$2,000.00", "TONU", "", "10.00", "$50.00", "10.00", TBH_1201.pickupSheet),
  ];
}

type TruckFixture = {
  unit: string;
  loads: number;
  grossCents: number;
  milesHundredths: number;
  miscCents: number;
  driverCents: number;
  dispatchCents: number;
  factoringCents: number;
  /** Sheet Management Fee cell. Trucks 4 to 8 still show 10 percent. */
  sheetManagementCents: number;
  /** TRET total: Legacy percent of gross plus Tolson percent of gross. */
  managementCents: number;
  fuelCents: number;
  tollCents: number;
  fixedCents: number;
  expenseCents: number;
  netCents: number;
  mpg: string | null;
  rpmLabel?: string;
  legacyCents: number;
  tolsonCents: number;
  deadheadHundredths: number;
  sheetFeeDiffers: boolean;
  /** Week Report C4 when it still includes a held TONU. */
  sheetGrossCents?: number;
  pending?: { loadId: string; delivery: string }[];
  tonu?: { loadId: string; delivery: string; pickup?: string };
};

const TRUCKS: TruckFixture[] = [
  { unit: "1", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, fixedCents: 72_945, expenseCents: 72_945, netCents: -72_945, mpg: null, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0, sheetFeeDiffers: false },
  { unit: "2", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 0, managementCents: 0, fuelCents: 139_665, tollCents: 0, fixedCents: 78_292, expenseCents: 217_957, netCents: -217_957, mpg: null, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0, sheetFeeDiffers: false },
  { unit: "3", loads: 4, grossCents: 855_000, milesHundredths: 285_200, miscCents: 97_488, driverCents: 171_000, dispatchCents: 47_025, factoringCents: 14_963, sheetManagementCents: 85_500, managementCents: 85_500, fuelCents: 156_430, tollCents: 64_213, fixedCents: 67_041, expenseCents: 703_660, netCents: 151_340, mpg: "7.16", rpmLabel: "2.9979", legacyCents: 85_500, tolsonCents: 0, deadheadHundredths: 22_100, sheetFeeDiffers: false },
  { unit: "4", loads: 1, grossCents: 250_000, milesHundredths: 150_700, miscCents: 227_502, driverCents: 68_125, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 45_000, managementCents: 45_000, fuelCents: 106_556, tollCents: 0, fixedCents: 67_726, expenseCents: 514_909, netCents: -264_909, mpg: "8.29", rpmLabel: "1.6589", legacyCents: 25_000, tolsonCents: 20_000, deadheadHundredths: 8_100, sheetFeeDiffers: false },
  { unit: "5", loads: 5, grossCents: 720_000, milesHundredths: 258_839, miscCents: 0, driverCents: 192_600, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 129_600, managementCents: 129_600, fuelCents: 108_260, tollCents: 0, fixedCents: 76_762, expenseCents: 507_222, netCents: 212_778, mpg: "10.65", rpmLabel: "2.7817", legacyCents: 72_000, tolsonCents: 57_600, deadheadHundredths: 28_839, sheetFeeDiffers: false },
  { unit: "6", loads: 2, grossCents: 200_000, milesHundredths: 69_880, miscCents: 0, driverCents: 53_500, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 36_000, managementCents: 36_000, fuelCents: 116_586, tollCents: 0, fixedCents: 83_455, expenseCents: 289_541, netCents: -89_541, mpg: null, rpmLabel: "2.8621", legacyCents: 20_000, tolsonCents: 16_000, deadheadHundredths: 2_987, sheetFeeDiffers: false, pending: [{ loadId: "TBH--1181", delivery: "10/12/2026" }, { loadId: "TBH--1191", delivery: "10/12/2026" }] },
  { unit: "7", loads: 2, grossCents: 470_000, milesHundredths: 130_076, miscCents: 10_598, driverCents: 128_075, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 84_600, managementCents: 84_600, fuelCents: 158_464, tollCents: 3_647, fixedCents: 70_112, expenseCents: 455_496, netCents: 14_504, mpg: "7.42", rpmLabel: "3.6133", legacyCents: 47_000, tolsonCents: 37_600, deadheadHundredths: 2_734, sheetFeeDiffers: false, pending: [{ loadId: "TBH--1200", delivery: "10/12/2026" }, { loadId: "TBH--1202", delivery: "10/12/2026" }] },
  { unit: "8", loads: 5, grossCents: 790_000, milesHundredths: 265_000, miscCents: 33_420, driverCents: 264_825, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 142_200, managementCents: 142_200, fuelCents: 158_816, tollCents: 4_861, fixedCents: 80_462, expenseCents: 684_584, netCents: 105_416, mpg: "7.04", legacyCents: 79_000, tolsonCents: 63_200, deadheadHundredths: 24_100, sheetFeeDiffers: false, tonu: { loadId: TBH_1201.loadId, delivery: TBH_1201.deliverySheet, pickup: TBH_1201.pickupSheet } },
  { unit: "9", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, fixedCents: 0, expenseCents: 0, netCents: 0, mpg: null, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0, sheetFeeDiffers: false },
  { unit: "10", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, fixedCents: 0, expenseCents: 0, netCents: 0, mpg: null, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0, sheetFeeDiffers: false },
];

function header(): string[] {
  const cells = Array.from({ length: 43 }, () => "");
  cells[0] = "Delivery Date";
  cells[6] = "Pickup Date";
  cells[1] = "Load ID";
  cells[2] = "Rate";
  cells[3] = "Status";
  cells[4] = "Trip Group";
  cells[5] = "Primary";
  cells[15] = "Allocated Miles";
  cells[38] = "Misc AM";
  cells[39] = "Misc AN";
  cells[40] = "Misc AO";
  cells[41] = "Misc AP";
  cells[42] = "Misc AQ";
  return cells;
}

function dollars(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function ledgerFor(truck: TruckFixture): string[][] {
  const rows: string[][] = [header()];
  const counted = truck.loads;
  let grossLeft = truck.grossCents;
  let milesLeft = truck.milesHundredths;
  let miscLeft = truck.miscCents;
  for (let index = 0; index < counted; index += 1) {
    const last = index === counted - 1;
    const gross = last ? grossLeft : Math.floor(truck.grossCents / counted);
    const miles = last ? milesLeft : Math.floor(truck.milesHundredths / counted);
    const misc = last ? miscLeft : 0;
    grossLeft -= gross;
    milesLeft -= miles;
    miscLeft -= misc;
    const row = Array.from({ length: 43 }, () => "");
    row[0] = "10/06/2026";
    row[1] = `TBH--${truck.unit}${index}`;
    row[2] = dollars(gross);
    row[4] = `M-${truck.unit}${index}`;
    row[5] = "Yes";
    row[15] = `${Math.floor(miles / 100)}.${String(miles % 100).padStart(2, "0")}`;
    row[38] = misc === 0 ? "" : dollars(misc);
    rows.push(row);
  }
  if (truck.tonu) {
    const row = Array.from({ length: 43 }, () => "");
    row[0] = truck.tonu.delivery;
    row[6] = truck.tonu.pickup ?? "";
    row[1] = truck.tonu.loadId;
    row[2] = "$2,000.00";
    row[3] = "TONU";
    rows.push(row);
  }
  for (const pending of truck.pending ?? []) {
    const row = Array.from({ length: 43 }, () => "");
    row[0] = pending.delivery;
    row[1] = pending.loadId;
    row[2] = "$2,000.00";
    row[15] = "100.00";
    rows.push(row);
  }
  return rows;
}

function weeklyFor(truck: TruckFixture): string[][] {
  return [
    ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)", "Dispatch Fee", "Factoring Fee", "Fuel", "Toll Fees", "Insurance", "Legacy Fee", "Tolson Fee"],
    [
      "10/05/2026",
      dollars(truck.driverCents),
      dollars(truck.sheetManagementCents),
      dollars(truck.dispatchCents),
      dollars(truck.factoringCents),
      dollars(truck.fuelCents),
      dollars(truck.tollCents),
      dollars(truck.fixedCents),
      dollars(truck.legacyCents),
      dollars(truck.tolsonCents),
    ],
  ];
}

function weekReport(truck: TruckFixture): string[][] {
  const grid = Array.from({ length: 32 }, () => Array.from({ length: 15 }, () => ""));
  grid[3]![1] = "Total Revenue";
  grid[3]![2] = dollars(truck.sheetGrossCents ?? truck.grossCents);
  grid[3]![5] = dollars(truck.expenseCents);
  grid[3]![8] = dollars(truck.netCents);
  if (truck.rpmLabel) {
    grid[6]![4] = "Avg Rate / Mile";
    grid[6]![5] = truck.rpmLabel;
  }
  grid[17]![1] = "Deadhead Miles";
  grid[17]![2] = truck.deadheadHundredths === 0 ? "" : `${Math.floor(truck.deadheadHundredths / 100)}.${String(truck.deadheadHundredths % 100).padStart(2, "0")}`;
  grid[18]![1] = "Total Miles";
  grid[18]![2] = truck.milesHundredths === 0 ? "" : `${Math.floor(truck.milesHundredths / 100)}.${String(truck.milesHundredths % 100).padStart(2, "0")}`;
  grid[21]![1] = "Dispatch Fee";
  grid[21]![2] = dollars(truck.dispatchCents);
  grid[22]![1] = "Factoring Fee";
  grid[22]![2] = dollars(truck.factoringCents);
  grid[23]![1] = "Driver Pay";
  grid[23]![2] = dollars(truck.driverCents);
  grid[24]![1] = "Total Fees (Legacy+Tolson)";
  grid[24]![2] = dollars(truck.sheetManagementCents);
  grid[25]![13] = "Misc Expenses (1-5)";
  grid[25]![14] = dollars(truck.miscCents);
  grid[29]![13] = "Toll Fees";
  grid[29]![14] = dollars(truck.tollCents);
  grid[28]![1] = "Fuel Total Cost";
  grid[28]![2] = dollars(truck.fuelCents);
  if (truck.mpg) grid[30]![2] = truck.mpg;
  return grid;
}

describe("week 41 owner sheet", () => {
  it("matches the sheet totals for trucks 1 through 10", () => {
    let loads = 0;
    for (const truck of TRUCKS) {
      const week = buildOwnerTruckWeek({
        ledger: truck.loads === 0 && !(truck.pending?.length) ? [["Delivery Date", "Load ID", "Rate"]] : ledgerFor(truck),
        weekly: weeklyFor(truck),
        weekReport: weekReport(truck),
        unitNumber: truck.unit,
        ...WEEK,
      });
      loads += week.loadCount;
      expect(week.miscCents, truck.unit).toBe(truck.miscCents);
      expect(week.expenseCents, truck.unit).toBe(truck.expenseCents);
      expect(week.netCents, truck.unit).toBe(truck.netCents);
      expect(week.grossCents, truck.unit).toBe(truck.grossCents);
      expect(week.loadCount, truck.unit).toBe(truck.loads);
      expect(week.fees.legacyFeeCents, truck.unit).toBe(truck.legacyCents);
      expect(week.fees.tolsonLeaseFeeCents, truck.unit).toBe(truck.tolsonCents);
      expect(week.fees.managementFeeCents, truck.unit).toBe(truck.managementCents);
      expect(week.deadheadHundredths, truck.unit).toBe(truck.deadheadHundredths);
      expect(week.sheetFeeDiffers, truck.unit).toBe(truck.sheetFeeDiffers);
      expect(week.categories.find((row) => row.category === "Management fee")?.cents ?? 0, truck.unit).toBe(truck.sheetManagementCents);
      if (truck.milesHundredths > 0) {
        expect(week.milesHundredths, truck.unit).toBe(truck.milesHundredths);
        expect(week.rpmCents, truck.unit).toBe(centsPerLoadedMile(truck.grossCents, truck.milesHundredths));
      }
      if (truck.rpmLabel) expect(week.rpmLabel, truck.unit).toBe(truck.rpmLabel);
      expect(week.mpg, truck.unit).toBe(truck.mpg);
    }
    expect(loads).toBe(19);
    expect(TRUCKS.reduce((sum, truck) => sum + truck.grossCents, 0)).toBe(3_285_000);
    expect(TRUCKS.reduce((sum, truck) => sum + truck.expenseCents, 0)).toBe(3_446_314);
    expect(TRUCKS.reduce((sum, truck) => sum + truck.netCents, 0)).toBe(-161_314);
    const legacyIncome = TRUCKS.reduce((sum, truck) => sum + truck.legacyCents, 0);
    const tolsonPayable = TRUCKS.reduce((sum, truck) => sum + truck.tolsonCents, 0);
    expect(legacyIncome).toBe(328_500);
    expect(tolsonPayable).toBe(194_400);
    expect(TRUCKS.reduce((sum, truck) => sum + truck.deadheadHundredths, 0)).toBe(88_860);
    const truck6 = buildOwnerTruckWeek({ ledger: ledgerFor(TRUCKS[5]!), weekly: weeklyFor(TRUCKS[5]!), unitNumber: "6", ...WEEK });
    expect(truck6.pending.map((row) => row.loadId)).toEqual(["TBH--1181", "TBH--1191"]);
    expect(truck6.loadIds).not.toContain("TBH--1181");
    const truck7 = buildOwnerTruckWeek({ ledger: ledgerFor(TRUCKS[6]!), weekly: weeklyFor(TRUCKS[6]!), unitNumber: "7", ...WEEK });
    expect(truck7.pending.map((row) => row.loadId)).toEqual(["TBH--1200", "TBH--1202"]);
    expect(truck7.pending.every((row) => row.reason === "Delivers next week")).toBe(true);
    expect(truck7.loadIds).not.toContain("TBH--1200");
    const truck8 = buildOwnerTruckWeek({ ledger: ledgerFor(TRUCKS[7]!), weekly: weeklyFor(TRUCKS[7]!), weekReport: weekReport(TRUCKS[7]!), unitNumber: "8", ...WEEK });
    expect(truck8.pending).toEqual([{ loadId: "TBH--1201", reason: TONU_RATE_NOTE }]);
    expect(TONU_RATE_NOTE).toBe("TONU rate unconfirmed");
    expect(truck8.loadIds).not.toContain("TBH--1201");
    expect(truck8.loadCount).toBe(5);
    expect(truck8.loads.find((row) => row.loadId === "TBH--1201")?.status).toBe("TONU");
    expect(truck6.loads.find((row) => row.loadId === "TBH--1181")?.status).toBe("Pending");
    expect(SHEET_FEE_DIFFERS).toBe("sheet fee differs");
  });

  it("keeps Week Report MPG when this week's load shares a trip that delivers next week", () => {
    const cells = header();
    const delivered = Array.from({ length: 43 }, () => "");
    delivered[0] = "10/06/2026";
    delivered[1] = "TBH--1199";
    delivered[2] = "$1,000.00";
    delivered[4] = "M-1202";
    delivered[5] = "Yes";
    delivered[15] = "400.00";
    const later = Array.from({ length: 43 }, () => "");
    later[0] = "10/12/2026";
    later[1] = "TBH--1200";
    later[2] = "$1,000.00";
    later[4] = "M-1202";
    const report = weekReport(TRUCKS[6]!);
    report[3]![2] = "$1,000.00";
    report[30]![2] = "7.42";
    const week = buildOwnerTruckWeek({
      ledger: [cells, delivered, later],
      weekly: weeklyFor(TRUCKS[6]!),
      weekReport: report,
      unitNumber: "7",
      ...WEEK,
    });
    expect(week.tripOpen).toBe(true);
    expect(week.mpg).toBe("7.42");
    expect(week.loadIds).toEqual(["TBH--1199"]);
    expect(week.loads.find((row) => row.loadId === "TBH--1200")?.status).toBe("Pending");
  });

  it("leaves MPG blank when the Week Report cell is 0", () => {
    const cells = header();
    const delivered = Array.from({ length: 43 }, () => "");
    delivered[0] = "10/06/2026";
    delivered[1] = "TBH--1180";
    delivered[2] = "$1,000.00";
    delivered[4] = "M-1191";
    delivered[5] = "Yes";
    delivered[15] = "400.00";
    const later = Array.from({ length: 43 }, () => "");
    later[0] = "10/12/2026";
    later[1] = "TBH--1181";
    later[2] = "$1,000.00";
    later[4] = "M-1191";
    const report = weekReport(TRUCKS[5]!);
    report[3]![2] = "$1,000.00";
    report[30]![2] = "0";
    const week = buildOwnerTruckWeek({
      ledger: [cells, delivered, later],
      weekly: weeklyFor(TRUCKS[5]!),
      weekReport: report,
      unitNumber: "6",
      ...WEEK,
    });
    expect(week.tripOpen).toBe(true);
    expect(week.mpg).toBeNull();
  });

  it("shows the TONU sheet placeholder when the rate column is smaller", () => {
    const cells = header();
    const delivered = Array.from({ length: 43 }, () => "");
    delivered[0] = "10/06/2026";
    delivered[1] = "TBH--1178";
    delivered[2] = "$7,900.00";
    delivered[5] = "Yes";
    delivered[15] = "100.00";
    const tonu = Array.from({ length: 43 }, () => "");
    tonu[0] = TBH_1201.deliverySheet;
    tonu[1] = TBH_1201.loadId;
    tonu[6] = TBH_1201.pickupSheet;
    tonu[2] = "$426.33";
    tonu[3] = "TONU";
    tonu[8] = "$2,000.00";
    const week = buildOwnerTruckWeek({
      ledger: [cells, delivered, tonu],
      weekly: weeklyFor(TRUCKS[7]!),
      weekReport: weekReport(TRUCKS[7]!),
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.loads.find((row) => row.loadId === "TBH--1201")?.rateCents).toBe(200_000);
    expect(week.loads.find((row) => row.loadId === "TBH--1201")?.status).toBe("TONU");
    expect(week.grossCents).toBe(790_000);
    expect(week.loadIds).not.toContain("TBH--1201");
  });

  it("reads a TONU above the header, including Load Ledger row 11", () => {
    const cells = header();
    const grid: string[][] = Array.from({ length: 10 }, () => Array.from({ length: 4 }, () => ""));
    grid[10] = [TBH_1201.loadId, "TONU", "Oct 12, 2026", "$2,000.00"];
    grid.push(cells);
    const delivered = Array.from({ length: 43 }, () => "");
    delivered[0] = "10/06/2026";
    delivered[1] = "TBH--1178";
    delivered[2] = "$1,000.00";
    delivered[5] = "Yes";
    delivered[15] = "100.00";
    grid.push(delivered);
    const week = buildOwnerTruckWeek({
      ledger: grid,
      weekly: weeklyFor(TRUCKS[7]!),
      weekReport: weekReport(TRUCKS[7]!),
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.pending).toEqual([{ loadId: "TBH--1201", reason: TONU_RATE_NOTE }]);
    expect(week.loadIds).not.toContain("TBH--1201");
    expect(week.loads.find((row) => row.loadId === "TBH--1201")?.status).toBe("TONU");
  });

  it("counts allocated miles once per trip", () => {
    const cells = header();
    const primary = Array.from({ length: 43 }, () => "");
    primary[0] = "10/08/2026";
    primary[1] = "TBH--1188";
    primary[2] = "$1,800.00";
    primary[4] = "M-1195";
    primary[5] = "Yes";
    primary[12] = "400.00";
    primary[15] = "1165.00";
    const partial = Array.from({ length: 43 }, () => "");
    partial[0] = "10/08/2026";
    partial[1] = "TBH--1192";
    partial[2] = "$1,700.00";
    partial[4] = "M-1195";
    partial[5] = "";
    partial[12] = "765.00";
    partial[15] = "1165.00";
    const week = buildOwnerTruckWeek({
      ledger: [cells, primary, partial],
      weekly: [["Week Start Date", "Driver Compensation"], ["10/05/2026", "$0.00"]],
      ...WEEK,
    });
    expect(week.milesHundredths).toBe(116_500);
    expect(week.loadCount).toBe(2);
    expect(week.grossCents).toBe(350_000);
    expect(week.loads.find((row) => row.loadId === "TBH--1188")?.ledgerMilesHundredths).toBe(40_000);
    expect(week.loads.find((row) => row.loadId === "TBH--1192")?.ledgerMilesHundredths).toBe(76_500);
  });

  it("reads Week Report C28 gallons and a DEF split", () => {
    const grid = weekReport(TRUCKS[2]!);
    grid[27]![2] = "398.320";
    expect(weekReportGallons(grid)).toEqual({ dieselMilli: 398_320, defMilli: null });
    expect(grid[28]![2]).toContain("$");
    const withDef = weekReport(TRUCKS[2]!);
    withDef.push(["DEF gallons", "12.500"]);
    expect(weekReportGallons(withDef).defMilli).toBe(12_500);
    expect(
      fuelLogGallons(
        [
          ["Date", "Item", "Gallons"],
          ["10/06/2026", "ULSD", "100.000"],
          ["10/06/2026", "DEF", "4.250"],
        ],
        WEEK.weekStart,
        WEEK.weekEnd,
      ),
    ).toEqual({ dieselMilli: 100_000, defMilli: 4_250 });
  });

  it("leaves a held TONU deadhead and toll out of week 41 and counts them the week after delivery", () => {
    const ledger = week41TollLedger();
    expect(ledger.find((row) => row[1] === "TBH--1195")?.[44]).toBe("$12.00");
    expect(ledger.some((row) => row[1] === "TBH--1178")).toBe(false);
    const report = weekReport(TRUCKS[7]!);
    report[3]![2] = "$7,900.00";
    report[17]![2] = "241.00";
    report[18]![2] = "2650.00";
    report[29]![14] = "$48.61";
    const weekly = weeklyFor(TRUCKS[7]!);
    weekly[1]![6] = "$48.61";
    const week = buildOwnerTruckWeek({
      ledger,
      weekly,
      weekReport: report,
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.loadIds).toContain("TBH--1195");
    expect(week.loadIds).not.toContain("TBH--1178");
    expect(week.loadIds).not.toContain("TBH--1201");
    expect(week.grossCents).toBe(790_000);
    expect(week.deadheadHundredths).toBe(24_100);
    expect(week.milesHundredths).toBe(265_000);
    expect(week.categories.find((row) => row.category === "Toll fees")?.cents).toBe(4_861);
    expect(week.expenseCents).toBe(TRUCKS[7]!.expenseCents);
    expect(week.netCents).toBe(790_000 - week.expenseCents);
    const week42 = buildOwnerTruckWeek({
      ledger,
      weekly,
      weekReport: null,
      unitNumber: "8",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
    });
    expect(week42.loadIds).not.toContain(TBH_1201.loadId);
    expect(week42.grossCents).toBe(0);
    expect(week42.pending).toEqual([{ loadId: TBH_1201.loadId, reason: TONU_RATE_NOTE }]);
    expect(week42.loads.find((row) => row.loadId === TBH_1201.loadId)?.pickupDay).toBe(TBH_1201.pickupDay);
    expect(week42.deadheadHundredths).toBe(0);
    expect(week42.categories.find((row) => row.category === "Toll fees")?.cents ?? 0).toBe(0);
    const week43 = buildOwnerTruckWeek({
      ledger,
      weekly: [["Week Start Date", "Driver Compensation"], ["10/19/2026", "$0.00"]],
      weekReport: null,
      unitNumber: "8",
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
    });
    expect(week43.loadIds).not.toContain(TBH_1201.loadId);
    expect(week43.grossCents).toBe(0);
    expect(week43.deadheadHundredths).toBe(TBH_1201.deadheadHundredths);
    expect(week43.milesHundredths).toBe(TBH_1201.deadheadHundredths);
    expect(week43.categories.find((row) => row.category === "Toll fees")?.cents).toBe(TBH_1201.tollCents);
  });

  it("does not count the TONU miles twice when the count week already includes them", () => {
    const ledger = week41TollLedger();
    const report = weekReport(TRUCKS[7]!);
    report[17]![2] = "241.00";
    report[18]![2] = "2650.00";
    report[29]![14] = "$48.61";
    const week = buildOwnerTruckWeek({
      ledger,
      weekly: weeklyFor(TRUCKS[7]!),
      weekReport: report,
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.grossCents).toBe(790_000);
    expect(week.loadIds).not.toContain("TBH--1201");
    expect(week.deadheadHundredths).toBe(24_100);
    expect(week.milesHundredths).toBe(265_000);
    expect(week.categories.find((row) => row.category === "Toll fees")?.cents).toBe(4_861);
    expect(week.expenseCents).toBe(TRUCKS[7]!.expenseCents);
    expect(week.netCents).toBe(790_000 - week.expenseCents);
    const countedWeek = Array.from({ length: 32 }, () => Array.from({ length: 15 }, () => ""));
    countedWeek[17]![1] = "Deadhead Miles";
    countedWeek[17]![2] = "10.00";
    countedWeek[18]![1] = "Total Miles";
    countedWeek[18]![2] = "10.00";
    countedWeek[29]![13] = "Toll Fees";
    countedWeek[29]![14] = "$50.00";
    const week43 = buildOwnerTruckWeek({
      ledger,
      weekly: [["Week Start Date", "Driver Compensation", "Toll Fees"], ["10/19/2026", "$0.00", "$50.00"]],
      weekReport: countedWeek,
      unitNumber: "8",
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
    });
    expect(week43.grossCents).toBe(0);
    expect(week43.deadheadHundredths).toBe(TBH_1201.deadheadHundredths);
    expect(week43.milesHundredths).toBe(TBH_1201.deadheadHundredths);
    expect(week43.categories.find((row) => row.category === "Toll fees")?.cents).toBe(TBH_1201.tollCents);
    expect(week43.netCents).toBe(-TBH_1201.tollCents);
  });
});

describe("week report scope", () => {
  it("uses Week # and Year on the live Week Report label", () => {
    const report = [
      ["Week #  >>>", "42.0", "Year >>>", "2026.0"],
      ["Total Revenue", "$100.00"],
    ];
    expect(weekReportApplies(report, "2026-10-05", 10_000, 0)).toBe(false);
    expect(weekReportApplies(report, "2026-10-12", 10_000, 0)).toBe(true);
  });

  it("keeps week 41 totals when the report belongs to week 42", () => {
    const truck = TRUCKS[2]!;
    const report = weekReport(truck);
    report[0]![0] = "Week start";
    report[0]![1] = "10/12/2026";
    report[3]![2] = "$7,250.00";
    report[3]![5] = "$5,185.43";
    expect(weekReportApplies(report, WEEK.weekStart, truck.grossCents, 0)).toBe(false);
    const week = buildOwnerTruckWeek({
      ledger: ledgerFor(truck),
      weekly: weeklyFor(truck),
      weekReport: report,
      unitNumber: "3",
      ...WEEK,
    });
    expect(week.grossCents).toBe(855_000);
    expect(week.expenseCents).toBe(703_660);
    expect(week.netCents).toBe(151_340);
  });

  it("ignores an unlabeled report whose revenue is a different week", () => {
    const truck = TRUCKS[2]!;
    const report = weekReport(truck);
    report[3]![2] = "$7,250.00";
    const week = buildOwnerTruckWeek({
      ledger: ledgerFor(truck),
      weekly: weeklyFor(truck),
      weekReport: report,
      unitNumber: "3",
      ...WEEK,
    });
    expect(week.grossCents).toBe(truck.grossCents);
    expect(week.netCents).toBe(truck.netCents);
    expect(week.mpg).toBeNull();
    expect(week.appliedWeekReport).toBeNull();
  });

  it("keeps sheet driver pay that already includes tarps and leaves a later delivery out", () => {
    const header = Array.from({ length: TARP_COLUMN_BC + 1 }, () => "");
    header[0] = "Delivery Date";
    header[1] = "Load ID";
    header[2] = "Rate";
    header[TARP_COLUMN_BC] = "Tarps";
    const load = (day: string, id: string, rate: string, tarp: string) => {
      const row = Array.from({ length: TARP_COLUMN_BC + 1 }, () => "");
      row[0] = day;
      row[1] = id;
      row[2] = rate;
      row[TARP_COLUMN_BC] = tarp;
      return row;
    };
    const ledger = [
      header,
      load("10/13/2026", "TBH--1206", "$1,750.00", "$50.00"),
      load("10/14/2026", "TBH--1209", "$1,200.00", ""),
      load("10/19/2026", "TBH--1225", "$900.00", "$50.00"),
    ];
    const weekly = [
      ["Week Start Date", "Driver Compensation"],
      ["10/12/2026", "$640.00"],
    ];
    const week = buildOwnerTruckWeek({
      ledger,
      weekly,
      weekReport: null,
      unitNumber: "8",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
    });
    expect(week.loadIds).toEqual(["TBH--1206", "TBH--1209"]);
    expect(week.loads.find((load) => load.loadId === "TBH--1206")?.tarpCents).toBe(5_000);
    expect(week.loads.find((load) => load.loadId === "TBH--1209")?.tarpCents).toBe(0);
    expect(week.loads.some((load) => load.loadId === "TBH--1225" && load.status === "Delivered")).toBe(false);
    expect(week.grossCents).toBe(295_000);
    expect(week.categories.find((row) => row.category === "Driver compensation")?.cents).toBe(64_000);
    expect(week.categories.find((row) => row.category === "Tarps")).toBeUndefined();
    expect(week.expenseCents).toBe(64_000);
    expect(week.netCents).toBe(week.grossCents - week.expenseCents);
  });
});

describe("live weekly expense headers", () => {
  it("reads Truck 8 week 42 from the live column names and matches the sheet total", () => {
    const width = 55;
    const header = Array.from({ length: width }, () => "");
    header[0] = "Pickup Date";
    header[1] = "Delivery Date";
    header[5] = "Load ID";
    header[16] = "Rate";
    header[44] = "Toll Expense";
    header[52] = "Status";
    header[54] = "Tarps";
    const load = (day: string, id: string, rate: string, status: string, tarp: string, toll: string, pickup = "") => {
      const row = Array.from({ length: width }, () => "");
      row[0] = pickup;
      row[1] = day;
      row[5] = id;
      row[16] = rate;
      row[44] = toll;
      row[52] = status;
      row[54] = tarp;
      return row;
    };
    const ledger = [
      ["Legacy Inc Global | Operational Log — T008"],
      ["YELLOW = type."],
      ["Truck ID", "T008", "Truck #", "8"],
      ["Primary Driver", "Brison"],
      header,
      load(TBH_1201.deliverySheet, TBH_1201.loadId, "$250.00", "TONU", "", "$50.00", TBH_1201.pickupSheet),
      load("10/12/2026", "TBH--1203", "$1,600.00", "Delivered", "$50.00", "$32.36"),
      load("10/14/2026", "TBH--1207", "$1,750.00", "Delivered", "", "$21.21"),
      load("10/14/2026", "TBH--1212", "$2,000.00", "Delivered", "$50.00", ""),
      load("10/15/2026", "TBH--1217", "$150.00", "TONU", "", ""),
      load("10/17/2026", "TBH--1218", "$5,000.00", "Delivered", "$50.00", ""),
    ];
    expect(ledger[4]?.[5]).toBe("Load ID");
    expect(ledger[4]?.[16]).toBe("Rate");
    const weekly = [
      [
        "Week Start Date",
        "Driver Compensation",
        "Total Fees (Legacy+Tolson)",
        "Dispatch Fee",
        "Factoring Fee",
        "Legacy Fee",
        "Tolson Fee",
        "ELD Fee",
        "Toll Fees",
        "Toll Pass",
        "Yard Fee",
        "GPS Tracker",
        "Insurance",
        "Truck Pymts",
        "Trailer Pymts",
        "Fuel",
        "Other (manual)",
      ],
      [
        "10/12/2026",
        "$2,300.00",
        "$1,935.00",
        "$537.50",
        "188.125",
        "$1,075.00",
        "$860.00",
        "$47.25",
        "$103.57",
        "$5.49",
        "$12.93",
        "$8.50",
        "$288.71",
        "$380.78",
        "$66.45",
        "$2,349.55",
        "$100.00",
      ],
    ];
    const week = buildOwnerTruckWeek({
      ledger,
      weekly,
      weekReport: null,
      unitNumber: "8",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
    });
    expect(week.grossCents).toBe(1_035_000);
    expect(week.loads.find((row) => row.loadId === "TBH--1207")?.tarpCents).toBe(0);
    expect(week.loads.find((row) => row.loadId === "TBH--1203")?.tarpCents).toBe(5_000);
    expect(week.categories.find((row) => row.category === "Management fee")?.cents).toBe(186_300);
    expect(week.warnings.join(" ")).toContain("Sheet fee is $1,935.00");
    expect(week.categories.find((row) => row.category === "Other (manual)")?.cents).toBe(10_000);
    expect(week.categories.find((row) => row.category === "Factoring fee")?.cents).toBe(18_813);
    expect(week.categories.find((row) => row.category === "Toll fees")?.cents).toBe(10_357);
    expect(week.categories.find((row) => row.category === "Tarps")).toBeUndefined();
    expect(week.expenseCents).toBe(825_186);
    expect(week.netCents).toBe(209_814);
    expect(week.netCents).toBe(week.grossCents - week.expenseCents);
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly,
      note: null,
    });
    expect(row.netCents).toBe(week.netCents);
    const statement = applySheetWeek(
      percentFeeStatement({ unitNumber: "8", grossCents: row.insCents, weekStart: "2026-10-12" }),
      row,
    );
    expect(statement.netCents).toBe(week.netCents);
    expect(statement.lines.find((line) => line.lineCode === "DRIVER_PAY")?.label).toBe("Driver pay (incl. tarps)");
    expect(statement.lines.some((line) => line.lineCode === "TARPS")).toBe(false);
    expect(statement.managementFeeCents).toBe(186_300);
    expect(statement.legacyRetainedCents).toBe(103_500);
    expect(statement.tolsonPayableCents).toBe(82_800);
    expect(statement.legacyRetainedCents + statement.tolsonPayableCents).toBe(statement.managementFeeCents);
    const asset = buildAssetReport({
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      unitNumber: "8",
      ownerName: null,
      ledger,
      weekly,
      fuelLog: null,
      fleet: null,
      sheetNote: null,
    });
    expect(asset.expenseCents).toBe(week.expenseCents);
    expect(asset.netCents).toBe(week.netCents);
    expect(asset.leftExpenses.find((line) => line.label.startsWith("Management"))?.cents).toBe(186_300);
    expect(asset.rightExpenses.find((line) => line.label === "Other (manual)")?.cents).toBe(10_000);
    expect(asset.leftExpenses.some((line) => line.label === "Tarps")).toBe(false);
  });

  it("reads Week Report factoring from the rounded-cents label, not the MPG cell", () => {
    const grid = Array.from({ length: 32 }, () => Array.from({ length: 16 }, () => ""));
    grid[22]![2] = "6.34";
    grid[30]![1] = "Avg MPG";
    grid[30]![2] = "6.34";
    grid[22]![13] = "Total Fees (Legacy+Tolson)";
    grid[22]![14] = "$1,377.00";
    grid[24]![13] = "Factoring Fee (rounded to cents)";
    grid[24]![14] = "188.125";
    grid[24]![15] = "$9.00";
    const money = readWeekReportMoney(grid);
    expect(money.factoringCents).toBe(18_813);
    expect(money.managementCents).toBe(137_700);
    const unlabeled = Array.from({ length: 32 }, () => Array.from({ length: 3 }, () => ""));
    unlabeled[22]![2] = "6.34";
    expect(readWeekReportMoney(unlabeled).factoringCents).toBeNull();
    const zero = Array.from({ length: 32 }, () => Array.from({ length: 16 }, () => ""));
    zero[24]![13] = "Factoring Fee";
    zero[24]![14] = "0";
    zero[24]![15] = "$9.00";
    expect(readWeekReportMoney(zero).factoringCents).toBe(0);
  });

  it("uses the calculated split and warns when Legacy and Tolson do not add up to H", () => {
    const week = buildOwnerTruckWeek({
      ledger: [
        ["Delivery Date", "Load ID", "Rate"],
        ["10/06/2026", "TBH--1", "$1,000.00"],
      ],
      weekly: [
        ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)", "Legacy Fee", "Tolson Fee"],
        ["10/05/2026", "$0.00", "$180.00", "$100.00", "$50.00"],
      ],
      weekReport: null,
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.categories.find((row) => row.category === "Management fee")?.cents).toBe(18_000);
    expect(week.warnings).toEqual(["Legacy plus Tolson doesn't equal H."]);
    expect(week.feeSplit).toEqual({ legacyFeeCents: 10_000, tolsonFeeCents: 8_000 });
    const ledger = [
      ["Delivery Date", "Load ID", "Rate"],
      ["10/06/2026", "TBH--1", "$1,000.00"],
    ];
    const weekly = [
      ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)", "Legacy Fee", "Tolson Fee"],
      ["10/05/2026", "$0.00", "$180.00", "$100.00", "$50.00"],
    ];
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly,
      note: null,
    });
    expect(row.note).toContain("Legacy plus Tolson doesn't equal H.");
    expect(row.feeSplit).toEqual({ legacyFeeCents: 10_000, tolsonFeeCents: 8_000 });
    const statement = applySheetWeek(
      percentFeeStatement({ unitNumber: "8", grossCents: row.insCents, weekStart: WEEK.weekStart }),
      row,
    );
    expect(statement.legacyRetainedCents).toBe(10_000);
    expect(statement.tolsonPayableCents).toBe(8_000);
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
    expect(asset.notes.join(" ")).toContain("Legacy plus Tolson doesn't equal H.");
    const missing = buildOwnerTruckWeek({
      ledger: [
        ["Delivery Date", "Load ID", "Rate"],
        ["10/06/2026", "TBH--1", "$1,000.00"],
      ],
      weekly: [
        ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)"],
        ["10/05/2026", "$0.00", "$180.00"],
      ],
      weekReport: null,
      unitNumber: "8",
      ...WEEK,
    });
    expect(missing.warnings).toEqual([]);
    expect(missing.feeSplit).toEqual({ legacyFeeCents: 10_000, tolsonFeeCents: 8_000 });
  });

  it("counts only the weekly escrow, not the Escrow Balance, on the owner week, the statement, and the asset report", () => {
    const ledger = [
      ["Delivery Date", "Load ID", "Rate"],
      ["10/06/2026", "TBH--1", "$1,000.00"],
    ];
    const weekly = [
      ["Week Start Date", "Driver Compensation", "Maintenance Escrow Weekly", "Escrow Balance"],
      ["10/05/2026", "$200.00", "$7.00", "$25.00"],
    ];
    const week = buildOwnerTruckWeek({ ledger, weekly, weekReport: null, unitNumber: "8", ...WEEK });
    expect(week.categories.find((row) => row.category === "Maintenance Escrow Weekly")?.cents).toBe(700);
    expect(week.expenseCents).toBe(20_700);
    expect(week.netCents).toBe(week.grossCents - week.expenseCents);
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly,
      note: null,
    });
    const statement = applySheetWeek(
      percentFeeStatement({ unitNumber: "8", grossCents: row.insCents, weekStart: WEEK.weekStart }),
      row,
    );
    expect(statement.netCents).toBe(week.netCents);
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
    expect(asset.rightExpenses.find((line) => line.label === "Maintenance Escrow Weekly")?.cents).toBe(700);
    expect(asset.escrowBalanceCents).toBe(2_500);
    expect(asset.expenseCents).toBe(week.expenseCents);
    expect(asset.netCents).toBe(week.netCents);
  });

  it("warns when a filled Weekly Expenses cell cannot be read and does not count it as zero", () => {
    const ledger = [
      ["Delivery Date", "Load ID", "Rate"],
      ["10/06/2026", "TBH--1", "$100.00"],
    ];
    const weekly = [
      ["Week Start Date", "Driver Compensation", "Fuel"],
      ["10/05/2026", "$10.00", "21474836.48"],
    ];
    const week = buildOwnerTruckWeek({ ledger, weekly, weekReport: null, unitNumber: "8", ...WEEK });
    expect(week.categories.find((row) => row.category === "Fuel")).toBeUndefined();
    expect(week.warnings[0]).toContain("Fuel");
    expect(week.warnings[0]).toContain("Net leaves that line out until it is fixed");
    expect(week.warnings[0]).not.toContain("not counted as $0");
    expect(week.netCents).toBe(week.grossCents - 1_000);
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly,
      note: null,
    });
    expect(row.note).toContain("Net leaves that line out until it is fixed");
    expect(row.unreadExpenses).toEqual(["Fuel"]);
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
    expect(asset.notes.join(" ")).toContain("Net leaves that line out until it is fixed");
    expect(asset.netCents).toBe(week.netCents);
  });

  it("treats a sheet zero as zero and does not block the week", () => {
    const ledger = [
      ["Delivery Date", "Load ID", "Rate"],
      ["10/06/2026", "TBH--1", "$100.00"],
    ];
    const weekly = [
      ["Week Start Date", "Driver Compensation", "Fuel"],
      ["10/05/2026", "$10.00", "$ -"],
    ];
    const week = buildOwnerTruckWeek({ ledger, weekly, weekReport: null, unitNumber: "8", ...WEEK });
    expect(week.unreadExpenses).toEqual([]);
    expect(week.categories.find((row) => row.category === "Fuel")).toBeUndefined();
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly,
      note: null,
    });
    expect(unreadExpenseBlockers([row])).toEqual([]);
  });

  it("warns when a filled Week Report factoring cell cannot be read and keeps the weekly amount", () => {
    const ledger = [
      ["Delivery Date", "Load ID", "Rate"],
      ["10/06/2026", "TBH--1", "$1,000.00"],
    ];
    const weekly = [
      ["Week Start Date", "Driver Compensation", "Factoring Fee"],
      ["10/05/2026", "$0.00", "$10.00"],
    ];
    const weekReport = [
      ["Week start", "10/05/2026"],
      ["Total Revenue", "$1,000.00"],
      ["Factoring Fee", "not-a-fee", "$1.00"],
    ];
    const week = buildOwnerTruckWeek({ ledger, weekly, weekReport, unitNumber: "8", ...WEEK });
    expect(week.categories.find((row) => row.category === "Factoring fee")?.cents).toBe(1_000);
    expect(week.warnings.join(" ")).toContain("Week Report Factoring Fee could not be read");
  });

  it("counts a confirmed TONU in gross and leaves an unconfirmed TONU out", () => {
    const ledger = [
      ["Delivery Date", "Load ID", "Rate", "Status"],
      ["10/13/2026", "TBH--1203", "$1,000.00", "Delivered"],
      ["10/12/2026", "TBH--1201", "$250.00", "TONU"],
      ["10/15/2026", "TBH--1217", "$150.00", "TONU"],
    ];
    const weekly = [
      ["Week Start Date", "Driver Compensation"],
      ["10/12/2026", "$0.00"],
    ];
    const confirmed = { "TBH--1201": 25_000 };
    const input = {
      ledger,
      weekly,
      weekReport: null,
      unitNumber: "8",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      confirmedCentsByLoadId: confirmed,
    };
    const owner = buildOwnerTruckWeek(input);
    expect(owner.grossCents).toBe(125_000);
    expect(owner.loadIds).toContain("TBH--1201");
    expect(owner.loadIds).not.toContain("TBH--1217");
    expect(owner.loads.find((load) => load.loadId === "TBH--1217")?.reason).toBe(TONU_RATE_NOTE);
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly,
      note: null,
      confirmedCentsByLoadId: confirmed,
    });
    const statement = applySheetWeek(
      percentFeeStatement({ unitNumber: "8", grossCents: row.insCents, weekStart: "2026-10-12" }),
      row,
    );
    const asset = buildAssetReport({
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      unitNumber: "8",
      ownerName: null,
      ledger,
      weekly,
      fuelLog: null,
      fleet: null,
      sheetNote: null,
      confirmedCentsByLoadId: confirmed,
    });
    expect(row.insCents).toBe(owner.grossCents);
    expect(statement.grossCents).toBe(owner.grossCents);
    expect(asset.grossCents).toBe(owner.grossCents);
    expect(statement.netCents).toBe(owner.netCents);
    expect(asset.netCents).toBe(owner.netCents);
    const deliveredFleet = 3_500_000;
    const confirmedTonu = 25_000 + 25_000;
    const unconfirmedTonu = 15_000;
    expect(deliveredFleet + confirmedTonu).toBe(3_550_000);
    expect(deliveredFleet + confirmedTonu + unconfirmedTonu).toBe(3_565_000);
  });

  it("counts confirmed TBH--1201 once, in week 42, with its toll and deadhead", () => {
    const confirmed = { [TBH_1201.loadId]: TBH_1201.rateCents };
    const ledger = [
      ["Delivery Date", "Pickup Date", "Load ID", "Rate", "Status", "Toll Expense", "Alloc Deadhead"],
      ["10/06/2026", "", "TBH--1178", "$1,000.00", "Delivered", "", ""],
      [TBH_1201.deliverySheet, TBH_1201.pickupSheet, TBH_1201.loadId, "$2,000.00", "TONU", "$50.00", "10.00"],
    ];
    const weekly41 = [
      ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)"],
      ["10/05/2026", "$0.00", "$180.00"],
    ];
    const week41 = { weekStart: "2026-10-05", weekEnd: "2026-10-11" };
    const owner41 = buildOwnerTruckWeek({
      ledger,
      weekly: weekly41,
      weekReport: null,
      unitNumber: "8",
      ...week41,
      confirmedCentsByLoadId: confirmed,
    });
    const row41 = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      ...week41,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly41,
      note: null,
      confirmedCentsByLoadId: confirmed,
    });
    const statement41 = applySheetWeek(
      percentFeeStatement({ unitNumber: "8", grossCents: row41.insCents, weekStart: week41.weekStart }),
      row41,
    );
    const asset41 = buildAssetReport({
      ...week41,
      unitNumber: "8",
      ownerName: null,
      ledger,
      weekly: weekly41,
      fuelLog: null,
      fleet: null,
      sheetNote: null,
      confirmedCentsByLoadId: confirmed,
    });
    const fee41 = owner41.categories.find((row) => row.category === "Management fee")?.cents;
    expect(owner41.grossCents).toBe(100_000);
    expect(owner41.loadIds).toEqual(["TBH--1178"]);
    expect(owner41.loadIds).not.toContain(TBH_1201.loadId);
    expect(fee41).toBe(18_000);
    expect(row41.insCents).toBe(owner41.grossCents);
    expect(statement41.grossCents).toBe(owner41.grossCents);
    expect(statement41.managementFeeCents).toBe(fee41);
    expect(asset41.grossCents).toBe(owner41.grossCents);
    expect(asset41.leftExpenses.find((line) => line.label.startsWith("Management"))?.cents).toBe(fee41);

    const week42 = { weekStart: "2026-10-12", weekEnd: "2026-10-18" };
    const owner42 = buildOwnerTruckWeek({
      ledger,
      weekly: [["Week Start Date", "Driver Compensation"], ["10/12/2026", "$0.00"]],
      weekReport: null,
      unitNumber: "8",
      ...week42,
      confirmedCentsByLoadId: confirmed,
    });
    const row42 = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      ...week42,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: [["Week Start Date", "Driver Compensation"], ["10/12/2026", "$0.00"]],
      note: null,
      confirmedCentsByLoadId: confirmed,
    });
    expect(owner42.grossCents).toBe(TBH_1201.rateCents);
    expect(owner42.loadIds).toEqual([TBH_1201.loadId]);
    expect(owner42.deadheadHundredths).toBe(TBH_1201.deadheadHundredths);
    expect(owner42.categories.find((row) => row.category === "Toll fees")?.cents).toBe(TBH_1201.tollCents);
    expect(row42.insCents).toBe(TBH_1201.rateCents);
    const statement42 = applySheetWeek(
      percentFeeStatement({ unitNumber: "8", grossCents: row42.insCents, weekStart: week42.weekStart }),
      row42,
    );
    const asset42 = buildAssetReport({
      ...week42,
      unitNumber: "8",
      ownerName: null,
      ledger,
      weekly: [["Week Start Date", "Driver Compensation"], ["10/12/2026", "$0.00"]],
      fuelLog: null,
      fleet: null,
      sheetNote: null,
      confirmedCentsByLoadId: confirmed,
    });
    expect(statement42.grossCents).toBe(owner42.grossCents);
    expect(asset42.grossCents).toBe(owner42.grossCents);
    expect(owner42.fees.managementFeeCents).toBe(4_500);
    expect(statement42.netCents).toBe(owner42.netCents);
    expect(asset42.netCents).toBe(owner42.netCents);
    expect(asset42.deadheadMilesHundredths).toBe(TBH_1201.deadheadHundredths);
    const counted =
      (owner41.loadIds.includes(TBH_1201.loadId) ? TBH_1201.rateCents : 0) +
      (owner42.loadIds.includes(TBH_1201.loadId) ? TBH_1201.rateCents : 0);
    expect(counted).toBe(TBH_1201.rateCents);

    const included = buildOwnerTruckWeek({
      ledger,
      weekly: [["Week Start Date", "Driver Compensation"], ["10/12/2026", "$0.00"]],
      weekReport: [
        ["Week start", "10/12/2026"],
        ["Total Revenue", "$250.00"],
      ],
      unitNumber: "8",
      ...week42,
      confirmedCentsByLoadId: confirmed,
    });
    expect(included.grossCents).toBe(TBH_1201.rateCents);
    expect(included.tonuReportBlocks).toEqual([]);
    const omitted = buildOwnerTruckWeek({
      ledger,
      weekly: [["Week Start Date", "Driver Compensation"], ["10/12/2026", "$0.00"]],
      weekReport: [
        ["Week start", "10/12/2026"],
        ["Total Revenue", "$0.00"],
      ],
      unitNumber: "8",
      ...week42,
      confirmedCentsByLoadId: confirmed,
    });
    expect(omitted.grossCents).toBe(TBH_1201.rateCents);
    expect(omitted.tonuReportBlocks).toEqual([
      { loadId: TBH_1201.loadId, message: tonuReportOmittedMessage(TBH_1201.loadId) },
    ]);
    expect(tonuReportBlockers([
      buildTruckWeekInsOuts({
        unitNumber: "8",
        truckName: "Truck 8",
        ...week42,
        loadLedger: ledger,
        mgmtExpenses: null,
        weeklyExpenses: [["Week Start Date", "Driver Compensation"], ["10/12/2026", "$0.00"]],
        weekReport: [
          ["Week start", "10/12/2026"],
          ["Total Revenue", "$0.00"],
        ],
        note: null,
        confirmedCentsByLoadId: confirmed,
      }),
    ])[0]?.message).toContain(TBH_1201.loadId);
  });

  it("does not warn that Legacy plus Tolson misses H when H is absent", () => {
    const week = buildOwnerTruckWeek({
      ledger: [
        ["Delivery Date", "Load ID", "Rate"],
        ["10/06/2026", "TBH--1", "$1,000.00"],
      ],
      weekly: [
        ["Week Start Date", "Driver Compensation", "Legacy Fee", "Tolson Fee"],
        ["10/05/2026", "$0.00", "$100.00", "$80.00"],
      ],
      weekReport: null,
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.warnings.join(" ")).not.toContain("Legacy plus Tolson doesn't equal H");
  });

  it("uses the calculated fee when the Week Report management fee differs from a matching H", () => {
    const week = buildOwnerTruckWeek({
      ledger: [
        ["Delivery Date", "Load ID", "Rate"],
        ["10/06/2026", "TBH--1", "$1,000.00"],
      ],
      weekly: [
        ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)"],
        ["10/05/2026", "$0.00", "$180.00"],
      ],
      weekReport: [
        ["Week start", "10/05/2026"],
        ["Total Revenue", "$1,000.00"],
        ["Total Fees (Legacy+Tolson)", "$50.00"],
      ],
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.categories.find((row) => row.category === "Management fee")?.cents).toBe(18_000);
    expect(week.warnings.join(" ")).toContain("Week Report management fee is $50.00");
  });

  it("warns when a Week Report Tolson Fee cell cannot be read", () => {
    const week = buildOwnerTruckWeek({
      ledger: [
        ["Delivery Date", "Load ID", "Rate"],
        ["10/06/2026", "TBH--1", "$1,000.00"],
      ],
      weekly: [
        ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)", "Tolson Fee"],
        ["10/05/2026", "$0.00", "$180.00", "$80.00"],
      ],
      weekReport: [
        ["Week start", "10/05/2026"],
        ["Total Revenue", "$1,000.00"],
        ["Tolson Fee", "bad-fee"],
      ],
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.warnings.join(" ")).toContain("Week Report Tolson Fee could not be read");
    expect(week.feeSplit.tolsonFeeCents).toBe(8_000);
  });

  it("warns when a Week Report Legacy Fee cell cannot be read", () => {
    const week = buildOwnerTruckWeek({
      ledger: [
        ["Delivery Date", "Load ID", "Rate"],
        ["10/06/2026", "TBH--1", "$1,000.00"],
      ],
      weekly: [
        ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)", "Legacy Fee"],
        ["10/05/2026", "$0.00", "$180.00", "$100.00"],
      ],
      weekReport: [
        ["Week start", "10/05/2026"],
        ["Total Revenue", "$1,000.00"],
        ["Legacy Fee", "bad-fee"],
      ],
      unitNumber: "8",
      ...WEEK,
    });
    expect(week.warnings.join(" ")).toContain("Week Report Legacy Fee could not be read");
    expect(week.feeSplit.legacyFeeCents).toBe(10_000);
  });

  it("blocks a labeled Week Report that counts confirmed TBH--1201 in the wrong week", () => {
    const confirmed = { [TBH_1201.loadId]: TBH_1201.rateCents, "TBH--1221": 25_000 };
    const weekly = (start: string) => [
      ["Week Start Date", "Driver Compensation"],
      [start, "$0.00"],
    ];
    const report = (start: string, revenue: string) => [
      ["Week start", start],
      ["Total Revenue", revenue],
    ];
    const ledger42 = [
      ["Delivery Date", "Pickup Date", "Load ID", "Rate", "Status"],
      ["10/13/2026", "", "TBH--1203", "$35,000.00", ""],
      [TBH_1201.deliverySheet, TBH_1201.pickupSheet, TBH_1201.loadId, "$250.00", "TONU"],
      ["10/14/2026", "10/14/2026", "TBH--1221", "$250.00", "TONU"],
      ["10/15/2026", "10/14/2026", "TBH--1217", "$150.00", "TONU"],
    ];
    const week42 = buildOwnerTruckWeek({
      ledger: ledger42,
      weekly: weekly("10/12/2026"),
      weekReport: report("10/12/2026", "$35,650.00"),
      unitNumber: "8",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      confirmedCentsByLoadId: confirmed,
    });
    expect(week42.grossCents).toBe(3_550_000);
    expect(week42.loadIds).toContain(TBH_1201.loadId);
    expect(week42.loadIds).not.toContain("TBH--1217");
    expect(week42.tonuReportBlocks).toEqual([]);

    const ledger41 = [
      ["Delivery Date", "Pickup Date", "Load ID", "Rate", "Status"],
      ["10/08/2026", "", "TBH--1195", "$35,250.00", ""],
      [TBH_1201.deliverySheet, TBH_1201.pickupSheet, TBH_1201.loadId, "$250.00", "TONU"],
      ["10/15/2026", "10/14/2026", "TBH--1217", "$150.00", "TONU"],
    ];
    const week41 = buildOwnerTruckWeek({
      ledger: ledger41,
      weekly: weekly("10/05/2026"),
      weekReport: report("10/05/2026", "$35,650.00"),
      unitNumber: "8",
      ...WEEK,
      confirmedCentsByLoadId: confirmed,
    });
    expect(week41.grossCents).toBe(3_525_000);
    expect(week41.loadIds).not.toContain(TBH_1201.loadId);
    expect(week41.tonuReportBlocks).toEqual([
      { loadId: TBH_1201.loadId, message: tonuReportIncludedMessage(TBH_1201.loadId) },
    ]);
    const once =
      (week41.loadIds.includes(TBH_1201.loadId) ? TBH_1201.rateCents : 0) +
      (week42.loadIds.includes(TBH_1201.loadId) ? TBH_1201.rateCents : 0);
    expect(once).toBe(TBH_1201.rateCents);
  });

  it("keeps the live week 41, 42, and 43 gross and net", () => {
    const confirmed = { [TBH_1201.loadId]: TBH_1201.rateCents, "TBH--1221": 25_000 };
    const sheetDate = (iso: string) => {
      const [year, month, day] = iso.split("-");
      return `${month}/${day}/${year}`;
    };
    const deliveryFor = (weekStart: string) =>
      weekStart === "2026-10-05" ? "2026-10-06" : weekStart === "2026-10-12" ? "2026-10-13" : "2026-10-20";
    const engine = (
      unit: string,
      weekStart: string,
      weekEnd: string,
      grossCents: number,
      expenseCents: number,
      tonus: { id: string; cents: number; day: string }[] = [],
      sheetFeeCents?: number,
    ) => {
      const tonuCents = tonus.reduce((sum, row) => sum + row.cents, 0);
      const delivered = grossCents - tonuCents;
      const fee = managementFeeSplit(grossCents, seededFeeRates(unit)).managementFeeCents;
      const fuel = expenseCents - fee;
      const ledger: string[][] = [["Delivery Date", "Load ID", "Rate", "Status"]];
      if (delivered > 0) ledger.push([sheetDate(deliveryFor(weekStart)), `TBH--${unit}0`, dollars(delivered), ""]);
      for (const tonu of tonus) ledger.push([tonu.day, tonu.id, dollars(tonu.cents), "TONU"]);
      const week = buildOwnerTruckWeek({
        ledger,
        weekly: [
          ["Week Start Date", "Driver Compensation", "Total Fees (Legacy+Tolson)", "Fuel"],
          [sheetDate(weekStart), "$0.00", dollars(sheetFeeCents ?? fee), dollars(fuel)],
        ],
        weekReport: null,
        unitNumber: unit,
        weekStart,
        weekEnd,
        confirmedCentsByLoadId: confirmed,
      });
      return { gross: week.grossCents, expenses: week.expenseCents, net: week.netCents };
    };
    const sum = (rows: Array<{ gross: number; expenses: number; net: number }>) =>
      rows.reduce(
        (total, row) => ({
          gross: total.gross + row.gross,
          expenses: total.expenses + row.expenses,
          net: total.net + row.net,
        }),
        { gross: 0, expenses: 0, net: 0 },
      );
    const week41 = sum([
      engine("1", "2026-10-05", "2026-10-11", 0, 72_945),
      engine("2", "2026-10-05", "2026-10-11", 0, 78_292),
      engine("3", "2026-10-05", "2026-10-11", 855_000, 699_385),
      engine("4", "2026-10-05", "2026-10-11", 250_000, 537_110),
      engine("5", "2026-10-05", "2026-10-11", 860_000, 569_872),
      engine("6", "2026-10-05", "2026-10-11", 200_000, 345_543),
      engine("7", "2026-10-05", "2026-10-11", 470_000, 496_942),
      engine("8", "2026-10-05", "2026-10-11", 790_000, 631_084),
      engine("9", "2026-10-05", "2026-10-11", 0, 0),
      engine("10", "2026-10-05", "2026-10-11", 0, 0),
    ]);
    const week42 = sum([
      engine("1", "2026-10-12", "2026-10-18", 0, 72_945),
      engine("2", "2026-10-12", "2026-10-18", 0, 88_841),
      engine("3", "2026-10-12", "2026-10-18", 725_000, 565_329),
      engine("4", "2026-10-12", "2026-10-18", 175_000, 394_789),
      engine("5", "2026-10-12", "2026-10-18", 0, 233_758),
      engine("6", "2026-10-12", "2026-10-18", 875_000, 740_109, [{ id: "TBH--1221", cents: 25_000, day: "10/15/2026" }]),
      engine("7", "2026-10-12", "2026-10-18", 715_000, 668_196),
      engine("8", "2026-10-12", "2026-10-18", 1_060_000, 829_686, [
        { id: TBH_1201.loadId, cents: TBH_1201.rateCents, day: TBH_1201.deliverySheet },
      ], 193_500),
      engine("9", "2026-10-12", "2026-10-18", 0, 0),
      engine("10", "2026-10-12", "2026-10-18", 0, 0),
    ]);
    const week43 = sum([
      engine("1", "2026-10-19", "2026-10-25", 0, 0),
      engine("2", "2026-10-19", "2026-10-25", 0, 97_470),
      engine("3", "2026-10-19", "2026-10-25", 707_000, 544_661),
      engine("4", "2026-10-19", "2026-10-25", 925_000, 745_555),
      engine("5", "2026-10-19", "2026-10-25", 1_007_500, 804_023),
      engine("6", "2026-10-19", "2026-10-25", 805_000, 690_723),
      engine("7", "2026-10-19", "2026-10-25", 300_000, 289_155),
      engine("8", "2026-10-19", "2026-10-25", 765_000, 668_439),
      engine("9", "2026-10-19", "2026-10-25", 0, 0),
      engine("10", "2026-10-19", "2026-10-25", 0, 0),
    ]);
    expect(week41).toEqual({ gross: 3_425_000, expenses: 3_431_173, net: -6_173 });
    expect(week42).toEqual({ gross: 3_550_000, expenses: 3_593_653, net: -43_653 });
    expect(week43).toEqual({ gross: 4_509_500, expenses: 3_840_026, net: 669_474 });
  });

  it("blocks Close and the PDF while a Weekly Expenses cell cannot be read", () => {
    const ledger = [
      ["Delivery Date", "Load ID", "Rate"],
      ["10/06/2026", "TBH--1", "$100.00"],
    ];
    const weekly = [
      ["Week Start Date", "Driver Compensation", "Fuel"],
      ["10/05/2026", "$10.00", "21474836.48"],
    ];
    const row = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: weekly,
      note: null,
    });
    const blockers = unreadExpenseBlockers([row]);
    expect(blockers).toEqual([
      {
        rule: "sheet_cell_unreadable",
        message:
          "Truck 8: Weekly Expenses Fuel could not be read or is over the cap. Net leaves that line out until it is fixed.",
        ref: "8",
      },
    ]);
    const fixed = buildTruckWeekInsOuts({
      unitNumber: "8",
      truckName: "Truck 8",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: null,
      weeklyExpenses: [
        ["Week Start Date", "Driver Compensation", "Fuel"],
        ["10/05/2026", "$10.00", "$1.00"],
      ],
      note: null,
    });
    expect(unreadExpenseBlockers([fixed])).toEqual([]);
    expect(() =>
      lockPayload({
        weekStart: WEEK.weekStart,
        weekEnd: WEEK.weekEnd,
        units: [],
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
        blockers,
        warnings: [],
        closeAllowed: blockers.length === 0,
      }),
    ).toThrow(/blockers/);
  });
});

describe("fuel log headers", () => {
  it("finds Date and Gallons by name below a title row", () => {
    const grid = [
      ["Truck 3 Fuel Log"],
      ["Card", "00003"],
      ["Trans Date", "Location", "Load ID", "Trip Group ID", "Qty", "Total Cost"],
      ["10/05/2026", "MONACA PA", "TBH--1178", "M-1178", "39.440", "313.84"],
    ];
    const index = findFuelLogHeader(grid);
    expect(index).toBe(2);
    const located = locateFuelLogColumns(grid[index] ?? []);
    expect(located.ok).toBe(true);
  });
});

describe("daily check sheet compare", () => {
  it("lists a truck when imported fuel does not match the sheet", () => {
    const summary = compareDailyCheck({
      sheet: [
        {
          unitNumber: "3",
          loads: [{ loadId: "TBH--1178", grossCents: 855_000 }],
          grossCents: 855_000,
          fuelCents: 156_430,
          tollCents: 64_213,
        },
      ],
      loads: [{ unitNumber: "3", loadId: "TBH--1178", grossCents: 855_000, cancelled: false }],
      fuel: [],
      tolls: [{ unitNumber: "3", amountCents: 64_213 }],
    });
    expect(summary.truckMismatches.some((line) => line.includes("Truck 3 fuel"))).toBe(true);
    expect(summary.loadsNew).toBe(0);
  });
});
