import { roundHalfUpDivide } from "@/lib/fee-engine/money";
import {
  centsPerLoad,
  centsPerLoadedMile,
  formatDieselMpg,
  formatGallonsMilli,
  formatMilesHundredths,
  formatStatementDollars,
} from "@/lib/reports/format";
import {
  columnIndex,
  columnIndexes,
  findHeaderRow,
  inWeek,
  sheetAmountToCents,
  sheetDay,
} from "@/lib/sheets/cell";
import { parseLoadLedger } from "@/lib/sheets/ledger";
import { unitKey } from "@/lib/sheets/mismatch";

export type SheetGrid = string[][];

export type AssetExpenseLine = {
  label: string;
  cents: number;
};

export type AssetLoadLine = {
  loadId: string;
  date: string;
  broker: string;
  origin: string;
  destination: string;
  loadedHundredths: number;
  deadheadHundredths: number;
  rateCents: number;
};

export type AssetReport = {
  unitNumber: string;
  driver: string;
  assetPartner: string;
  truckLine: string;
  dispatcher: string;
  program: string;
  periodLabel: string;
  weekStart: string;
  weekEnd: string;
  grossCents: number;
  expenseCents: number;
  netCents: number;
  loadCount: number;
  dispatchMilesHundredths: number;
  ratePerMileCents: number | null;
  revenuePerLoadCents: number | null;
  fuelPerMileCents: number | null;
  loads: AssetLoadLine[];
  leftExpenses: AssetExpenseLine[];
  rightExpenses: AssetExpenseLine[];
  escrowCents: number;
  fuelGallonsLabel: string;
  fuelCostCents: number;
  fuelUnitPriceCents: number | null;
  fuelEconomy: string;
  assetStatus: string;
  summary: string;
  notes: string[];
};

const NOT_STORED = "Not stored";

function dollars(cents: number): string {
  return formatStatementDollars(cents);
}

export function percentOfRevenue(partCents: number, grossCents: number): string {
  if (!Number.isInteger(partCents) || !Number.isInteger(grossCents) || partCents < 0 || grossCents <= 0) {
    return "0.0%";
  }
  const tenths = roundHalfUpDivide(BigInt(partCents) * BigInt(1000), BigInt(grossCents));
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year?.slice(2) ?? ""}`;
}

function cellAmount(header: string[], row: string[], names: readonly string[]): number {
  const indexes = columnIndexes(header, names);
  return indexes.reduce((sum, index) => sum + (sheetAmountToCents(row[index] ?? "") ?? 0), 0);
}

function weeklyRow(
  grid: SheetGrid | null,
  weekStart: string,
  weekEnd: string,
): { header: string[]; row: string[] } | null {
  if (!grid) return null;
  const headerIndex = findHeaderRow(grid, [
    ["week start date", "date"],
    ["driver compensation"],
  ]);
  if (headerIndex < 0) return null;
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, ["week start date", "date"]);
  let fallback: string[] | null = null;
  for (const row of grid.slice(headerIndex + 1)) {
    const day = sheetDay(row[dateCol] ?? "");
    if (!inWeek(day, weekStart, weekEnd)) continue;
    if (day === weekStart) return { header, row };
    fallback ??= row;
  }
  return fallback ? { header, row: fallback } : null;
}

function fuelTotals(
  grid: SheetGrid | null,
  weekStart: string,
  weekEnd: string,
): { gallonsMilli: number; costCents: number; milesHundredths: number } {
  if (!grid) return { gallonsMilli: 0, costCents: 0, milesHundredths: 0 };
  const headerIndex = findHeaderRow(grid, [["date"], ["gallons"]]);
  if (headerIndex < 0) return { gallonsMilli: 0, costCents: 0, milesHundredths: 0 };
  const header = grid[headerIndex] ?? [];
  const dateCol = columnIndex(header, ["date"]);
  const gallonCol = columnIndex(header, ["gallons"]);
  const costCol = columnIndex(header, ["total cost", "amount"]);
  const milesCol = columnIndex(header, ["miles"]);
  let gallonsMilli = 0;
  let costCents = 0;
  let milesHundredths = 0;
  for (const row of grid.slice(headerIndex + 1)) {
    const day = sheetDay(row[dateCol] ?? "");
    if (!inWeek(day, weekStart, weekEnd)) continue;
    gallonsMilli += gallonsMilliFrom(row[gallonCol] ?? "");
    costCents += sheetAmountToCents(row[costCol] ?? "") ?? 0;
    milesHundredths += milesHundredthsFrom(row[milesCol] ?? "");
  }
  return { gallonsMilli, costCents, milesHundredths };
}

function gallonsMilliFrom(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return 0;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const digits = (frac + "000").slice(0, 4);
  let milli = Number.parseInt(whole, 10) * 1000 + Number.parseInt(digits.slice(0, 3), 10);
  if (digits[3]! >= "5") milli += 1;
  return milli;
}

function milesHundredthsFrom(raw: string): number {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return 0;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const digits = (frac + "000").slice(0, 3);
  let hundredths = Number.parseInt(whole, 10) * 100 + Number.parseInt(digits.slice(0, 2), 10);
  if (digits[2]! >= "5") hundredths += 1;
  return hundredths;
}

function fleetFacts(
  grid: SheetGrid | null,
  unitNumber: string,
): { vin: string | null; driver: string | null; status: string | null } {
  if (!grid) return { vin: null, driver: null, status: null };
  const headerIndex = findHeaderRow(grid, [["truck number", "truck #", "unit"], ["vin"]]);
  if (headerIndex < 0) return { vin: null, driver: null, status: null };
  const header = grid[headerIndex] ?? [];
  const unitCol = columnIndex(header, ["truck number", "truck #", "unit", "truck id"]);
  const vinCol = columnIndex(header, ["vin"]);
  const driverCol = columnIndex(header, ["primary driver", "driver"]);
  const statusCol = columnIndex(header, ["status"]);
  for (const row of grid.slice(headerIndex + 1)) {
    const unit = (row[unitCol] ?? "").trim();
    if (!unit || unitKey(unit) !== unitKey(unitNumber)) continue;
    return {
      vin: (row[vinCol] ?? "").trim() || null,
      driver: (row[driverCol] ?? "").trim() || null,
      status: (row[statusCol] ?? "").trim() || null,
    };
  }
  return { vin: null, driver: null, status: null };
}

export function buildAssetReport(input: {
  weekStart: string;
  weekEnd: string;
  unitNumber: string;
  ownerName: string | null;
  ledger: SheetGrid | null;
  weekly: SheetGrid | null;
  fuelLog: SheetGrid | null;
  fleet: SheetGrid | null;
  sheetNote: string | null;
  dbFuelCents?: number;
  dbGallonsMilli?: number;
  dbTollCents?: number;
}): AssetReport {
  const parsed = input.ledger ? parseLoadLedger(input.ledger) : null;
  const weekLoads = (parsed?.rows ?? []).filter((row) => inWeek(row.deliveryDay, input.weekStart, input.weekEnd));
  const loads: AssetLoadLine[] = weekLoads
    .filter((row) => row.rateCents != null)
    .map((row) => ({
      loadId: row.loadId,
      date: shortDate(row.deliveryDay),
      broker: row.broker ?? NOT_STORED,
      origin: row.origin ?? NOT_STORED,
      destination: row.destination ?? NOT_STORED,
      loadedHundredths: row.loadedMilesHundredths ?? 0,
      deadheadHundredths: row.deadheadMilesHundredths ?? 0,
      rateCents: row.rateCents ?? 0,
    }));
  const grossCents = loads.reduce((sum, row) => sum + row.rateCents, 0);
  const dispatchMilesHundredths = loads.reduce(
    (sum, row) => sum + row.loadedHundredths + row.deadheadHundredths,
    0,
  );
  const weekly = weeklyRow(input.weekly, input.weekStart, input.weekEnd);
  const notes: string[] = [];
  if (input.sheetNote) notes.push(input.sheetNote);
  if (!parsed?.headerFound) {
    notes.push("Load Ledger header was not found. Expected Delivery Date, Load ID, and Rate.");
  }
  const read = (names: readonly string[]) => (weekly ? cellAmount(weekly.header, weekly.row, names) : 0);
  if (!weekly) notes.push("Weekly Expenses row was not found for this week. Expense lines are zero.");
  const moved = read(["moved to management"]);
  if (moved > 0) {
    notes.push(
      `Moved to Management on the sheet is ${dollars(moved)}. It is not included in total truck expenses.`,
    );
  }
  const fuelLog = fuelTotals(input.fuelLog, input.weekStart, input.weekEnd);
  let fuelCents = read(["fuel"]);
  let gallonsMilli = fuelLog.gallonsMilli;
  if (fuelCents === 0 && fuelLog.costCents > 0) fuelCents = fuelLog.costCents;
  if (fuelCents === 0 && (input.dbFuelCents ?? 0) > 0) {
    fuelCents = input.dbFuelCents ?? 0;
    notes.push("Fuel cost came from fuel transactions because the sheet fuel cells were blank.");
  }
  if (gallonsMilli === 0 && (input.dbGallonsMilli ?? 0) > 0) gallonsMilli = input.dbGallonsMilli ?? 0;
  let tollCents = read(["toll fees", "toll charges"]);
  if (tollCents === 0 && (input.dbTollCents ?? 0) > 0) {
    tollCents = input.dbTollCents ?? 0;
    notes.push("Toll charges came from toll transactions because the sheet toll cell was blank.");
  }
  const truckPayments = read(["truck pymts", "truck payments"]);
  const trailerPayments = read(["trailer pymts", "trailer payments"]);
  if (trailerPayments > 0) {
    notes.push("MC Lease is Truck Pymts plus Trailer Pymts. OPEN if those should stay split.");
  }
  const lines = {
    driver: read(["driver compensation"]),
    management: read(["management fee"]),
    mcLease: truckPayments + trailerPayments,
    dispatch: read(["dispatch fee"]),
    factoring: read(["factoring fee"]),
    fuel: fuelCents,
    insurance: read(["insurance"]),
    escrow: read(["maintenance escrow weekly", "weekly escrow"]),
    eld: read(["eld fee"]),
    yard: read(["yard fee", "yard parking"]),
    gps: read(["gps tracker"]),
    tollPass: read(["toll pass"]),
    tolls: tollCents,
    permits: read(["permit fees", "permits"]),
  };
  const leftExpenses: AssetExpenseLine[] = [
    { label: "Driver Compensation - 20%", cents: lines.driver },
    { label: "Management Fee - 10%", cents: lines.management },
    { label: "MC Lease", cents: lines.mcLease },
    { label: "Dispatch Fee", cents: lines.dispatch },
    { label: "Factoring Fee - 1.75%", cents: lines.factoring },
    { label: "Fuel (Diesel + DEF)", cents: lines.fuel },
    { label: "Insurance", cents: lines.insurance },
  ];
  const rightExpenses: AssetExpenseLine[] = [
    { label: "Weekly Escrow", cents: lines.escrow },
    { label: "ELD Fee", cents: lines.eld },
    { label: "Yard Parking", cents: lines.yard },
    { label: "GPS Tracker", cents: lines.gps },
    { label: "Toll Pass", cents: lines.tollPass },
    { label: "Toll Charges", cents: lines.tolls },
    { label: "Permits", cents: lines.permits },
  ];
  const expenseCents = [...leftExpenses, ...rightExpenses].reduce((sum, line) => sum + line.cents, 0);
  const fleet = fleetFacts(input.fleet, input.unitNumber);
  const weeklyDriver =
    weekly && columnIndex(weekly.header, ["driver"]) >= 0
      ? (weekly.row[columnIndex(weekly.header, ["driver"])] ?? "").trim()
      : "";
  const driver =
    parsed?.driverHint ||
    weekLoads.find((row) => row.driver)?.driver ||
    fleet.driver ||
    weeklyDriver ||
    NOT_STORED;
  const vin = fleet.vin ?? NOT_STORED;
  const assetStatus = fleet.status ?? parsed?.statusHint ?? NOT_STORED;
  const ratePerMileCents = centsPerLoadedMile(grossCents, dispatchMilesHundredths);
  const economyMiles = fuelLog.milesHundredths > 0 ? fuelLog.milesHundredths : dispatchMilesHundredths;
  const fuelEconomy = formatDieselMpg(economyMiles, gallonsMilli) ?? NOT_STORED;
  const fuelPerMileCents = centsPerLoadedMile(fuelCents, dispatchMilesHundredths);
  const netCents = grossCents - expenseCents;
  const periodLabel = `${shortDate(input.weekStart)} to ${shortDate(input.weekEnd)}`;
  if (notes.length === 0) {
    notes.push("On-time, claims, dispatcher, and compliance status are not stored.");
  }
  return {
    unitNumber: input.unitNumber,
    driver: driver || NOT_STORED,
    assetPartner: input.ownerName?.trim() || NOT_STORED,
    truckLine: `Truck ${input.unitNumber} / Trailer ${NOT_STORED} / VIN ${vin}`,
    dispatcher: NOT_STORED,
    program: "Transportation Asset Management",
    periodLabel,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    grossCents,
    expenseCents,
    netCents,
    loadCount: loads.length,
    dispatchMilesHundredths,
    ratePerMileCents,
    revenuePerLoadCents: centsPerLoad(grossCents, loads.length),
    fuelPerMileCents,
    loads,
    leftExpenses,
    rightExpenses,
    escrowCents: lines.escrow,
    fuelGallonsLabel: gallonsMilli > 0 ? formatGallonsMilli(gallonsMilli) : NOT_STORED,
    fuelCostCents: fuelCents,
    fuelUnitPriceCents:
      gallonsMilli > 0 ? roundHalfUpDivide(BigInt(fuelCents) * BigInt(1000), BigInt(gallonsMilli)) : null,
    fuelEconomy,
    assetStatus,
    summary: `Truck ${input.unitNumber} delivered ${loads.length} loads for ${dollars(grossCents)} gross. Owner expenses were ${dollars(expenseCents)}. Net owner earnings were ${dollars(netCents)}.`,
    notes,
  };
}

export function milesLabel(hundredths: number): string {
  return formatMilesHundredths(hundredths);
}
