import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiStatusCard } from "@/components/integrations/ai-status";
import { buildAssetReport } from "@/lib/asset-report/build";
import { gridFromUpload } from "@/lib/fuel-tolls/file/parse";
import { STANDARD_FUEL_HEADER } from "@/lib/fuel-tolls/file/plan";
import type { TollQueuePayload } from "@/lib/fuel-tolls/file/types";
import { applyImportedFuelToll, type WeekSnapshot } from "@/lib/overview/snapshot";
import { CsvExportAdapter } from "@/lib/vektor/adapters/csv-adapter";
import { displayedFuelToll } from "./aggregate";
import {
  columnLetter,
  performApprovedWrites,
  runSharedImport,
  sheetFuelCents,
  sheetTollCents,
  TOLL_COLUMN,
} from "./run";

const fuelCsv = readFileSync("fixtures/fuel/fuel-card-2026-10-05.csv", "utf8");
const tollXlsx = new Uint8Array(readFileSync("fixtures/tolls/ezpass-2026-10-05.xlsx"));
const vektorCsv = readFileSync("fixtures/vektor/vektor-loads-2026-10-05.csv", "utf8");
const range = { from: "2026-10-05", to: "2026-10-07" };

describe("shared import pipeline", () => {
  it("runs fuel, tolls, and the Oct 5 to 7 Vektor CSV through one pipeline", async () => {
    const fetched = await new CsvExportAdapter().fetchManifests({ ...range, csvText: vektorCsv });
    let geminiCalls = 0;
    const result = await runSharedImport({
      vektorCsv,
      vektorManifests: fetched.manifests,
      vektorLookups: fetched.lookups,
      knownTruckUnits: new Set(["2", "3", "4", "5", "6", "7", "8"]),
      range,
      fuelGrid: gridFromUpload({ csvText: fuelCsv }),
      tollGrid: gridFromUpload({ xlsx: tollXlsx }),
      context: {
        fuelLogs: ["2", "3", "4", "5", "6", "7", "8"].map((unitNumber) => ({
          unitNumber,
          grid: [STANDARD_FUEL_HEADER],
        })),
      },
      env: {},
      fetchImpl: (async () => {
        geminiCalls += 1;
        throw new Error("Gemini was called without a key");
      }) as typeof fetch,
    });

    expect(geminiCalls).toBe(0);
    expect(result.aiNotice).toBeNull();
    expect(columnLetter(TOLL_COLUMN)).toBe("AS");

    const fuelRows = result.fuel?.rows ?? [];
    const truck3 = fuelRows.filter((row) => row.truck === "Truck 3" && row.status === "new");
    expect(truck3.length).toBe(5);
    const invoice = fuelRows.filter(
      (row) => row.payload?.kind === "fuel" && row.payload.invoice === "0903522326",
    );
    expect(invoice.map((row) => (row.payload?.kind === "fuel" ? row.payload.amountCents : 0))).toEqual([25101, 2064]);
    expect(fuelRows.find((row) => row.payload?.kind === "fuel" && row.payload.invoice === "0094969")?.amountCents).toBe(26032);

    const tollRows = result.toll?.rows ?? [];
    const skyway = tollRows.find(
      (row) => row.payload?.kind === "toll" && (row.payload as TollQueuePayload).transactionId === "1505564277",
    );
    expect(skyway?.truck).toBe("Truck 3");
    expect((skyway?.payload as TollQueuePayload).occurredAt).toBe("2026-10-07T11:56:59");
    const plateRows = tollRows.filter((row) => row.truck === "Truck 8");
    expect(plateRows.length).toBeGreaterThan(0);

    const loadIds = result.writes.vektor.map((row) => `${row.unitNumber}|${row.loadId}`);
    expect(new Set(loadIds).size).toBe(new Set(result.writes.vektor.map((row) => row.loadId)).size);
    expect(result.writes.vektor.some((row) => row.loadId === "TBH--1186" && row.unitNumber === "3")).toBe(true);
    expect(result.writes.vektor.filter((row) => row.field === "loaded_miles").length).toBeGreaterThan(0);

    for (const row of [...fuelRows, ...tollRows]) {
      if (row.status !== "flagged") continue;
      expect(result.review.some((item) => item.reason === row.reason)).toBe(true);
      expect(row.cells).toEqual([]);
    }

    expect(result.totals.length).toBeGreaterThan(0);
    for (const week of result.totals) {
      expect(displayedFuelToll(week)).toEqual({
        fuelCents: sheetFuelCents(result.writes, week.unitNumber, week.weekStart),
        tollCents: sheetTollCents(result.writes, week.unitNumber, week.weekStart),
      });
      const report = buildAssetReport({
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        unitNumber: week.unitNumber,
        ownerName: null,
        ledger: null,
        weekly: null,
        fuelLog: null,
        fleet: null,
        sheetNote: null,
        importTotals: week,
      });
      expect(report.fuelCostCents).toBe(week.fuelCostCents);
      expect(report.leftExpenses.find((line) => line.label === "Fuel (Diesel + DEF)")?.cents).toBe(week.fuelCostCents);
      expect(report.rightExpenses.find((line) => line.label === "Toll Charges")?.cents).toBe(week.tollCents);
      expect(report.dispatchMilesHundredths).toBe(week.dispatchMilesHundredths);
      expect(report.loadedMilesHundredths).toBe(week.loadedMilesHundredths);
      expect(report.fuelEconomy).toBe(week.mpgLabel ?? "n/a");

      const grossCents = week.fuelCostCents + week.tollCents + 500;
      const snapshot: WeekSnapshot = {
        units: [
          {
            unitNumber: week.unitNumber,
            truckClass: "third_party",
            grossCents,
            feesCents: 0,
            fuelCents: 0,
            tollsCents: 0,
            fixedCents: 500,
            netCents: 0,
          },
        ],
        fleet: {
          unitNumber: "Fleet",
          truckClass: null,
          grossCents,
          feesCents: 0,
          fuelCents: 0,
          tollsCents: 0,
          fixedCents: 500,
          netCents: 0,
        },
      };
      const dashboard = applyImportedFuelToll(snapshot, [week]);
      expect(dashboard.units[0]?.fuelCents).toBe(week.fuelCostCents);
      expect(dashboard.units[0]?.tollsCents).toBe(week.tollCents);
    }

    let wrote = false;
    await performApprovedWrites(result.writes, async () => {
      wrote = true;
    });
    expect(wrote).toBe(true);
    expect(result.writes.fuel.some((cell) => cell.header === "Total Cost")).toBe(true);
    expect(result.writes.tolls.every((cell) => cell.header === "Toll Expense" && cell.a1.startsWith("AS"))).toBe(true);
    expect(result.totals.some((week) => week.fuelCostCents > 0)).toBe(true);
  });

  it("shows AI status as OK, Busy, or Not set and does not print a key", () => {
    for (const status of ["OK", "Busy", "Not set"] as const) {
      const html = renderToStaticMarkup(createElement(AiStatusCard, { status }));
      expect(html).toContain("AI status");
      expect(html).toContain(status);
      expect(html).toContain("The key is not shown.");
      expect(html).not.toContain("GEMINI_API_KEY");
    }
  });
});
