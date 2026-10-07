import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lookupWeeklyFixedExpense } from "@/lib/fixed-expenses/lookup";
import { mapFuelRecord, mapTollRecord } from "@/lib/fuel-tolls/map";
import { runFuelPipeline, runTollPipeline } from "@/lib/fuel-tolls/pipeline";
import { FUEL_TOLL_SETTING_DEFAULTS } from "@/lib/fuel-tolls/settings";
import { fuelWeekTotals, tollWeekTotals } from "@/lib/fuel-tolls/totals";
import type { FuelDraft, LoadSpan, WeekMiles } from "@/lib/fuel-tolls/types";
import {
  buildInbox,
  canResolveIssue,
  filterInbox,
  type ImportIssueInput,
} from "@/lib/issues/inbox";
import { buildManagementPnl, type PnlOperatingExpense } from "@/lib/overview/pnl";
import { buildWeekSnapshot } from "@/lib/overview/snapshot";
import { weeklyStatementPdf } from "@/lib/reports/build";
import { ReportBlockedError } from "@/lib/reports/prepare";
import type { ReportFuelRow, ReportLoadRow, WeeklyReportSource } from "@/lib/reports/types";
import { buildWeekStatements, lockPayload } from "@/lib/statements/engine";
import { milesValueToHundredths } from "@/lib/statements/miles";
import type { StatementContract, StatementLoad, WeekStatementInput } from "@/lib/statements/types";
import { loadFixtureLookups, loadFixtureManifest } from "@/lib/vektor/fixtures";
import type { LookupMaps } from "@/lib/vektor/map";
import { runImportPipeline } from "@/lib/vektor/pipeline";
import type { MappedLoad } from "@/lib/vektor/types";
import { readAppVersion } from "@/lib/version";

const WEEK = "2026-09-21";
const WEEK_END = "2026-09-27";
const RANGE = { rangeFrom: WEEK, rangeTo: WEEK_END };
const OWNED = "11111111-1111-4111-8111-111111111102";
const MANAGED = "22222222-2222-4222-8222-222222222203";
const FUEL_UNITS = ["02", "03", "04", "05", "06", "07", "08"];

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

type FuelFile = {
  truck3Unit: string;
  truck3RetailMinusDiscountedCents: number;
  transactions: unknown[];
};

type TollFile = {
  expectedCount: number;
  expectedAmountCents: number;
  trucks: Record<string, string>;
  transactions: unknown[];
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function statementFixture(): StatementFixture {
  return readJson("fixtures/statements/week-2026-09-21.json");
}

function overviewFixture(): OverviewFixture {
  return readJson("fixtures/overview/week-2026-09-21.json");
}

function mergeLookups(files: string[]): LookupMaps {
  const lookups: LookupMaps = { drivers: {}, brokers: {}, trucks: {} };
  for (const file of files) {
    const part = loadFixtureLookups(file);
    Object.assign(lookups.drivers, part.drivers);
    Object.assign(lookups.brokers, part.brokers);
    Object.assign(lookups.trucks!, part.trucks ?? {});
  }
  return lookups;
}

function spansFor(units: string[]): LoadSpan[] {
  return units.map((unitNumber) => ({
    unitNumber,
    startDate: "2026-09-22",
    endDate: "2026-09-26",
  }));
}

function milesForSixMpg(rows: FuelDraft[]): WeekMiles[] {
  return rows
    .filter((row) => row.unitNumber && row.gallonsMilli)
    .map((row) => ({
      unitNumber: row.unitNumber!,
      weekStart: WEEK,
      milesHundredths: (row.gallonsMilli! * 3) / 5,
    }));
}

function loadFromMapped(mapped: MappedLoad): StatementLoad {
  return {
    id: mapped.loadId ?? mapped.manifestId,
    truckId: OWNED,
    unitNumber: mapped.truckUnitNumber,
    deliveryDate: mapped.deliveryDate?.slice(0, 10) ?? "",
    storedWeekStart: mapped.weekStart,
    grossCents: mapped.rateCents,
    loadedMilesHundredths: milesValueToHundredths(mapped.loadedDistanceMi),
    deadheadMilesHundredths: milesValueToHundredths(mapped.deadheadMiles),
  };
}

function referenceInput(loads: StatementLoad[]): WeekStatementInput {
  const fixture = statementFixture();
  return {
    weekStart: WEEK,
    trucks: fixture.trucks,
    contracts: fixture.contracts,
    loads,
    fuel: fixture.fuel,
    tolls: fixture.tolls,
    fixedVersions: fixture.fixedVersions,
    fixedOverrides: [],
    importRuns: [
      {
        kind: "loads",
        status: "success",
        rangeFrom: WEEK,
        rangeTo: WEEK_END,
        rowsFetched: 1,
        finishedAt: "2026-09-28T00:00:00Z",
      },
      {
        kind: "fuel",
        status: "success",
        rangeFrom: WEEK,
        rangeTo: WEEK_END,
        rowsFetched: fixture.fuel.length,
        finishedAt: "2026-09-28T00:00:00Z",
      },
      {
        kind: "tolls",
        status: "success",
        rangeFrom: WEEK,
        rangeTo: WEEK_END,
        rowsFetched: fixture.tolls.length,
        finishedAt: "2026-09-28T00:00:00Z",
      },
    ],
    rowCountDropPct: { loads: 50, fuel: 50, tolls: 50 },
  };
}

function weekLoadsFromImport(sampleA: MappedLoad): StatementLoad[] {
  const fixture = statementFixture();
  const imported = loadFromMapped(sampleA);
  const reference = fixture.loads.find((load) => load.id === "load-02-a");
  if (!reference) throw new Error("statement fixture is missing load-02-a");
  return [imported, ...fixture.loads.filter((load) => load.id !== "load-02-a")];
}

function reportSource(input: WeekStatementInput, sampleA: MappedLoad): WeeklyReportSource {
  const result = buildWeekStatements(input);
  const inWeek = input.loads.filter(
    (load) => load.deliveryDate >= WEEK && load.deliveryDate <= WEEK_END && load.truckId,
  );
  const loads: ReportLoadRow[] = inWeek.map((load) => {
    if (load.id === sampleA.loadId) {
      return {
        truckId: load.truckId!,
        loadNumber: sampleA.loadId,
        deliveryDate: load.deliveryDate,
        brokerName: sampleA.brokerName,
        origin: place(sampleA.originCity, sampleA.originState),
        destination: place(sampleA.destinationCity, sampleA.destinationState),
        loadedMilesHundredths: load.loadedMilesHundredths,
        deadheadMilesHundredths: load.deadheadMilesHundredths,
        rateCents: load.grossCents,
      };
    }
    return {
      truckId: load.truckId!,
      loadNumber: load.id,
      deliveryDate: load.deliveryDate,
      brokerName: null,
      origin: null,
      destination: null,
      loadedMilesHundredths: load.loadedMilesHundredths,
      deadheadMilesHundredths: load.deadheadMilesHundredths,
      rateCents: load.grossCents,
    };
  });
  return {
    weekStart: result.weekStart,
    weekEnd: result.weekEnd,
    locked: false,
    closedAt: null,
    units: result.units,
    fleet: result.fleet,
    trucks: [
      { id: OWNED, name: "Truck Two", ownerName: "Legacy Inc Global" },
      { id: MANAGED, name: "Truck Three", ownerName: "Managed Owner" },
    ],
    loads,
    fuel: input.fuel.map((row) => ({
      unitNumber: row.unitNumber,
      amountCents: row.amountCents,
      gallonsMilli: 0,
      product: "diesel" as const,
    })),
    tolls: input.tolls.map((row) => ({
      unitNumber: row.unitNumber,
      amountCents: row.amountCents,
    })),
  };
}

function place(city: string | null, state: string | null): string | null {
  const text = [city, state].filter((part) => part && part.length > 0).join(", ");
  return text.length > 0 ? text : null;
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

describe("week 2026-09-21 fixture close", () => {
  const files = [
    "sample-a-manifest-1152.json",
    "sample-b-manifest-1101.json",
    "sample-c-manifest-1146.json",
  ];
  const imported = runImportPipeline(
    files.map((file) => loadFixtureManifest(file)),
    {
      lookups: mergeLookups(files),
      knownTruckUnits: new Set(["02"]),
      ...RANGE,
      previousFetched: null,
      settings: { rowCountDropBlockPct: 50 },
    },
  );
  const sampleA = imported.decisions.find((row) => row.mapped.manifestFriendlyId === "1152");
  const sampleB = imported.decisions.find((row) => row.mapped.manifestFriendlyId === "1101");
  const sampleC = imported.decisions.find((row) => row.mapped.manifestFriendlyId === "1146");
  const fuelFile = readJson<FuelFile>("fixtures/vektor/fuel-week-2026-09-21.json");
  const tollFile = readJson<TollFile>("fixtures/vektor/tolls-week-2026-09-21.json");
  const fuelDrafts = fuelFile.transactions.map((row) => mapFuelRecord(row));
  const fuelImport = runFuelPipeline(fuelDrafts, {
    knownUnits: new Set(FUEL_UNITS),
    loadSpans: spansFor(FUEL_UNITS),
    weekMiles: milesForSixMpg(fuelDrafts),
    ...RANGE,
    previousFetched: null,
    settings: FUEL_TOLL_SETTING_DEFAULTS,
    existingDuplicates: [],
  });
  const tollImport = runTollPipeline(
    tollFile.transactions.map((row) => mapTollRecord(row, new Map(Object.entries(tollFile.trucks)))),
    {
      knownUnits: new Set(FUEL_UNITS),
      loadSpans: spansFor(FUEL_UNITS),
      ...RANGE,
      previousFetched: null,
      settings: FUEL_TOLL_SETTING_DEFAULTS,
      existingDuplicates: [],
    },
  );

  it("imports Sample A into this week and keeps Sample B and Sample C out", () => {
    expect(imported.blocked).toBe(false);
    expect(sampleA?.promote).toBe(true);
    expect(sampleA?.mapped.weekStart).toBe(WEEK);
    expect(sampleA?.mapped.weekEnd).toBe(WEEK_END);
    expect(sampleA?.mapped.loadId).toBe("TBH--1152");
    expect(sampleA?.mapped.rateCents).toBe(220_000);
    expect(sampleA?.mapped.loadedDistanceMi).toBe(332);
    expect(sampleA?.mapped.deadheadMiles).toBe(14);
    expect(sampleA?.mapped.truckUnitNumber).toBe("02");
    expect(sampleA?.mapped.deliveryDate?.slice(0, 10)).toBe("2026-09-26");

    expect(sampleB?.promote).toBe(true);
    expect(sampleB?.mapped.deliveryDate?.slice(0, 10)).toBe("2026-09-11");
    expect(sampleB?.issues.some((issue) => issue.rule === "date_outside_range")).toBe(true);

    expect(sampleC?.promote).toBe(false);
    expect(sampleC?.mapped.eligible).toBe(false);
  });

  it("imports the fuel and toll stand-in, which is not the statement ledger", () => {
    expect(fuelImport.blocked).toBe(false);
    expect(fuelImport.weekIssues).toEqual([]);
    expect(fuelImport.decisions.every((row) => row.promote)).toBe(true);
    const fuelTotals = fuelWeekTotals(
      fuelImport.decisions.map((row) => row.draft),
      WEEK,
    );
    const truck3 = fuelTotals.find((row) => row.unitNumber === fuelFile.truck3Unit);
    if (!truck3) throw new Error("unit 03 fuel total missing");
    expect(truck3.retailAmountCents - truck3.amountCents).toBe(100);
    expect(truck3.retailAmountCents - truck3.amountCents).toBe(
      fuelFile.truck3RetailMinusDiscountedCents,
    );
    const fuelCents = fuelTotals.reduce((sum, row) => sum + row.amountCents, 0);

    expect(tollImport.blocked).toBe(false);
    const promotedTolls = tollImport.decisions.filter((row) => row.promote).map((row) => row.draft);
    const tollTotals = tollWeekTotals(promotedTolls, WEEK);
    const tollCents = tollTotals.reduce((sum, row) => sum + row.amountCents, 0);
    expect(promotedTolls).toHaveLength(66);
    expect(tollCents).toBe(32_153);
    expect(tollCents).toBe(tollFile.expectedAmountCents);

    const fixture = statementFixture();
    const statementFuel = fixture.fuel.reduce((sum, row) => sum + row.amountCents, 0);
    const statementTolls = fixture.tolls.reduce((sum, row) => sum + row.amountCents, 0);
    expect(statementFuel).toBe(75_000);
    expect(statementTolls).toBe(1_734);
    expect(fuelCents).not.toBe(statementFuel);
    expect(tollCents).not.toBe(statementTolls);
  });

  it("resolves this week's fixed expenses from the statement fixture", () => {
    const fixture = statementFixture();
    const resolved = fixture.fixedVersions.map((version) =>
      lookupWeeklyFixedExpense({
        versions: fixture.fixedVersions,
        overrides: [],
        truckId: version.truckId,
        kind: version.kind,
        weekStart: WEEK,
      }),
    );
    expect(resolved.map((row) => row.amountCents)).toEqual([10_000, 2_000, 500, 1_500]);
    expect(resolved.map((row) => row.chargedTo)).toEqual(["owner", "owner", "management", "owner"]);
    expect(resolved.every((row) => row.source === "version")).toBe(true);
  });

  it("closes the reference week when Sample A replaces load 1152", () => {
    expect(sampleA).toBeTruthy();
    const fixture = statementFixture();
    const reference = fixture.loads.find((load) => load.id === "load-02-a");
    const importedLoad = loadFromMapped(sampleA!.mapped);
    expect(importedLoad).toMatchObject({
      id: "TBH--1152",
      truckId: OWNED,
      unitNumber: "02",
      deliveryDate: reference?.deliveryDate,
      storedWeekStart: reference?.storedWeekStart,
      grossCents: reference?.grossCents,
      loadedMilesHundredths: reference?.loadedMilesHundredths,
      deadheadMilesHundredths: reference?.deadheadMilesHundredths,
    });

    const result = buildWeekStatements(referenceInput(weekLoadsFromImport(sampleA!.mapped)));
    expect(result.closeAllowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.weekEnd).toBe(WEEK_END);
    expect(result.units.find((unit) => unit.unitNumber === "02")).toMatchObject({
      grossCents: 320_000,
      fuelCents: 50_000,
      tollsCents: 1_234,
      netCents: 134_686,
    });
    expect(result.units.find((unit) => unit.unitNumber === "03")).toMatchObject({
      grossCents: 580_000,
      fuelCents: 25_000,
      tollsCents: 500,
      netCents: 305_630,
    });
    expect(result.fleet.netCents).toBe(440_316);
    expect(result.units.some((unit) => unit.grossCents === 999_999 || unit.grossCents === 888_888)).toBe(
      false,
    );
    const payload = lockPayload(result);
    expect(payload.statements).toHaveLength(2);
    expect(payload.fleet.netCents).toBe(440_316);
  });

  it("renders the reference PDF and refuses the stand-in fuel file", async () => {
    expect(sampleA).toBeTruthy();
    const input = referenceInput(weekLoadsFromImport(sampleA!.mapped));
    const result = buildWeekStatements(input);
    expect(result.closeAllowed).toBe(true);
    const bytes = await weeklyStatementPdf(reportSource(input, sampleA!.mapped));
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = pdfText(bytes);
    expect(text).toContain("Legacy Inc Global");
    expect(text).toContain("TBH--1152");
    expect(text).toContain("Test Broker LLC");
    expect(text).toContain("Irving, TX");
    expect(text).toContain("Little Rock, AR");
    expect(text).toContain("$1,346.86");
    expect(text).toContain("$3,056.30");
    expect(text).toContain("$4,403.16");
    expect(text).toContain("$500.00");
    expect(text).toContain("$250.00");
    expect(text).toContain("Not stored");
    expect(text).toContain(`TRET.AI v${readAppVersion()}`);
    expect(text).not.toContain("$228.00");

    const fuelTotals = fuelWeekTotals(
      fuelImport.decisions.map((row) => row.draft),
      WEEK,
    );
    const blocked = buildWeekStatements({
      ...input,
      fuel: fuelTotals.map((row) => ({
        unitNumber: row.unitNumber,
        weekStart: WEEK,
        amountCents: row.amountCents,
      })),
    });
    expect(blocked.closeAllowed).toBe(false);
    const unlinked = blocked.blockers.filter((row) => row.rule === "unlinked_fuel_week_close");
    expect(unlinked.map((row) => row.ref).sort()).toEqual([
      "04:2026-09-21",
      "05:2026-09-21",
      "06:2026-09-21",
      "07:2026-09-21",
      "08:2026-09-21",
    ]);
    expect(() => lockPayload(blocked)).toThrow(/blockers/);

    const strayFuel: ReportFuelRow[] = fuelImport.decisions.map((row) => ({
      unitNumber: row.draft.unitNumber,
      amountCents: row.draft.amountCents ?? 0,
      gallonsMilli: row.draft.gallonsMilli ?? 0,
      product: row.draft.product,
    }));
    await expect(
      weeklyStatementPdf({
        ...reportSource(input, sampleA!.mapped),
        units: blocked.units,
        fleet: blocked.fleet,
        fuel: strayFuel,
      }),
    ).rejects.toBeInstanceOf(ReportBlockedError);
  });

  it("smokes the overview snapshot and the management P&L", () => {
    expect(sampleA).toBeTruthy();
    const result = buildWeekStatements(referenceInput(weekLoadsFromImport(sampleA!.mapped)));
    const snapshot = buildWeekSnapshot(result.units);
    expect(snapshot.fleet).toMatchObject({
      grossCents: 900_000,
      fuelCents: 75_000,
      tollsCents: 1_734,
      netCents: 440_316,
    });
    for (const row of [...snapshot.units, snapshot.fleet]) {
      expect(row.grossCents - row.feesCents - row.fuelCents - row.tollsCents - row.fixedCents).toBe(
        row.netCents,
      );
    }

    const pnl = buildManagementPnl({
      weekStart: WEEK,
      units: result.units,
      operatingExpenses: overviewFixture().operatingExpenses,
    });
    expect(pnl).toMatchObject({
      weekStart: WEEK,
      weekEnd: WEEK_END,
      legacyRetainedCents: 29_000,
      dispatchFeeCents: 46_600,
      incomeCents: 75_600,
      fixedManagementCents: 500,
      operatingExpenseCents: 12_500,
      expenseCents: 13_000,
      netCents: 62_600,
      tolsonPayableCents: 90_000,
    });
    expect(pnl.netCents).not.toBe(pnl.incomeCents - pnl.expenseCents - pnl.tolsonPayableCents);
  });

  it("lists this week's import warns and leaves close checks unresolved", () => {
    expect(sampleA && sampleB && sampleC).toBeTruthy();
    const overview = overviewFixture();
    const fromRun: ImportIssueInput[] = [sampleB!, sampleC!].flatMap((decision, decisionIndex) =>
      decision.issues.map((issue, issueIndex) => ({
        id: `run-${decisionIndex}-${issueIndex}`,
        severity: issue.severity,
        rule: issue.rule,
        message: issue.message,
        ref: issue.ref ?? null,
        status: "open",
        createdAt: "2026-09-27T12:00:00.000Z",
        rangeFrom: WEEK,
        rangeTo: WEEK_END,
      })),
    );
    const clean = buildWeekStatements(referenceInput(weekLoadsFromImport(sampleA!.mapped)));
    const rows = buildInbox({
      weekStart: WEEK,
      imports: [...overview.importIssues, ...fromRun],
      blockers: clean.blockers,
    });
    const open = filterInbox(rows, { severity: "all", status: "open" });
    expect(open.map((row) => row.rule)).toEqual(
      expect.arrayContaining(["date_outside_range", "loaded_zero_vs_auto", "truck_unmatched", "vektor_auth"]),
    );
    expect(open.some((row) => row.rule === "excluded_manifest" || row.rule === "note")).toBe(false);
    expect(open.every((row) => row.source === "import")).toBe(true);

    const fuelTotals = fuelWeekTotals(
      fuelImport.decisions.map((row) => row.draft),
      WEEK,
    );
    const blocked = buildWeekStatements({
      ...referenceInput(weekLoadsFromImport(sampleA!.mapped)),
      fuel: fuelTotals.map((row) => ({
        unitNumber: row.unitNumber,
        weekStart: WEEK,
        amountCents: row.amountCents,
      })),
    });
    const withClose = buildInbox({
      weekStart: WEEK,
      imports: overview.importIssues,
      blockers: blocked.blockers,
    });
    const closeRows = filterInbox(withClose, { severity: "Block", status: "open" }).filter(
      (row) => row.source === "close",
    );
    expect(closeRows.length).toBeGreaterThan(0);
    expect(closeRows.every((row) => canResolveIssue(row))).toBe(false);
    const warn = withClose.find((row) => row.rule === "truck_unmatched");
    expect(warn && canResolveIssue(warn)).toBe(true);
  });
});
