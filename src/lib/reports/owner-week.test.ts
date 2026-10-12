import { describe, expect, it } from "vitest";
import { centsPerLoadedMile } from "@/lib/reports/format";
import { buildOwnerTruckWeek, SHEET_FEE_DIFFERS, TONU_RATE_NOTE } from "@/lib/reports/owner-week";
import { findFuelLogHeader, locateFuelLogColumns } from "@/lib/fuel-tolls/file/sheet-columns";
import { compareDailyCheck } from "@/lib/reports/daily-check";

const WEEK = { weekStart: "2026-10-05", weekEnd: "2026-10-11" };

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
  tonu?: { loadId: string; delivery: string };
};

const TRUCKS: TruckFixture[] = [
  { unit: "1", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, fixedCents: 72_945, expenseCents: 72_945, netCents: -72_945, mpg: null, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0, sheetFeeDiffers: false },
  { unit: "2", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 0, managementCents: 0, fuelCents: 139_665, tollCents: 0, fixedCents: 78_292, expenseCents: 217_957, netCents: -217_957, mpg: null, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0, sheetFeeDiffers: false },
  { unit: "3", loads: 4, grossCents: 855_000, milesHundredths: 285_200, miscCents: 97_488, driverCents: 171_000, dispatchCents: 47_025, factoringCents: 14_963, sheetManagementCents: 85_500, managementCents: 85_500, fuelCents: 156_430, tollCents: 64_213, fixedCents: 67_041, expenseCents: 703_660, netCents: 151_340, mpg: "7.16", rpmLabel: "2.9979", legacyCents: 85_500, tolsonCents: 0, deadheadHundredths: 22_100, sheetFeeDiffers: false },
  { unit: "4", loads: 1, grossCents: 250_000, milesHundredths: 150_700, miscCents: 227_502, driverCents: 68_125, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 25_000, managementCents: 45_000, fuelCents: 106_556, tollCents: 0, fixedCents: 67_726, expenseCents: 514_909, netCents: -264_909, mpg: "8.29", rpmLabel: "1.6589", legacyCents: 25_000, tolsonCents: 20_000, deadheadHundredths: 8_100, sheetFeeDiffers: true },
  { unit: "5", loads: 5, grossCents: 720_000, milesHundredths: 258_839, miscCents: 0, driverCents: 192_600, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 72_000, managementCents: 129_600, fuelCents: 108_260, tollCents: 0, fixedCents: 76_762, expenseCents: 507_222, netCents: 212_778, mpg: "10.65", rpmLabel: "2.7817", legacyCents: 72_000, tolsonCents: 57_600, deadheadHundredths: 28_839, sheetFeeDiffers: true },
  { unit: "6", loads: 2, grossCents: 200_000, milesHundredths: 69_880, miscCents: 0, driverCents: 53_500, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 20_000, managementCents: 36_000, fuelCents: 116_586, tollCents: 0, fixedCents: 83_455, expenseCents: 289_541, netCents: -89_541, mpg: null, rpmLabel: "2.8621", legacyCents: 20_000, tolsonCents: 16_000, deadheadHundredths: 2_987, sheetFeeDiffers: true, pending: [{ loadId: "TBH--1181", delivery: "10/12/2026" }, { loadId: "TBH--1191", delivery: "10/12/2026" }] },
  { unit: "7", loads: 2, grossCents: 470_000, milesHundredths: 130_076, miscCents: 10_598, driverCents: 128_075, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 47_000, managementCents: 84_600, fuelCents: 158_464, tollCents: 3_647, fixedCents: 70_112, expenseCents: 455_496, netCents: 14_504, mpg: "7.42", rpmLabel: "3.6133", legacyCents: 47_000, tolsonCents: 37_600, deadheadHundredths: 2_734, sheetFeeDiffers: true, pending: [{ loadId: "TBH--1200", delivery: "10/12/2026" }, { loadId: "TBH--1202", delivery: "10/12/2026" }] },
  { unit: "8", loads: 5, grossCents: 790_000, milesHundredths: 266_000, miscCents: 33_420, driverCents: 264_825, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 99_000, managementCents: 142_200, fuelCents: 158_816, tollCents: 4_861, fixedCents: 80_462, expenseCents: 684_584, netCents: 105_416, mpg: "7.04", rpmLabel: "3.7218", legacyCents: 79_000, tolsonCents: 63_200, deadheadHundredths: 25_100, sheetFeeDiffers: true, sheetGrossCents: 990_000, tonu: { loadId: "TBH--1201", delivery: "10/09/2026" } },
  { unit: "9", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, fixedCents: 0, expenseCents: 0, netCents: 0, mpg: null, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0, sheetFeeDiffers: false },
  { unit: "10", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, sheetManagementCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, fixedCents: 0, expenseCents: 0, netCents: 0, mpg: null, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0, sheetFeeDiffers: false },
];

function header(): string[] {
  const cells = Array.from({ length: 43 }, () => "");
  cells[0] = "Delivery Date";
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
    ["Week Start Date", "Driver Compensation", "Management Fee", "Dispatch Fee", "Factoring Fee", "Fuel", "Toll Fees", "Insurance"],
    [
      "10/05/2026",
      dollars(truck.driverCents),
      dollars(truck.sheetManagementCents),
      dollars(truck.dispatchCents),
      dollars(truck.factoringCents),
      dollars(truck.fuelCents),
      dollars(truck.tollCents),
      dollars(truck.fixedCents),
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
  grid[24]![1] = "Management Fee";
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
      expect(week.categories.find((row) => row.category === "Management fee")?.cents ?? 0, truck.unit).toBe(truck.managementCents);
      if (truck.milesHundredths > 0) {
        expect(week.milesHundredths, truck.unit).toBe(truck.milesHundredths);
        expect(week.rpmCents, truck.unit).toBe(centsPerLoadedMile(truck.grossCents, truck.milesHundredths));
      }
      if (truck.rpmLabel) expect(week.rpmLabel, truck.unit).toBe(truck.rpmLabel);
      expect(week.mpg, truck.unit).toBe(truck.mpg);
    }
    expect(loads).toBe(19);
    const legacyIncome = TRUCKS.reduce((sum, truck) => sum + truck.legacyCents, 0);
    const tolsonPayable = TRUCKS.reduce((sum, truck) => sum + truck.tolsonCents, 0);
    expect(legacyIncome).toBe(328_500);
    expect(tolsonPayable).toBe(194_400);
    expect(TRUCKS.reduce((sum, truck) => sum + truck.deadheadHundredths, 0)).toBe(89_860);
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

  it("reads a TONU above the header, including Load Ledger row 11", () => {
    const cells = header();
    const grid: string[][] = Array.from({ length: 10 }, () => Array.from({ length: 4 }, () => ""));
    grid[10] = ["TBH--1201", "TONU", "Oct 9, 2026", "$2,000.00"];
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
    primary[15] = "1165.00";
    const partial = Array.from({ length: 43 }, () => "");
    partial[0] = "10/08/2026";
    partial[1] = "TBH--1192";
    partial[2] = "$1,700.00";
    partial[4] = "M-1195";
    partial[5] = "";
    partial[15] = "1165.00";
    const week = buildOwnerTruckWeek({
      ledger: [cells, primary, partial],
      weekly: [["Week Start Date", "Driver Compensation"], ["10/05/2026", "$0.00"]],
      ...WEEK,
    });
    expect(week.milesHundredths).toBe(116_500);
    expect(week.loadCount).toBe(2);
    expect(week.grossCents).toBe(350_000);
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
