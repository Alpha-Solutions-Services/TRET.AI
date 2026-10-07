import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMilesHundredths, formatStatementDollars } from "@/lib/reports/format";
import { milesLabel, percentOfRevenue, type AssetReport } from "./build";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 28;
const NAVY = rgb(30 / 255, 58 / 255, 95 / 255);
const INK = rgb(0.1, 0.12, 0.14);
const MUTED = rgb(0.35, 0.38, 0.42);
const LINE = rgb(0.8, 0.82, 0.85);
const PALE = rgb(0.95, 0.96, 0.97);
const WHITE = rgb(1, 1, 1);

function safe(text: string): string {
  return text.replace(/\u2014/g, "-").replace(/\u2013/g, "-").replace(/[^\x20-\x7E]/g, "");
}

function money(cents: number): string {
  return formatStatementDollars(cents);
}

export async function renderAssetReportPdf(report: AssetReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new Writer(doc, font, bold);
  writer.draw(report);
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const label = `Legacy Inc Global | Confidential | Weekly Asset Management Reporting | Page ${index + 1} of ${pages.length}`;
    page.drawText(label, {
      x: MARGIN,
      y: 18,
      size: 8,
      font,
      color: MUTED,
    });
  });
  return doc.save();
}

class Writer {
  private page!: PDFPage;
  private y = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  draw(report: AssetReport): void {
    this.newPage();
    this.banner(
      "LEGACY INC GLOBAL",
      "Weekly Asset Management Report | Transportation Asset Management Division",
    );
    this.meta([
      ["Reporting Period", report.periodLabel],
      ["Driver", report.driver],
      ["Asset Partner", report.assetPartner],
      ["Truck / Trailer / VIN", report.truckLine],
      ["Dispatcher", report.dispatcher],
      ["Program", report.program],
    ]);
    this.kpis([
      ["GROSS REVENUE", money(report.grossCents)],
      ["TOTAL TRUCK EXPENSES", money(report.expenseCents)],
      ["NET OWNER EARNINGS", money(report.netCents)],
      ["LOADS COMPLETED", String(report.loadCount)],
      ["DISPATCH MILES", formatMilesHundredths(report.dispatchMilesHundredths)],
      ["RATE / DISPATCH MILE", report.ratePerMileCents == null ? "Not stored" : money(report.ratePerMileCents)],
      ["FUEL COST / MILE", report.fuelPerMileCents == null ? "Not stored" : money(report.fuelPerMileCents)],
      ["ON-TIME DELIVERIES", "Not stored"],
    ]);
    this.section("Executive Summary");
    this.paragraph(report.summary);
    this.section("Weekly Load Activity");
    this.loadTable(report);
    this.section("Weekly Totals");
    this.pairTable(
      "Weekly Totals",
      [
        ["Gross Freight Revenue", money(report.grossCents)],
        ["Total Loads Completed", String(report.loadCount)],
        [
          "Loaded / Deadhead Miles",
          `${milesLabel(report.loads.reduce((sum, row) => sum + row.loadedHundredths, 0))} / ${milesLabel(report.loads.reduce((sum, row) => sum + row.deadheadHundredths, 0))}`,
        ],
        ["Avg Revenue Per Load", report.revenuePerLoadCents == null ? "Not stored" : money(report.revenuePerLoadCents)],
        ["Avg Rate Per Dispatch Mile", report.ratePerMileCents == null ? "Not stored" : money(report.ratePerMileCents)],
      ],
      [
        ["Loads Accepted", "Not stored"],
        ["Loads Delivered", String(report.loadCount)],
        ["On-Time Deliveries", "Not stored"],
        ["Claims / Cargo Damage", "Not stored"],
        ["Service Failures / Cancellations", "Not stored"],
      ],
      "Daily Performance",
    );
    this.newPage();
    this.banner(
      "LEGACY INC GLOBAL",
      `Owner Earnings Snapshot | ${report.assetPartner} | Truck ${report.unitNumber} | ${report.periodLabel}`,
    );
    this.section("Owner Earnings");
    this.expenseTable(report);
    this.kpis([
      ["GROSS REVENUE", money(report.grossCents)],
      ["TOTAL TRUCK EXPENSES", money(report.expenseCents)],
      ["NET OWNER EARNINGS", money(report.netCents)],
      ["WEEKLY ESCROW", money(report.escrowCents)],
    ]);
    this.section("Asset Status");
    this.kpis([
      ["ASSET STATUS", report.assetStatus],
      ["AVAILABLE FOR DISPATCH", "Not stored"],
      ["OPERATING CONDITION", "Not stored"],
      ["REVENUE PERFORMANCE", "Not stored"],
    ]);
    this.section("Fuel Summary and Compliance");
    this.pairTable(
      "Fuel Summary",
      [
        ["Fuel Purchased", report.fuelGallonsLabel],
        ["Fuel Cost", money(report.fuelCostCents)],
        ["Avg Unit Price", report.fuelUnitPriceCents == null ? "Not stored" : money(report.fuelUnitPriceCents)],
        ["Fuel Economy", report.fuelEconomy],
        ["Fuel Cost / Mile", report.fuelPerMileCents == null ? "Not stored" : money(report.fuelPerMileCents)],
        ["Dispatch Miles", formatMilesHundredths(report.dispatchMilesHundredths)],
      ],
      [
        ["Driver Qualification", "Not stored"],
        ["Medical Card", "Not stored"],
        ["Insurance", "Not stored"],
        ["Registration", "Not stored"],
        ["Annual DOT Insp.", "Not stored"],
        ["ELD Compliance", "Not stored"],
        ["Maintenance", "Not stored"],
      ],
      "Compliance / Maintenance",
    );
    this.section("Notes");
    for (const note of report.notes) this.paragraph(`- ${note}`);
  }

  private newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - 36;
  }

  private ensure(height: number): void {
    if (this.y - height < 36) this.newPage();
  }

  private banner(title: string, subtitle: string): void {
    this.page.drawRectangle({ x: 0, y: PAGE_H - 46, width: PAGE_W, height: 46, color: NAVY });
    this.page.drawText(safe(title), { x: MARGIN, y: PAGE_H - 22, size: 12, font: this.bold, color: WHITE });
    this.page.drawText(safe(subtitle), { x: MARGIN, y: PAGE_H - 36, size: 8, font: this.font, color: WHITE });
    this.y = PAGE_H - 60;
  }

  private section(title: string): void {
    this.ensure(18);
    this.page.drawText(safe(title), { x: MARGIN, y: this.y, size: 11, font: this.bold, color: NAVY });
    this.y -= 14;
  }

  private paragraph(text: string): void {
    const words = safe(text).split(/\s+/);
    let line = "";
    const max = PAGE_W - MARGIN * 2;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (this.font.widthOfTextAtSize(next, 9) > max) {
        this.ensure(12);
        this.page.drawText(line, { x: MARGIN, y: this.y, size: 9, font: this.font, color: INK });
        this.y -= 12;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      this.ensure(14);
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 9, font: this.font, color: INK });
      this.y -= 14;
    }
  }

  private meta(pairs: Array<[string, string]>): void {
    const colW = (PAGE_W - MARGIN * 2) / 2;
    for (let index = 0; index < pairs.length; index += 2) {
      this.ensure(22);
      this.field(MARGIN, pairs[index]!, colW);
      if (pairs[index + 1]) this.field(MARGIN + colW, pairs[index + 1]!, colW);
      this.y -= 22;
    }
  }

  private field(x: number, pair: [string, string], width: number): void {
    this.page.drawText(safe(pair[0]), { x, y: this.y, size: 7, font: this.font, color: MUTED });
    const value = clip(safe(pair[1]), this.bold, 9, width - 8);
    this.page.drawText(value, { x, y: this.y - 11, size: 9, font: this.bold, color: INK });
  }

  private kpis(items: Array<[string, string]>): void {
    const gap = 6;
    const width = (PAGE_W - MARGIN * 2 - gap * (items.length > 4 ? 3 : items.length - 1)) / Math.min(items.length, 4);
    const rows = Math.ceil(items.length / 4);
    this.ensure(rows * 36 + 4);
    items.forEach((item, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = MARGIN + col * (width + gap);
      const y = this.y - row * 36;
      this.page.drawRectangle({ x, y: y - 28, width, height: 32, color: PALE, borderColor: LINE, borderWidth: 0.5 });
      this.page.drawText(clip(safe(item[0]), this.font, 6, width - 8), {
        x: x + 4,
        y: y - 2,
        size: 6,
        font: this.font,
        color: MUTED,
      });
      this.page.drawText(clip(safe(item[1]), this.bold, 9, width - 8), {
        x: x + 4,
        y: y - 16,
        size: 9,
        font: this.bold,
        color: INK,
      });
    });
    this.y -= rows * 36 + 8;
  }

  private loadTable(report: AssetReport): void {
    const headers = ["Load # / Ref", "Date", "Broker / Customer", "Origin", "Destination", "Loaded Mi", "Deadhead", "Rate"];
    const widths = [70, 48, 100, 78, 78, 52, 52, 52];
    this.rowText(headers, widths, true);
    const rows = report.loads.length
      ? report.loads
      : [
          {
            loadId: "None",
            date: "",
            broker: "",
            origin: "",
            destination: "",
            loadedHundredths: 0,
            deadheadHundredths: 0,
            rateCents: 0,
          },
        ];
    for (const load of rows) {
      this.rowText(
        [
          load.loadId,
          load.date,
          load.broker,
          load.origin,
          load.destination,
          formatMilesHundredths(load.loadedHundredths),
          formatMilesHundredths(load.deadheadHundredths),
          money(load.rateCents),
        ],
        widths,
        false,
      );
    }
    const loaded = report.loads.reduce((sum, row) => sum + row.loadedHundredths, 0);
    const deadhead = report.loads.reduce((sum, row) => sum + row.deadheadHundredths, 0);
    this.rowText(
      ["TOTALS", "", "", "", "", formatMilesHundredths(loaded), formatMilesHundredths(deadhead), money(report.grossCents)],
      widths,
      true,
    );
  }

  private rowText(cells: string[], widths: number[], header: boolean): void {
    this.ensure(14);
    let x = MARGIN;
    cells.forEach((cell, index) => {
      const width = widths[index] ?? 40;
      this.page.drawText(clip(safe(cell), header ? this.bold : this.font, 7, width - 2), {
        x,
        y: this.y,
        size: 7,
        font: header ? this.bold : this.font,
        color: header ? NAVY : INK,
      });
      x += width;
    });
    this.y -= 12;
  }

  private expenseTable(report: AssetReport): void {
    const headers = ["Expense", "Amount", "% Rev", "Expense", "Amount", "% Rev"];
    const widths = [130, 58, 40, 120, 58, 40];
    this.rowText(headers, widths, true);
    const count = Math.max(report.leftExpenses.length, report.rightExpenses.length);
    for (let index = 0; index < count; index++) {
      const left = report.leftExpenses[index];
      const right = report.rightExpenses[index];
      this.rowText(
        [
          left?.label ?? "",
          left ? money(left.cents) : "",
          left ? percentOfRevenue(left.cents, report.grossCents) : "",
          right?.label ?? "",
          right ? money(right.cents) : "",
          right ? percentOfRevenue(right.cents, report.grossCents) : "",
        ],
        widths,
        false,
      );
    }
    this.rowText(
      ["TOTAL TRUCK EXPENSES", money(report.expenseCents), percentOfRevenue(report.expenseCents, report.grossCents), "Included in the total", "", ""],
      widths,
      true,
    );
  }

  private pairTable(
    leftTitle: string,
    left: Array<[string, string]>,
    right: Array<[string, string]>,
    rightTitle: string,
  ): void {
    this.rowText([leftTitle, "Amount", rightTitle, "Result"], [150, 90, 180, 90], true);
    const count = Math.max(left.length, right.length);
    for (let index = 0; index < count; index++) {
      this.rowText(
        [left[index]?.[0] ?? "", left[index]?.[1] ?? "", right[index]?.[0] ?? "", right[index]?.[1] ?? ""],
        [150, 90, 180, 90],
        false,
      );
    }
  }
}

function clip(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let next = text;
  while (next.length > 1 && font.widthOfTextAtSize(`${next}...`, size) > width) next = next.slice(0, -1);
  return `${next}...`;
}
