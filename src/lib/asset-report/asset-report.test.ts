import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildAssetReport, DEFAULT_DISPATCHER } from "./build";
import { PAGE_H, PAGE_W, renderAssetReportPdf } from "./pdf";

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
  ["Truck Number", "Primary Driver", "Status", "VIN", "Trailer Number", "Dispatcher", "Available for Dispatch"],
  ["3", "John Reed", "Active", "VIN123", "TR-9", "Alex Dispatch", "Shop"],
];

const TRUCK8_WEEK = { weekStart: "2026-10-05", weekEnd: "2026-10-11" };

const TRUCK8_LEDGER = [
  ["Primary Driver", "Brison", "Truck #", "8", "Status", "Active"],
  ["Delivery Date", "Load ID", "Rate", "Loaded Miles", "Deadhead Miles", "Broker/Customer", "Origin", "Destination"],
  ["10/05/2026", "TBH1179", "$2,400.00", "596", "78", "LANDSTAR TRANSPORTATION", "Spring Hill, TN", "Kansas City, KS"],
  ["10/06/2026", "TBH1184", "$1,100.00", "314", "10", "TALLGRASS FREIGHT", "Kansas City, MO", "Stillwater, OK"],
  ["10/08/2026", "TBH1188", "$1,800.00", "1165", "153", "TOTAL QUALITY LOGISTICS", "Afton, OK", "Richmond, VA"],
  ["10/08/2026", "TBH1192", "$1,700.00", "924", "0", "NEW ERA LOGISTICS INC", "Tulsa, OK", "Greenville, SC"],
];

const TRUCK8_WEEKLY = [
  ["Week Start Date", "Driver", "Driver Compensation", "Management Fee", "Dispatch Fee", "Factoring Fee", "Maintenance Escrow Weekly", "ELD Fee", "Yard Fee", "GPS Tracker", "Insurance", "Truck Pymts", "Trailer Pymts", "Toll Fees", "Toll Pass", "Permit Fees", "Fuel"],
  ["10/05/2026", "Brison", "$1,400.00", "$700.00", "$350.00", "$122.50", "$200.00", "$47.25", "$12.93", "$8.50", "$288.71", "$300.00", "$147.23", "$18.06", "$0.00", "$0.00", "$456.59"],
];

const TRUCK8_FUEL = [
  ["Date", "Gallons", "Total Cost", "Miles"],
  ["10/06/2026", "82.220", "$456.59", "1641.93"],
];

const TRUCK8_FLEET = [
  ["Truck Number", "Primary Driver", "Status"],
  ["8", "Brison", "Active"],
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
    expect(report.trailer).toBe("TR-9");
    expect(report.vin).toBe("VIN123");
    expect(report.truckLine).toContain("VIN123");
    expect(report.truckLine).toContain("TR-9");
    expect(report.dispatcher).toBe("Alex Dispatch");
    expect(report.availableForDispatch).toBe("Shop");
    expect(report.operatingCondition).toBe("Good");
    expect(report.revenuePerformance).toBe("Positive");
    expect(report.compliance).toBe("Good");
    expect(report.maintenance).toBe("Current");
    expect(report.loadsAccepted).toBe("2");
    expect(report.loadsDelivered).toBe("2");
    expect(report.onTime).toBe("100%");
    expect(report.claims).toBe("0");
    expect(report.cargoDamage).toBe("0");
    expect(report.serviceFailures).toBe("0");
    expect(report.cancellations).toBe("0");
    expect(report.leftExpenses.map((line) => line.label)).not.toContain("MC Lease");
    expect(report.leftExpenses.find((line) => line.label.startsWith("Driver"))?.cents).toBe(96_000);
    expect(report.leftExpenses.find((line) => line.label.startsWith("Management"))?.label).toBe("Management Fee - 10%");
    expect(report.expenseCents).toBe(190_539);
    expect(report.fuelCostCents).toBe(4_000);
    expect(report.fuelEconomy).toBe("10.00");
    expect(report.netCents).toBe(report.grossCents - report.expenseCents);
    expect(report.notes.join(" ")).not.toContain("MC Lease");
    const bytes = await renderAssetReportPdf(report);
    const text = pdfText(bytes);
    expect(text).toContain("TBH--1081");
    expect(text).toContain("Escrow Balance (this week)");
    expect(text).not.toContain("Weekly Escrow");
    expect(text).toContain("John Reed");
    expect(text).toContain("Tolson Blackhawk LLC");
    expect(text).toContain("08/31/26 to 09/06/26");
    expect(text).not.toContain("MC Lease");
    expect(text).not.toContain("Not stored");
    expect(text).not.toContain("\u2014");
    expect(text).not.toContain("\u2013");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    expect(pdf.getPage(0).getWidth()).toBe(PAGE_W);
    expect(pdf.getPage(0).getHeight()).toBe(PAGE_H);
  });

  it("drops truck and trailer payments and fills active defaults for truck 8", async () => {
    const report = buildAssetReport({
      ...TRUCK8_WEEK,
      unitNumber: "8",
      ownerName: "Brison Hunter",
      ledger: TRUCK8_LEDGER,
      weekly: TRUCK8_WEEKLY,
      fuelLog: TRUCK8_FUEL,
      fleet: TRUCK8_FLEET,
      sheetNote: null,
      manifestRefs: {
        TBH1188: "1195",
        TBH1192: "1195",
      },
    });
    expect(report.grossCents).toBe(700_000);
    expect(report.loadedMilesHundredths).toBe(207_500);
    expect(report.loads.find((load) => load.loadId === "TBH--1192")?.manifestRole).toBe("partial");
    expect(report.loads.find((load) => load.loadId === "TBH--1188")?.manifestRole).toBe("primary");
    expect(report.escrowCardLabel).toBe("Escrow Balance (this week)");
    expect(report.escrowCents).toBe(20_000);
    expect(report.escrowBalanceCents).toBeNull();
    expect(report.loadCount).toBe(4);
    expect(report.driver).toBe("Brison Hunter");
    expect(report.expenseCents).toBe(360_454);
    expect(report.netCents).toBe(339_546);
    expect(report.leftExpenses.map((line) => line.label)).toEqual([
      "Driver Compensation - 20%",
      "Management Fee - 10%",
      "Dispatch Fee",
      "Factoring Fee - 1.75%",
      "Fuel (Diesel + DEF)",
      "Insurance",
    ]);
    expect(report.dispatcher).toBe(DEFAULT_DISPATCHER);
    expect(report.trailer).toBe("");
    expect(report.vin).toBe("");
    expect(report.truckLine).toBe("Truck 8");
    expect(report.onTime).toBe("100%");
    expect(report.loadsAccepted).toBe("4");
    expect(report.loadsDelivered).toBe("4");
    expect(report.claims).toBe("0");
    expect(report.cargoDamage).toBe("0");
    expect(report.serviceFailures).toBe("0");
    expect(report.cancellations).toBe("0");
    expect(report.availableForDispatch).toBe("Ready");
    expect(report.operatingCondition).toBe("Good");
    expect(report.revenuePerformance).toBe("Positive");
    expect(report.compliance).toBe("Good");
    expect(report.maintenance).toBe("Current");
    expect(report.driverQualification).toBe("Current");
    expect(report.fuelEconomy).toBe("19.97");
    expect(report.fuelUnitPriceCents).toBe(555);
    expect(report.fuelPerMileCents).toBe(20);
    expect(report.notes).toEqual([]);
    expect(report.notes.join(" ")).not.toContain(DEFAULT_DISPATCHER);
    const bytes = await renderAssetReportPdf(report);
    const text = pdfText(bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    expect(pdf.getPage(0).getWidth()).toBe(PAGE_W);
    expect(pdf.getPage(0).getHeight()).toBe(PAGE_H);
    expect(text).toContain("$3,604.54");
    expect(text).toContain("$3,395.46");
    expect(text).toContain("Brison Hunter");
    expect(text).toContain("Legacy Dispatch Team");
    expect(text).not.toContain("because the truck record");
    expect(text).not.toContain("Notes");
    expect(text).not.toContain("$4,051.77");
    expect(text).toContain("Manifest 1195");
    expect(text).toContain("partial");
    expect(text).toContain("2,075.00");
    expect(text).toContain("Escrow Balance (this week)");
    expect(text).toContain("$200.00");
    expect(text).not.toContain("Weekly Escrow");
    expect(text).not.toContain("MC Lease");
    expect(text).not.toContain("Not stored");
    expect(text).not.toContain("447.23");
    expect(text).not.toContain("2,999.00");
  });

  it("reads trailer, VIN, and dispatcher from a fleet label block and from performance columns", () => {
    const report = buildAssetReport({
      ...WEEK,
      unitNumber: "8",
      ownerName: "Brison Hunter",
      ledger: [
        ["Truck #", "8"],
        ["Delivery Date", "Load ID", "Rate", "Loaded Miles", "Deadhead Miles", "Broker/Customer", "Origin", "Destination", "On Time", "Claims", "Cargo Damage", "Service Failure", "Cancellation"],
        ["2026-09-01 0:00:00", "TBH-1", "$1,000.00", "10", "0", "Axle", "A", "B", "No", "1", "0", "1", "0"],
        ["2026-09-03 0:00:00", "TBH-2", "$1,000.00", "10", "0", "Axle", "A", "B", "Yes", "0", "2", "0", "1"],
      ],
      weekly: [
        ["Week Start Date", "Driver Compensation", "Management Fee %", "Management Fee", "Loads Accepted"],
        ["08/31/2026", "$0.00", "12%", "$0.00", "6"],
      ],
      fuelLog: null,
      fleet: [
        ["Truck #", "8"],
        ["Trailer", "531"],
        ["VIN", "1FUJGHDV0MLBK1234"],
        ["Dispatcher", "Sam Cole"],
        ["Status", "Down"],
        ["Operating Condition", "Shop"],
      ],
      sheetNote: null,
    });
    expect(report.trailer).toBe("531");
    expect(report.vin).toBe("1FUJGHDV0MLBK1234");
    expect(report.dispatcher).toBe("Sam Cole");
    expect(report.assetStatus).toBe("Down");
    expect(report.availableForDispatch).toBe("Hold");
    expect(report.operatingCondition).toBe("Shop");
    expect(report.revenuePerformance).toBe("Review");
    expect(report.onTime).toBe("50%");
    expect(report.claims).toBe("1");
    expect(report.cargoDamage).toBe("2");
    expect(report.serviceFailures).toBe("1");
    expect(report.cancellations).toBe("1");
    expect(report.loadsAccepted).toBe("6");
    expect(report.loadsDelivered).toBe("2");
    expect(report.leftExpenses.find((line) => line.label.startsWith("Management"))?.label).toBe("Management Fee - 12%");
    expect(report.notes.join(" ")).not.toContain(DEFAULT_DISPATCHER);
  });
});
