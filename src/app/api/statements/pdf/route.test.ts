import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TruckClass } from "@/lib/fee-engine";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { buildWeekStatements } from "@/lib/statements/engine";
import type { StatementsPageData } from "@/lib/statements/queries";
import { overlaySheetStatements } from "@/lib/statements/sheet-week";
import type { UnitStatement, WeekStatementInput, WeekStatements } from "@/lib/statements/types";

const { loadStatementsMock, sheetsMock, clientMock } = vi.hoisted(() => ({
  loadStatementsMock: vi.fn(),
  sheetsMock: vi.fn(),
  clientMock: vi.fn(),
}));

vi.mock("@/lib/auth/access", () => ({
  checkAccess: async () => ({ status: "allowed" }),
}));

vi.mock("@/lib/statements/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/statements/queries")>("@/lib/statements/queries");
  return {
    ...actual,
    loadStatements: (...args: unknown[]) => loadStatementsMock(...args),
  };
});

vi.mock("@/lib/sheets/load-week", () => ({
  loadActiveTruckInsOuts: (...args: unknown[]) => sheetsMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => clientMock(),
}));

import { GET } from "./route";

const WEEK = "2026-10-05";

function readFixture(): WeekStatementInput {
  const raw = JSON.parse(readFileSync(resolve("fixtures/statements/week-2026-09-21.json"), "utf8")) as Omit<
    WeekStatementInput,
    "fixedOverrides" | "importRuns" | "rowCountDropPct"
  >;
  return {
    ...raw,
    fixedOverrides: [],
    importRuns: [],
    rowCountDropPct: { loads: 50, fuel: 50, tolls: 50 },
  };
}

function pageFrom(input: WeekStatementInput, extra: Partial<StatementsPageData>): StatementsPageData {
  const result = buildWeekStatements(input);
  return {
    ready: true,
    lockReady: true,
    error: null,
    weekStart: WEEK,
    weekEnd: "2026-10-11",
    locked: false,
    closedAt: null,
    closedBy: null,
    liveDiffers: false,
    units: result.units,
    fleet: result.fleet,
    blockers: [],
    liveBlockers: [],
    warnings: [{ rule: "sheet_fee_differs", message: "Truck 02: sheet fee differs", ref: "02" }],
    closeAllowed: true,
    pending: [],
    ...extra,
  };
}

function chain(data: unknown) {
  const builder = {
    select() {
      return builder;
    },
    gte() {
      return builder;
    },
    lte() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

describe("GET /api/statements/pdf", () => {
  const input = readFixture();

  beforeEach(() => {
    sheetsMock.mockResolvedValue({ rows: [], error: null });
    clientMock.mockResolvedValue({
      from(table: string) {
        if (table === "trucks") {
          return chain([
            { id: "11111111-1111-4111-8111-111111111102", name: "Truck Two", owner_name: "Legacy Inc Global" },
            { id: "22222222-2222-4222-8222-222222222203", name: "Truck Three", owner_name: "Managed Owner" },
          ]);
        }
        if (table === "loads") {
          return chain(
            input.loads
              .filter((load) => load.deliveryDate >= "2026-09-21" && load.deliveryDate <= "2026-09-27" && load.truckId)
              .map((load) => ({
                id: load.id,
                truck_id: load.truckId,
                load_id: load.id,
                delivery_date: load.deliveryDate,
                broker_name: null,
                origin_city: null,
                origin_state: null,
                destination_city: null,
                destination_state: null,
                loaded_distance_mi: 10,
                deadhead_miles: 1,
                rate_cents: load.grossCents + 100,
              })),
          );
        }
        if (table === "fuel_transactions") {
          return chain([
            { unit_number: "02", amount_cents: 1, gallons_milli: 1000, product: "diesel" },
            { unit_number: "03", amount_cents: 1, gallons_milli: 1000, product: "diesel" },
          ]);
        }
        return chain([{ unit_number: "02", amount_cents: 1 }]);
      },
    });
  });

  it("returns a PDF for week 2026-10-05 when the only issues are warnings", async () => {
    loadStatementsMock.mockResolvedValue(pageFrom(input, {}));
    const response = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("returns the per-truck PDF and the all-trucks Monday PDF from the same route", async () => {
    loadStatementsMock.mockResolvedValue(pageFrom(input, {}));
    const one = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}&unit=02`));
    expect(one.status).toBe(200);
    expect(one.headers.get("content-type")).toContain("application/pdf");
    expect(one.headers.get("content-disposition")).toContain("unit-02");
    const all = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(all.status).toBe(200);
    expect(all.headers.get("content-disposition")).toContain(`tret-statement-${WEEK}.pdf`);
    expect(Buffer.from(new Uint8Array(await all.arrayBuffer())).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("still refuses the PDF when the week has a blocker", async () => {
    loadStatementsMock.mockResolvedValue(
      pageFrom(input, {
        warnings: [],
        blockers: [{ rule: "unlinked_fuel_week_close", message: "Fuel is not linked.", ref: "02" }],
        closeAllowed: false,
      }),
    );
    const response = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Fuel is not linked.");
  });

  it("returns the PDF when imported rows disagree and there are no warnings", async () => {
    loadStatementsMock.mockResolvedValue(pageFrom(input, { warnings: [] }));
    const response = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(Buffer.from(new Uint8Array(await response.arrayBuffer())).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("returns a PDF for the week 41 fixture, for every unit and for unit 3", async () => {
    const statements = week41Statements();
    const unit3 = statements.units.find((unit) => unit.unitNumber === "3");
    const unit4 = statements.units.find((unit) => unit.unitNumber === "4");
    expect(unit3?.fixedOwnerCents).toBe(67_041);
    expect(unit3?.lines.find((line) => line.lineCode === "MISC")?.amountCents).toBe(97_488);
    expect(unit3?.lines.find((line) => line.lineCode === "SHEET_FIXED")?.label).toBe("Fixed");
    expect(unit3?.lines.find((line) => line.lineCode === "SHEET_FIXED")?.amountCents).toBe(67_041);
    expect(unit3?.netCents).toBe(151_340);
    expect(unit4?.fixedOwnerCents).toBe(67_726);
    expect(unit4?.lines.find((line) => line.lineCode === "MISC")?.amountCents).toBe(227_502);
    expect(unit4?.netCents).toBe(-264_909);
    loadStatementsMock.mockResolvedValue({
      ready: true,
      lockReady: true,
      error: null,
      weekStart: WEEK,
      weekEnd: "2026-10-11",
      locked: false,
      closedAt: null,
      closedBy: null,
      liveDiffers: false,
      units: statements.units,
      fleet: statements.fleet,
      blockers: [],
      liveBlockers: [],
      warnings: [{ rule: "sheet_fee_differs", message: "Truck 4: sheet fee differs", ref: "4" }],
      closeAllowed: true,
      pending: [],
    });
    const all = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(all.status).toBe(200);
    expect(all.headers.get("content-type")).toContain("application/pdf");
    expect(Buffer.from(new Uint8Array(await all.arrayBuffer())).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const one = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}&unit=3`));
    expect(one.status).toBe(200);
    expect(one.headers.get("content-type")).toContain("application/pdf");
    expect(one.headers.get("content-disposition")).toContain("unit-3");
    const oneBytes = new Uint8Array(await one.arrayBuffer());
    expect(Buffer.from(oneBytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = pdfText(oneBytes);
    expect(text).toContain("Misc");
    expect(text).toContain("$974.88");
    expect(text).toContain("$670.41");
    expect(text).not.toContain("$1,645.29");
  });

  it("builds Monday reports as one owner report per truck", async () => {
    loadStatementsMock.mockResolvedValue(pageFrom(input, {}));
    const statement = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    const monday = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}&monday=1`));
    expect(monday.status).toBe(200);
    expect(monday.headers.get("content-disposition")).toContain(`tret-monday-reports-${WEEK}.pdf`);
    const statementBytes = new Uint8Array(await statement.arrayBuffer());
    const mondayBytes = new Uint8Array(await monday.arrayBuffer());
    const statementDoc = await PDFDocument.load(statementBytes);
    const mondayDoc = await PDFDocument.load(mondayBytes);
    expect(mondayDoc.getPageCount()).toBeGreaterThan(statementDoc.getPageCount());
    const text = pdfText(mondayBytes);
    expect(text.split("Fleet totals").length - 1).toBeGreaterThan(1);
    expect(text).toContain("Unit 02");
    expect(text).toContain("Unit 03");
  });

  it("prints sheet MPG and gallons on the owner PDF", async () => {
    const statements = week41Statements();
    loadStatementsMock.mockResolvedValue({
      ready: true,
      lockReady: true,
      error: null,
      weekStart: WEEK,
      weekEnd: "2026-10-11",
      locked: false,
      closedAt: null,
      closedBy: null,
      liveDiffers: false,
      units: statements.units,
      fleet: statements.fleet,
      blockers: [],
      liveBlockers: [],
      warnings: [],
      closeAllowed: true,
      pending: [],
    });
    sheetsMock.mockResolvedValue({
      rows: [
        {
          unitNumber: "3",
          readable: true,
          mpg: "7.16",
          mpgFromSheet: true,
          reportDieselGallonsMilli: 398_320,
          reportDefGallonsMilli: 12_500,
        },
        { unitNumber: "6", readable: true, mpg: null, reportDieselGallonsMilli: 40_000 },
      ],
      error: null,
    });
    const response = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}&unit=3`));
    expect(response.status).toBe(200);
    const text = pdfText(new Uint8Array(await response.arrayBuffer()));
    expect(text).toContain("7.16");
    expect(text).toContain("398.320");
    expect(text).toContain("12.500");
    const open = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}&unit=6`));
    expect(open.status).toBe(200);
    const openText = pdfText(new Uint8Array(await open.arrayBuffer()));
    expect(openText).toContain("Not stored");
    expect(openText).not.toContain("16.72");
    expect(openText).not.toContain("7.16");
  });
});

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

type Week41Truck = {
  unit: string;
  grossCents: number;
  milesHundredths: number;
  miscCents: number;
  driverCents: number;
  dispatchCents: number;
  factoringCents: number;
  managementCents: number;
  fuelCents: number;
  tollCents: number;
  expenseCents: number;
  legacyCents: number;
  tolsonCents: number;
  deadheadHundredths: number;
  loads: number;
};

const WEEK_41: Week41Truck[] = [
  { unit: "1", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, expenseCents: 72_945, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0 },
  { unit: "2", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, managementCents: 0, fuelCents: 139_665, tollCents: 0, expenseCents: 217_957, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0 },
  { unit: "3", loads: 4, grossCents: 855_000, milesHundredths: 285_200, miscCents: 97_488, driverCents: 171_000, dispatchCents: 47_025, factoringCents: 14_963, managementCents: 85_500, fuelCents: 156_430, tollCents: 64_213, expenseCents: 703_660, legacyCents: 85_500, tolsonCents: 0, deadheadHundredths: 22_100 },
  { unit: "4", loads: 1, grossCents: 250_000, milesHundredths: 150_700, miscCents: 227_502, driverCents: 68_125, dispatchCents: 0, factoringCents: 0, managementCents: 45_000, fuelCents: 106_556, tollCents: 0, expenseCents: 514_909, legacyCents: 25_000, tolsonCents: 20_000, deadheadHundredths: 8_100 },
  { unit: "5", loads: 5, grossCents: 720_000, milesHundredths: 258_839, miscCents: 0, driverCents: 192_600, dispatchCents: 0, factoringCents: 0, managementCents: 129_600, fuelCents: 108_260, tollCents: 0, expenseCents: 507_222, legacyCents: 72_000, tolsonCents: 57_600, deadheadHundredths: 28_839 },
  { unit: "6", loads: 2, grossCents: 200_000, milesHundredths: 69_880, miscCents: 0, driverCents: 53_500, dispatchCents: 0, factoringCents: 0, managementCents: 36_000, fuelCents: 116_586, tollCents: 0, expenseCents: 289_541, legacyCents: 20_000, tolsonCents: 16_000, deadheadHundredths: 2_987 },
  { unit: "7", loads: 2, grossCents: 470_000, milesHundredths: 130_076, miscCents: 10_598, driverCents: 128_075, dispatchCents: 0, factoringCents: 0, managementCents: 84_600, fuelCents: 158_464, tollCents: 3_647, expenseCents: 455_496, legacyCents: 47_000, tolsonCents: 37_600, deadheadHundredths: 2_734 },
  { unit: "8", loads: 5, grossCents: 790_000, milesHundredths: 266_000, miscCents: 33_420, driverCents: 264_825, dispatchCents: 0, factoringCents: 0, managementCents: 142_200, fuelCents: 158_816, tollCents: 4_861, expenseCents: 684_584, legacyCents: 79_000, tolsonCents: 63_200, deadheadHundredths: 25_100 },
  { unit: "9", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, expenseCents: 0, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0 },
  { unit: "10", loads: 0, grossCents: 0, milesHundredths: 0, miscCents: 0, driverCents: 0, dispatchCents: 0, factoringCents: 0, managementCents: 0, fuelCents: 0, tollCents: 0, expenseCents: 0, legacyCents: 0, tolsonCents: 0, deadheadHundredths: 0 },
];

function week41Class(unit: string): TruckClass {
  if (unit === "1" || unit === "2") return "legacy_owned";
  if (unit === "3") return "tolson_owned";
  return "third_party";
}

function blankUnit(truck: Week41Truck): UnitStatement {
  return {
    truckId: `week41-${truck.unit}`,
    unitNumber: truck.unit,
    truckClass: week41Class(truck.unit),
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

function week41Row(truck: Week41Truck): TruckWeekInsOuts {
  return {
    unitNumber: truck.unit,
    truckName: `Truck ${truck.unit}`,
    truckClass: week41Class(truck.unit),
    insCents: truck.grossCents,
    outsCents: truck.expenseCents,
    netCents: truck.grossCents - truck.expenseCents,
    loadCount: truck.loads,
    loadedMilesHundredths: Math.max(0, truck.milesHundredths - truck.deadheadHundredths),
    deadheadMilesHundredths: truck.deadheadHundredths,
    truckMilesHundredths: truck.milesHundredths,
    miscCents: truck.miscCents,
    legacyFeeCents: truck.legacyCents,
    tolsonLeaseFeeCents: truck.tolsonCents,
    managementFeeCents: truck.managementCents,
    outsFromWeekly: true,
    note: null,
    noteDetail: null,
    readable: true,
    ledgerLoads: [],
    recentWeeks: [],
    categories: [
      { category: "Driver compensation", cents: truck.driverCents },
      { category: "Management fee", cents: truck.managementCents },
      { category: "Dispatch fee", cents: truck.dispatchCents },
      { category: "Factoring fee", cents: truck.factoringCents },
      { category: "Fuel", cents: truck.fuelCents },
      { category: "Toll fees", cents: truck.tollCents },
      { category: "Misc", cents: truck.miscCents },
    ],
  };
}

function week41Statements(): WeekStatements {
  const shell: WeekStatements = {
    weekStart: WEEK,
    weekEnd: "2026-10-11",
    units: WEEK_41.map(blankUnit),
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
  return overlaySheetStatements(shell, WEEK_41.map(week41Row));
}
