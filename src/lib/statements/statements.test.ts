import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mapFuelRecord, mapTollRecord } from "@/lib/fuel-tolls/map";
import { runFuelPipeline, runTollPipeline } from "@/lib/fuel-tolls/pipeline";
import { FUEL_TOLL_SETTING_DEFAULTS } from "@/lib/fuel-tolls/settings";
import { fuelWeekTotals, tollWeekTotals } from "@/lib/fuel-tolls/totals";
import type { FuelDraft, LoadSpan, WeekMiles } from "@/lib/fuel-tolls/types";
import type { FeeRuleInput, TruckClass } from "@/lib/fee-engine";
import { buildWeekStatements, expectedNetCents, lockPayload, ownerDeductionCents } from "./engine";
import type { StatementContract, WeekStatementInput } from "./types";

const WEEK = "2026-09-21";
const MANAGED = "22222222-2222-4222-8222-222222222203";

type Fixture = {
  trucks: WeekStatementInput["trucks"];
  contracts: StatementContract[];
  loads: WeekStatementInput["loads"];
  fuel: WeekStatementInput["fuel"];
  tolls: WeekStatementInput["tolls"];
  fixedVersions: WeekStatementInput["fixedVersions"];
};

function readFixture(): Fixture {
  return JSON.parse(readFileSync(resolve("fixtures/statements/week-2026-09-21.json"), "utf8")) as Fixture;
}

function inputFrom(fixture: Fixture, extra?: Partial<WeekStatementInput>): WeekStatementInput {
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
    ...extra,
  };
}

function moneyFields(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (!value || typeof value !== "object") return [];
  const found: number[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith("Cents") && typeof child === "number") found.push(child);
    else found.push(...moneyFields(child));
  }
  return found;
}

describe("week 2026-09-21 reference statements", () => {
  const result = buildWeekStatements(inputFrom(readFixture()));

  it("closes with the hand-calculated unit and fleet cents", () => {
    // Unit 02 Legacy-owned. Gross 220000 + 100000 = 320000.
    // Prior Sunday 999999 and next Monday 888888 stay out (delivery date, not pickup).
    // Driver 20% = 64000. Tolson 10% = 32000. Dispatch 5.5% = 17600. Factoring 2.65% = 8480.
    // Fuel 50000. Tolls 1234. Escrow 10000 + ELD 2000 owner. Yard 500 is management and stays out of net.
    // Net = 320000 - 64000 - 32000 - 17600 - 8480 - 50000 - 1234 - 12000 = 134686.
    // Unit 03 managed. Gross 580000.
    // Driver 116000. Management 15% = 87000. Dispatch 5% = 29000. Factoring 2.65% = 15370.
    // Tolson 58000 and Legacy 29000 are stored and not deducted again.
    // Fuel 25000. Tolls 500. Permits 1500.
    // Net = 580000 - 116000 - 87000 - 29000 - 15370 - 25000 - 500 - 1500 = 305630.
    expect(result.closeAllowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.weekEnd).toBe("2026-09-27");

    const owned = result.units.find((unit) => unit.unitNumber === "02");
    const managed = result.units.find((unit) => unit.unitNumber === "03");
    expect(owned).toBeTruthy();
    expect(managed).toBeTruthy();
    expect(owned).toMatchObject({
      grossCents: 320_000,
      driverPayCents: 64_000,
      managementFeeCents: 0,
      tolsonPayableCents: 32_000,
      legacyRetainedCents: 0,
      dispatchFeeCents: 17_600,
      factoringFeeCents: 8_480,
      fuelCents: 50_000,
      tollsCents: 1_234,
      fixedOwnerCents: 12_000,
      fixedManagementCents: 500,
      netCents: 134_686,
      loadCount: 2,
      loadedMilesHundredths: 43_200,
      deadheadMilesHundredths: 1_400,
    });
    expect(managed).toMatchObject({
      grossCents: 580_000,
      driverPayCents: 116_000,
      managementFeeCents: 87_000,
      tolsonPayableCents: 58_000,
      legacyRetainedCents: 29_000,
      dispatchFeeCents: 29_000,
      factoringFeeCents: 15_370,
      fuelCents: 25_000,
      tollsCents: 500,
      fixedOwnerCents: 1_500,
      fixedManagementCents: 0,
      netCents: 305_630,
      loadCount: 1,
    });
    expect(owned!.netCents).toBe(expectedNetCents(owned!));
    expect(managed!.netCents).toBe(expectedNetCents(managed!));
    expect(result.fleet).toMatchObject({
      grossCents: 900_000,
      tolsonPayableCents: 90_000,
      legacyRetainedCents: 29_000,
      dispatchFeeCents: 46_600,
      fuelCents: 75_000,
      tollsCents: 1_734,
      fixedOwnerCents: 13_500,
      fixedManagementCents: 500,
      netCents: 440_316,
      loadCount: 3,
      unitCount: 2,
    });
    expect(result.fleet.netCents).toBe(owned!.netCents + managed!.netCents);
  });

  it("shows Tolson on an owned truck and one management line on a managed truck", () => {
    const owned = result.units.find((unit) => unit.unitNumber === "02")!;
    const managed = result.units.find((unit) => unit.unitNumber === "03")!;
    expect(owned.lines.find((line) => line.lineCode === "TOLSON_PAYABLE")?.ownerVisible).toBe(true);
    expect(owned.lines.find((line) => line.lineCode === "MANAGEMENT_FEE")).toBeUndefined();
    expect(managed.lines.find((line) => line.lineCode === "MANAGEMENT_FEE")).toMatchObject({
      amountCents: 87_000,
      ownerVisible: true,
      rateBp: 1500,
    });
    expect(managed.lines.find((line) => line.lineCode === "TOLSON_PAYABLE")?.ownerVisible).toBe(false);
    expect(managed.lines.find((line) => line.lineCode === "LEGACY_RETAINED")?.ownerVisible).toBe(false);
    const visible = managed.lines
      .filter((line) => line.ownerVisible && line.chargedTo !== "management")
      .reduce((sum, line) => sum + line.amountCents, 0);
    expect(visible).toBe(ownerDeductionCents(managed));
    expect(managed.lines.find((line) => line.lineCode === "YARD_FEE")).toBeUndefined();
    expect(owned.lines.find((line) => line.lineCode === "YARD_FEE")).toMatchObject({
      amountCents: 500,
      chargedTo: "management",
    });
  });

  it("persists only integer cents", () => {
    const payload = lockPayload(result);
    for (const cents of moneyFields(payload)) {
      expect(Number.isInteger(cents)).toBe(true);
    }
    expect(payload.statements).toHaveLength(2);
  });
});

describe("close blockers", () => {
  const fixture = readFixture();

  it("blocks unlinked fuel and refuses the lock payload", () => {
    const result = buildWeekStatements(
      inputFrom(fixture, {
        loads: fixture.loads.filter((load) => load.truckId !== MANAGED),
      }),
    );
    expect(result.closeAllowed).toBe(false);
    expect(result.blockers.some((row) => row.rule === "unlinked_fuel_week_close")).toBe(true);
    expect(result.blockers[0]?.message).toContain("03");
    expect(() => lockPayload(result)).toThrow(/blockers/);
  });

  it("blocks a row-count drop on an import that overlaps the week", () => {
    const result = buildWeekStatements(
      inputFrom(fixture, {
        importRuns: [
          {
            kind: "fuel",
            status: "success",
            rangeFrom: "2026-09-21",
            rangeTo: "2026-09-27",
            rowsFetched: 40,
            finishedAt: "2026-09-28T00:00:00Z",
          },
          {
            kind: "fuel",
            status: "blocked",
            rangeFrom: "2026-09-21",
            rangeTo: "2026-09-27",
            rowsFetched: 10,
            finishedAt: "2026-09-29T00:00:00Z",
          },
        ],
      }),
    );
    expect(result.blockers.map((row) => row.rule)).toContain("row_count_drop");
    expect(result.closeAllowed).toBe(false);
  });

  it("ignores a row-count drop whose dates do not overlap the week", () => {
    const result = buildWeekStatements(
      inputFrom(fixture, {
        importRuns: [
          {
            kind: "loads",
            status: "success",
            rangeFrom: "2026-08-01",
            rangeTo: "2026-08-07",
            rowsFetched: 40,
            finishedAt: "2026-08-08T00:00:00Z",
          },
          {
            kind: "loads",
            status: "blocked",
            rangeFrom: "2026-08-01",
            rangeTo: "2026-08-07",
            rowsFetched: 1,
            finishedAt: "2026-08-09T00:00:00Z",
          },
        ],
      }),
    );
    expect(result.closeAllowed).toBe(true);
  });

  it("uses a 10 percent management fee when no contract is stored", () => {
    const missing = buildWeekStatements(inputFrom(fixture, { contracts: [] }));
    expect(missing.blockers.some((row) => row.rule === "missing_fee_contract")).toBe(false);
    expect(missing.blockers.some((row) => row.rule === "missing_tolson_payable")).toBe(false);
    expect(missing.closeAllowed).toBe(true);
    const legacy = missing.units.find((unit) => unit.unitNumber === "02");
    const managed = missing.units.find((unit) => unit.unitNumber === "03");
    expect(legacy?.contractId).toBe("default:11111111-1111-4111-8111-111111111102");
    expect(legacy?.grossCents).toBe(320_000);
    expect(legacy?.tolsonPayableCents).toBe(32_000);
    expect(legacy?.managementFeeCents).toBe(0);
    expect(legacy?.netCents).toBe(320_000 - 32_000 - (legacy?.driverPayCents ?? 0) - (legacy?.dispatchFeeCents ?? 0) - (legacy?.factoringFeeCents ?? 0) - (legacy?.fuelCents ?? 0) - (legacy?.tollsCents ?? 0) - (legacy?.fixedOwnerCents ?? 0));
    expect(legacy?.lines.find((line) => line.lineCode === "TOLSON_PAYABLE")).toMatchObject({
      amountCents: 32_000,
      rateBp: 1000,
    });
    expect(legacy?.lines.find((line) => line.lineCode === "LEGACY_RETAINED")).toMatchObject({
      amountCents: 0,
      rateBp: null,
    });
    expect(managed?.contractId).toBe("default:22222222-2222-4222-8222-222222222203");
    expect(managed?.grossCents).toBe(580_000);
    expect(managed?.managementFeeCents).toBe(58_000);
    expect(managed?.tolsonPayableCents).toBe(0);
    expect(managed?.legacyRetainedCents).toBe(0);
    expect(managed?.lines.find((line) => line.lineCode === "MANAGEMENT_FEE")?.rateBp).toBe(1000);

    const unknown = buildWeekStatements(
      inputFrom(fixture, {
        contracts: [],
        trucks: fixture.trucks.map((truck) =>
          truck.unitNumber === "02" ? { ...truck, truckClass: "other" as typeof truck.truckClass } : truck,
        ),
      }),
    );
    expect(unknown.blockers.some((row) => row.rule === "missing_fee_contract" && row.ref?.includes("-"))).toBe(true);
  });

  it("blocks a delivery week that does not match the stored week", () => {
    const fixture = readFixture();

    const mismatch = buildWeekStatements(
      inputFrom(fixture, {
        loads: fixture.loads.map((load) =>
          load.id === "load-03" ? { ...load, storedWeekStart: "2026-09-14" } : load,
        ),
      }),
    );
    expect(mismatch.blockers.some((row) => row.rule === "delivery_week_mismatch")).toBe(true);
    expect(mismatch.closeAllowed).toBe(false);
    const managed = mismatch.units.find((unit) => unit.unitNumber === "03");
    expect(managed?.grossCents).toBe(0);
    expect(managed?.loadCount).toBe(0);
    expect(managed?.fuelCents).toBe(25_000);
  });

  it("rejects a float gross", () => {
    expect(() =>
      buildWeekStatements(
        inputFrom(fixture, {
          loads: fixture.loads.map((load) =>
            load.id === "load-03" ? { ...load, grossCents: 580000.5 } : load,
          ),
        }),
      ),
    ).toThrow(/integer/);
  });
});

describe("fuel and toll fixtures for 21–27 Sep 2026", () => {
  const UNITS = ["02", "03", "04", "05", "06", "07", "08"];

  function readJson(name: string): { transactions: unknown[]; trucks?: Record<string, string> } {
    return JSON.parse(readFileSync(resolve("fixtures/vektor", name), "utf8")) as {
      transactions: unknown[];
      trucks?: Record<string, string>;
    };
  }

  it("books discounted fuel and the 66-toll total on each unit statement", () => {
    const fuelDoc = readJson("fuel-week-2026-09-21.json");
    const tollDoc = readJson("tolls-week-2026-09-21.json");
    const fuelDrafts = fuelDoc.transactions.map((row) => mapFuelRecord(row));
    const spans: LoadSpan[] = UNITS.map((unitNumber) => ({
      unitNumber,
      startDate: "2026-09-22",
      endDate: "2026-09-26",
    }));
    const miles: WeekMiles[] = fuelDrafts
      .filter((row) => row.unitNumber && row.gallonsMilli)
      .map((row) => ({
        unitNumber: row.unitNumber!,
        weekStart: WEEK,
        milesHundredths: (row.gallonsMilli! * 3) / 5,
      }));
    const fuelResult = runFuelPipeline(fuelDrafts, {
      knownUnits: new Set(UNITS),
      loadSpans: spans,
      weekMiles: miles,
      rangeFrom: WEEK,
      rangeTo: "2026-09-27",
      previousFetched: null,
      settings: FUEL_TOLL_SETTING_DEFAULTS,
      existingDuplicates: [],
    });
    const lookup = new Map(Object.entries(tollDoc.trucks ?? {}));
    const tollResult = runTollPipeline(
      tollDoc.transactions.map((row) => mapTollRecord(row, lookup)),
      {
        knownUnits: new Set(UNITS),
        loadSpans: spans,
        rangeFrom: WEEK,
        rangeTo: "2026-09-27",
        previousFetched: null,
        settings: FUEL_TOLL_SETTING_DEFAULTS,
        existingDuplicates: [],
      },
    );
    const fuelTotals = fuelWeekTotals(
      fuelResult.decisions.filter((row) => row.promote).map((row) => row.draft),
      WEEK,
    );
    const tollTotals = tollWeekTotals(
      tollResult.decisions.filter((row) => row.promote).map((row) => row.draft),
      WEEK,
    );
    const trucks = UNITS.map((unitNumber, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      unitNumber,
      truckClass: (unitNumber === "02" ? "legacy_owned" : "third_party") as TruckClass,
    }));
    const contracts: StatementContract[] = trucks.map((truck) => ({
      id: `c0000000-0000-4000-8000-${truck.id.slice(-12)}`,
      truckId: truck.id,
      effectiveFrom: WEEK,
      effectiveTo: null,
      rules: rulesFor(truck.truckClass),
    }));
    const loads = trucks.map((truck) => ({
      id: `load-${truck.unitNumber}`,
      truckId: truck.id,
      unitNumber: truck.unitNumber,
      deliveryDate: "2026-09-26",
      storedWeekStart: WEEK,
      grossCents: 100_000,
      loadedMilesHundredths: 10_000,
      deadheadMilesHundredths: 0,
    }));
    const result = buildWeekStatements({
      weekStart: WEEK,
      trucks,
      contracts,
      loads,
      fuel: promotedFuel(fuelResult.decisions.filter((row) => row.promote).map((row) => row.draft)),
      tolls: tollTotals.map((row) => ({
        unitNumber: row.unitNumber,
        weekStart: WEEK,
        amountCents: row.amountCents,
      })),
      fixedVersions: [],
      fixedOverrides: [],
      importRuns: [],
      rowCountDropPct: { loads: 50, fuel: 50, tolls: 50 },
    });

    expect(result.closeAllowed).toBe(true);
    expect(result.fleet.tollsCents).toBe(32_153);
    expect(result.fleet.tollsCents).toBe(tollTotals.reduce((sum, row) => sum + row.amountCents, 0));
    expect(result.units.map((unit) => unit.unitNumber)).toEqual(UNITS);
    for (const unit of result.units) {
      const fuel = fuelTotals.find((row) => row.unitNumber === unit.unitNumber);
      const toll = tollTotals.find((row) => row.unitNumber === unit.unitNumber);
      expect(unit.fuelCents).toBe(fuel?.amountCents ?? 0);
      expect(unit.tollsCents).toBe(toll?.amountCents ?? 0);
      expect(unit.grossCents).toBe(100_000);
      // $1,000.00 × 20% = 20000. × 2.65% = 2650. × 5% dispatch = 5000.
      expect(unit.driverPayCents).toBe(20_000);
      expect(unit.factoringFeeCents).toBe(2_650);
      expect(unit.dispatchFeeCents).toBe(5_000);
      if (unit.truckClass === "legacy_owned") {
        expect(unit.tolsonPayableCents).toBe(10_000);
        expect(unit.managementFeeCents).toBe(0);
        expect(unit.netCents).toBe(100_000 - 20_000 - 10_000 - 5_000 - 2_650 - unit.fuelCents - unit.tollsCents);
      } else {
        expect(unit.managementFeeCents).toBe(15_000);
        expect(unit.tolsonPayableCents).toBe(10_000);
        expect(unit.legacyRetainedCents).toBe(5_000);
        expect(unit.netCents).toBe(100_000 - 20_000 - 15_000 - 5_000 - 2_650 - unit.fuelCents - unit.tollsCents);
      }
    }
    const truck3 = result.units.find((unit) => unit.unitNumber === "03")!;
    const truck3Fuel = fuelTotals.find((row) => row.unitNumber === "03")!;
    expect(truck3.fuelCents).toBe(truck3Fuel.amountCents);
    expect(truck3.fuelCents).not.toBe(truck3Fuel.retailAmountCents);
  });
});

function rulesFor(truckClass: TruckClass): FeeRuleInput[] {
  const shared: FeeRuleInput[] = [
    { kind: "DRIVER_PAY", rateBp: 2000, basePctBp: 10000 },
    { kind: "DISPATCH_FEE", rateBp: 500, basePctBp: 10000 },
    { kind: "FACTORING_FEE", rateBp: 265, basePctBp: 10000 },
  ];
  if (truckClass === "legacy_owned") {
    return [...shared, { kind: "TOLSON_PAYABLE", rateBp: 1000, basePctBp: 10000 }];
  }
  return [
    ...shared,
    { kind: "MANAGEMENT_FEE", rateBp: 1500, basePctBp: 10000 },
    { kind: "TOLSON_PAYABLE", rateBp: 1000, basePctBp: 10000 },
    { kind: "LEGACY_RETAINED", rateBp: 500, basePctBp: 10000 },
  ];
}

function promotedFuel(rows: FuelDraft[]): WeekStatementInput["fuel"] {
  return rows
    .filter((row) => row.amountCents != null && row.unitNumber && row.weekStart)
    .map((row) => ({
      unitNumber: row.unitNumber,
      weekStart: row.weekStart,
      amountCents: row.amountCents!,
    }));
}
