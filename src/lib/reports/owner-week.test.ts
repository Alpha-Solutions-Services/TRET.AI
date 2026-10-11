import { describe, expect, it } from "vitest";
import { centsPerLoadedMile } from "@/lib/reports/format";
import { buildOwnerTruckWeek, TONU_RATE_NOTE } from "@/lib/reports/owner-week";
import { findFuelLogHeader, locateFuelLogColumns } from "@/lib/fuel-tolls/file/sheet-columns";
import { compareDailyCheck } from "@/lib/reports/daily-check";

const WEEK = { weekStart: "2026-10-05", weekEnd: "2026-10-11" };

type TruckFixture = {
  unit: string;
  loads: number;
  grossCents: number;
  milesHundredths: number;
  miscCents: number;
  expenseCents: number;
  netCents: number;
  mpg: string | null;
  rpmCents?: number;
  pending?: { loadId: string; delivery: string; status?: string }[];
};

const TRUCKS: TruckFixture[] = [
  { unit: "1", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, expenseCents: 72_945, netCents: -72_945, mpg: null },
  { unit: "2", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, expenseCents: 217_957, netCents: -217_957, mpg: null },
  { unit: "3", loads: 4, grossCents: 855_000, milesHundredths: 285_200, miscCents: 98_990, expenseCents: 705_162, netCents: 149_838, mpg: "7.16", rpmCents: 300 },
  { unit: "4", loads: 1, grossCents: 250_000, milesHundredths: 150_700, miscCents: 198_456, expenseCents: 465_863, netCents: -215_863, mpg: "8.29" },
  { unit: "5", loads: 5, grossCents: 720_000, milesHundredths: 258_839, miscCents: 0, expenseCents: 449_622, netCents: 270_378, mpg: "10.65", rpmCents: 278 },
  { unit: "6", loads: 4, grossCents: 530_000, milesHundredths: 166_100, miscCents: 56_152, expenseCents: 455_267, netCents: 74_733, mpg: "8.00", rpmCents: 319 },
  {
    unit: "7",
    loads: 2,
    grossCents: 470_000,
    milesHundredths: 130_076,
    miscCents: 10_598,
    expenseCents: 417_896,
    netCents: 52_104,
    mpg: "7.42",
    rpmCents: 361,
    pending: [
      { loadId: "TBH--1200", delivery: "10/12/2026" },
      { loadId: "TBH--1202", delivery: "10/12/2026" },
    ],
  },
  {
    unit: "8",
    loads: 5,
    grossCents: 790_000,
    milesHundredths: 265_000,
    miscCents: 33_420,
    expenseCents: 566_684,
    netCents: 223_316,
    mpg: null,
    rpmCents: 298,
    pending: [{ loadId: "TBH--1201", delivery: "10/12/2026", status: "TONU" }],
  },
  { unit: "9", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, expenseCents: 0, netCents: 0, mpg: null },
  { unit: "10", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, expenseCents: 0, netCents: 0, mpg: null },
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
  let grossLeft = truck.grossCents;
  let milesLeft = truck.milesHundredths;
  let miscLeft = truck.miscCents;
  for (let index = 0; index < truck.loads; index += 1) {
    const last = index === truck.loads - 1;
    const gross = last ? grossLeft : Math.floor(truck.grossCents / truck.loads);
    const miles = last ? milesLeft : Math.floor(truck.milesHundredths / truck.loads);
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
  for (const pending of truck.pending ?? []) {
    const row = Array.from({ length: 43 }, () => "");
    row[0] = pending.delivery;
    row[1] = pending.loadId;
    row[2] = "$2,000.00";
    row[3] = pending.status ?? "";
    row[15] = "100.00";
    rows.push(row);
  }
  return rows;
}

function weeklyFor(truck: TruckFixture): string[][] {
  const driver = truck.expenseCents - truck.miscCents;
  return [
    ["Week Start Date", "Driver Compensation"],
    ["10/05/2026", driver === 0 ? "" : dollars(driver)],
  ];
}

function weekReport(mpg: string | null): string[][] {
  const grid = Array.from({ length: 31 }, () => ["", "", ""]);
  if (mpg) grid[30]![2] = mpg;
  return grid;
}

describe("week 41 owner sheet", () => {
  it("matches the sheet totals for trucks 1 through 10", () => {
    let loads = 0;
    for (const truck of TRUCKS) {
      const week = buildOwnerTruckWeek({
        ledger: truck.loads === 0 && !(truck.pending?.length) ? [["Delivery Date", "Load ID", "Rate"]] : ledgerFor(truck),
        weekly: weeklyFor(truck),
        weekReport: weekReport(truck.mpg),
        ...WEEK,
      });
      loads += week.loadCount;
      expect(week.miscCents, truck.unit).toBe(truck.miscCents);
      expect(week.expenseCents, truck.unit).toBe(truck.expenseCents);
      expect(week.netCents, truck.unit).toBe(truck.netCents);
      expect(week.grossCents, truck.unit).toBe(truck.grossCents);
      expect(week.loadCount, truck.unit).toBe(truck.loads);
      if (truck.milesHundredths > 0) {
        expect(week.milesHundredths, truck.unit).toBe(truck.milesHundredths);
        expect(week.rpmCents, truck.unit).toBe(centsPerLoadedMile(truck.grossCents, truck.milesHundredths));
      }
      if (truck.rpmCents != null) expect(week.rpmCents, truck.unit).toBe(truck.rpmCents);
      expect(week.mpg, truck.unit).toBe(truck.mpg);
    }
    expect(loads).toBe(21);
    const truck7 = buildOwnerTruckWeek({ ledger: ledgerFor(TRUCKS[6]!), weekly: weeklyFor(TRUCKS[6]!), ...WEEK });
    expect(truck7.pending.map((row) => row.loadId)).toEqual(["TBH--1200", "TBH--1202"]);
    expect(truck7.pending.every((row) => row.reason === "Delivers next week")).toBe(true);
    const truck8 = buildOwnerTruckWeek({ ledger: ledgerFor(TRUCKS[7]!), weekly: weeklyFor(TRUCKS[7]!), ...WEEK });
    expect(truck8.pending).toEqual([{ loadId: "TBH--1201", reason: TONU_RATE_NOTE }]);
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
