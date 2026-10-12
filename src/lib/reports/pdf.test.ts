import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildWeekStatements } from "@/lib/statements/engine";
import type { WeekStatementInput } from "@/lib/statements/types";
import { readAppVersion } from "@/lib/version";
import type { OwnerWeekLoad } from "@/lib/reports/owner-week";
import { weeklyStatementPdf } from "./build";
import { centsPerLoadedMile, formatDieselMpg, formatStatementDollars } from "./format";
import { alignPdfDetails } from "./pdf-details";
import { prepareWeeklyReport } from "./prepare";
import type { ReportLoadRow, WeeklyReportSource } from "./types";

const WEEK = "2026-09-21";

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

function inWeekLoads(input: WeekStatementInput): ReportLoadRow[] {
  return input.loads
    .filter((load) => load.deliveryDate >= WEEK && load.deliveryDate <= "2026-09-27" && load.truckId)
    .map((load) => ({
      truckId: load.truckId!,
      loadNumber: load.id === "load-02-a" ? "1152" : load.id,
      deliveryDate: load.deliveryDate,
      brokerName: load.id === "load-02-a" ? "Sample Broker" : null,
      origin: load.id === "load-02-a" ? "Dallas, TX" : null,
      destination: load.id === "load-02-a" ? "Atlanta, GA" : null,
      loadedMilesHundredths: load.loadedMilesHundredths,
      deadheadMilesHundredths: load.deadheadMilesHundredths,
      rateCents: load.grossCents,
    }));
}

function sheetLoad(loadId: string, rateCents: number, ledgerMilesHundredths: number, primary: boolean): OwnerWeekLoad {
  return {
    loadId,
    status: "Delivered",
    deliveryDay: "2026-09-26",
    pickupDay: null,
    rateCents,
    reason: null,
    manifestId: null,
    tripGroup: "M-9",
    sheetPrimary: primary,
    driver: null,
    origin: "Dallas",
    destination: "Atlanta",
    loadedMilesHundredths: 0,
    deadheadMilesHundredths: 0,
    ledgerMilesHundredths,
  };
}

function sourceFrom(input: WeekStatementInput, loads = inWeekLoads(input)): WeeklyReportSource {
  const result = buildWeekStatements(input);
  return {
    weekStart: result.weekStart,
    weekEnd: result.weekEnd,
    locked: false,
    closedAt: null,
    units: result.units,
    fleet: result.fleet,
    trucks: [
      { id: "11111111-1111-4111-8111-111111111102", name: "Truck Two", ownerName: "Legacy Inc Global" },
      { id: "22222222-2222-4222-8222-222222222203", name: "Truck Three", ownerName: "Managed Owner" },
    ],
    loads,
    fuel: [
      { unitNumber: "02", amountCents: 40_000, gallonsMilli: 100_000, product: "diesel" },
      { unitNumber: "02", amountCents: 10_000, gallonsMilli: 5_000, product: "def" },
      { unitNumber: "03", amountCents: 25_000, gallonsMilli: 20_000, product: "diesel" },
    ],
    tolls: [
      { unitNumber: "02", amountCents: 1_234 },
      { unitNumber: "03", amountCents: 500 },
    ],
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

describe("weekly statement PDF", () => {
  const input = readFixture();
  const source = sourceFrom(input);

  it("formats the fixture nets as dollars without floats", () => {
    expect(formatStatementDollars(134_686)).toBe("$1,346.86");
    expect(formatStatementDollars(305_630)).toBe("$3,056.30");
    expect(formatStatementDollars(440_316)).toBe("$4,403.16");
    expect(centsPerLoadedMile(320_000, 43_200)).toBe(741);
    expect(formatDieselMpg(43_200, 100_000)).toBe("4.32");
  });

  it("prepares per-unit and fleet figures from the week fixture", () => {
    const report = prepareWeeklyReport(source);
    const owned = report.units.find((unit) => unit.unitNumber === "02");
    const managed = report.units.find((unit) => unit.unitNumber === "03");
    expect(owned?.assetPartner).toBe("Legacy Inc Global");
    expect(owned?.trailer).toBe("Not stored");
    expect(owned?.vin).toBe("Not stored");
    expect(owned?.dispatcher).toBe("Not stored");
    expect(owned?.net.value).toBe("$1,346.86");
    expect(owned?.earnings.map((row) => row.label)).toContain("Tolson lease fee (10%)");
    expect(owned?.earnings.map((row) => row.label)).not.toContain("Legacy retained (5%)");
    expect(managed?.earnings.map((row) => row.label).join(" ")).not.toMatch(/Tolson|Legacy retained/);
    expect(managed?.net.value).toBe("$3,056.30");
    expect(managed?.fuelSummary[0]).toEqual({ label: "Discounted fuel (booked)", value: "$250.00" });
    expect(report.fleetRows.find((row) => row.label === "Net to owner")?.value).toBe("$4,403.16");
    expect(report.fleetRows.find((row) => row.label === "Discounted fuel")?.value).toBe("$750.00");
    const ownedUnit = source.units.find((unit) => unit.unitNumber === "02");
    const truckMiles = (ownedUnit?.loadedMilesHundredths ?? 0) + (ownedUnit?.deadheadMilesHundredths ?? 0);
    expect(owned?.performance.find((row) => row.label === "MPG")?.value).toBe("4.32");
    expect(owned?.performance.find((row) => row.label === "Rate per truck mile")?.value).toBe(
      formatStatementDollars(centsPerLoadedMile(ownedUnit?.grossCents ?? 0, truckMiles) ?? 0),
    );
    expect(owned?.performance.find((row) => row.label === "Fuel cost per truck mile")?.value).toBe(
      formatStatementDollars(centsPerLoadedMile(ownedUnit?.fuelCents ?? 0, truckMiles) ?? 0),
    );
    expect(owned?.loads[0]?.loadNumber).toBe("1152");
  });

  it("renders those dollars into the PDF", async () => {
    const bytes = await weeklyStatementPdf(source);
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = pdfText(bytes);
    expect(text).toContain("Legacy Inc Global");
    expect(text).toContain("1152");
    expect(text).toContain("Sample Broker");
    expect(text).toContain("Dallas, TX");
    expect(text).toContain("Atlanta, GA");
    expect(text).toContain("$1,346.86");
    expect(text).toContain("$3,056.30");
    expect(text).toContain("$4,403.16");
    expect(text).toContain("$500.00");
    expect(text).toContain("$250.00");
    expect(text).toContain("Discounted fuel (booked)");
    expect(text).toContain("Maintenance Escrow Weekly");
    expect(text).toContain("Yard Fee");
    expect(text).toContain("Not stored");
    expect(text).toContain(`TRET.AI v${readAppVersion()}`);
    expect(text).toContain("The owner keeps");
    expect(text).toContain("Rate per truck mile");
    expect(text).toContain("Fuel cost per truck mile");
    expect(text).not.toContain("Rate per loaded mile");
    expect(text).not.toContain("Fuel cost per loaded mile");
    expect(text).toContain("earned");
    expect(text).toContain("Where the money went");
    expect(text.replace(/\s+/g, " ")).toContain("not deducted again");
    expect(text).not.toContain("$228.00");
  });

  it("returns the PDF when the net does not reconcile", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = sourceFrom(input);
    const unit = broken.units.find((row) => row.unitNumber === "02");
    expect(unit).toBeTruthy();
    unit!.netCents += 1;
    const bytes = await weeklyStatementPdf(broken);
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(warn.mock.calls.some((call) => String(call[0]).includes("net does not match"))).toBe(true);
    warn.mockRestore();
  });

  it("returns the PDF when load gross does not match the statement", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const loads = inWeekLoads(input);
    const row = loads.find((load) => load.loadNumber === "1152");
    expect(row).toBeTruthy();
    row!.rateCents += 1;
    const bytes = await weeklyStatementPdf(sourceFrom(input, loads));
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(warn.mock.calls.some((call) => String(call[0]).includes("load gross does not match"))).toBe(true);
    warn.mockRestore();
  });

  it("shows a negative owner keeps amount", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const negative = sourceFrom(input);
    const unit = negative.units.find((row) => row.unitNumber === "02");
    expect(unit).toBeTruthy();
    unit!.netCents = -264_909;
    const bytes = await weeklyStatementPdf(negative);
    const text = pdfText(bytes);
    const at = text.indexOf("Owner keeps");
    expect(at).toBeGreaterThan(-1);
    expect(text.slice(at, at + 80)).toContain("-$2,649.09");
    expect(text).toContain("Net to owner");
    warn.mockRestore();
  });

  it("uses sheet MPG and gallons, and each shared-trip row's own miles", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const aligned = alignPdfDetails(source, [
      {
        unitNumber: "02",
        mpg: "7.16",
        mpgFromSheet: true,
        reportDieselGallonsMilli: 398_320,
        reportDefGallonsMilli: 12_500,
        weekLoads: [
          sheetLoad("TBH--1152", 220_000, 33_200, true),
          sheetLoad("TBH--1153", 100_000, 18_000, false),
        ],
      },
    ]);
    const report = prepareWeeklyReport(aligned);
    const owned = report.units.find((unit) => unit.unitNumber === "02");
    expect(owned?.performance.find((row) => row.label === "MPG")?.value).toBe("7.16");
    expect(owned?.fuelSummary.find((row) => row.label === "Diesel gallons")?.value).toBe("398.320");
    expect(owned?.fuelSummary.find((row) => row.label === "DEF gallons")?.value).toBe("12.500");
    expect(owned?.loads.map((load) => load.loaded)).toEqual(["332.00", "180.00"]);
    expect(owned?.loadTotals?.loaded).toBe("432.00");
    expect(owned?.loadNote).toBe(
      "Shared trip. Each row shows its own loaded miles. The total counts the trip once.",
    );
    warn.mockRestore();
  });

  it("leaves MPG blank when the sheet cell is blank", () => {
    const aligned = alignPdfDetails(source, [
      { unitNumber: "02", readable: true, mpg: null, reportDieselGallonsMilli: 100_000 },
    ]);
    const report = prepareWeeklyReport(aligned);
    const owned = report.units.find((unit) => unit.unitNumber === "02");
    expect(owned?.performance.find((row) => row.label === "MPG")?.value).toBe("Not stored");
    expect(owned?.fuelSummary.find((row) => row.label === "Diesel gallons")?.value).toBe("100.000");
  });

  it("returns the PDF when discounted fuel does not match the statement", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const drifted = sourceFrom(input);
    drifted.fuel = drifted.fuel.map((row) =>
      row.unitNumber === "03" ? { ...row, amountCents: row.amountCents + 100 } : row,
    );
    const bytes = await weeklyStatementPdf(drifted);
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(warn.mock.calls.some((call) => String(call[0]).includes("discounted fuel does not match"))).toBe(true);
    warn.mockRestore();
  });
});
