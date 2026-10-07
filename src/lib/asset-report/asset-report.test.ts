import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildAssetReport } from "./build";
import { renderAssetReportPdf } from "./pdf";

const WEEK = { weekStart: "2026-08-31", weekEnd: "2026-09-06" };

const LEDGER = [
  ["Truck ID", "T003", "Truck #", "3", "Primary Driver", "John Reed", "Status", "Active"],
  ["Delivery Date", "Load ID", "Rate", "Loaded Miles", "Deadhead Miles", "Broker/Customer", "Origin", "Destination"],
  ["2026-09-01 0:00:00", "TBH-1081", "$1,600.00", "100", "0", "Axle", "Montgomery, AL", "Selma, AL"],
  ["2026-09-03 0:00:00", "TBH-1097", "$3,200.00", "50", "0", "Bennett", "Lewisville, TX", "Albany, NY"],
];

const WEEKLY = [
  ["Week Start Date", "Driver", "Driver Compensation", "Management Fee", "Dispatch Fee", "Factoring Fee", "Maintenance Escrow Weekly", "ELD Fee", "Yard Fee", "GPS Tracker", "Insurance", "Truck Pymts", "Trailer Pymts", "Toll Fees", "Toll Pass", "Permit Fees", "Fuel"],
  ["08/31/2026", "John Reed", "$960.00", "$0.00", "$264.00", "$84.00", "$200.00", "$47.25", "$12.93", "$8.50", "$288.71", "$247.50", "$65.52", "$0.00", "", "$0.00", "$0.00"],
];

const FUEL = [
  ["Date", "Gallons", "Total Cost", "Miles"],
  ["09/01/2026", "10", "$40.00", "100"],
];

const FLEET = [
  ["Truck Number", "Primary Driver", "Status", "VIN"],
  ["3", "John Reed", "Active", "VIN123"],
];

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
    for (const match of content.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = match[1] ?? "";
      let text = "";
      for (let i = 0; i + 1 < hex.length; i += 2) {
        text += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
      }
      chunks.push(text);
    }
    index = end + "\nendstream".length;
  }
  return chunks.join("\n");
}

describe("weekly asset report", () => {
  it("builds owner earnings from the sheet and renders the template sections", async () => {
    const report = buildAssetReport({
      ...WEEK,
      unitNumber: "3",
      ownerName: "Tolson Blackhawk LLC",
      ledger: LEDGER,
      weekly: WEEKLY,
      fuelLog: FUEL,
      fleet: FLEET,
      sheetNote: null,
    });
    expect(report.grossCents).toBe(480_000);
    expect(report.loadCount).toBe(2);
    expect(report.driver).toBe("John Reed");
    expect(report.assetStatus).toBe("Active");
    expect(report.truckLine).toContain("VIN123");
    expect(report.leftExpenses.find((line) => line.label.startsWith("Driver"))?.cents).toBe(96_000);
    expect(report.leftExpenses.find((line) => line.label === "MC Lease")?.cents).toBe(31_302);
    expect(report.fuelCostCents).toBe(4_000);
    expect(report.fuelEconomy).toBe("10.00");
    expect(report.netCents).toBe(report.grossCents - report.expenseCents);
    const text = pdfText(await renderAssetReportPdf(report));
    expect(text).toContain("LEGACY INC GLOBAL");
    expect(text).toContain("Weekly Asset Management Report");
    expect(text).toContain("Executive Summary");
    expect(text).toContain("Weekly Load Activity");
    expect(text).toContain("TBH-1081");
    expect(text).toContain("Owner Earnings");
    expect(text).toContain("Fuel Summary and Compliance");
    expect(text).toContain("John Reed");
    expect(text).toContain("Tolson Blackhawk LLC");
    expect(text).not.toContain("\u2014");
    expect(text).not.toContain("\u2013");
  });
});
