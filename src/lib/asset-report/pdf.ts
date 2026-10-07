import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatMilesHundredths, formatStatementDollars } from "@/lib/reports/format";
import { milesLabel, percentOfRevenue, type AssetReport } from "./build";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_TOP = 34;

const NAVY: RGB = rgb(11 / 255, 31 / 255, 58 / 255);
const NAVY_LIFT: RGB = rgb(28 / 255, 58 / 255, 102 / 255);
const GOLD: RGB = rgb(201 / 255, 162 / 255, 74 / 255);
const INK: RGB = rgb(15 / 255, 23 / 255, 42 / 255);
const MUTED: RGB = rgb(71 / 255, 85 / 255, 105 / 255);
const BAND: RGB = rgb(232 / 255, 239 / 255, 247 / 255);
const BAND_ALT: RGB = rgb(244 / 255, 247 / 255, 252 / 255);
const GOLD_WASH: RGB = rgb(246 / 255, 241 / 255, 228 / 255);
const LINE: RGB = rgb(203 / 255, 213 / 255, 225 / 255);
const WHITE: RGB = rgb(1, 1, 1);
const CARD_TOP: RGB = rgb(248 / 255, 250 / 255, 253 / 255);
const CARD_BOT: RGB = rgb(226 / 255, 234 / 255, 244 / 255);

function safe(text: string): string {
  return text.replace(/\u2014/g, "-").replace(/\u2013/g, "-").replace(/[^\x20-\x7E]/g, "");
}

function money(cents: number): string {
  return formatStatementDollars(cents);
}

function moneyOrBlank(cents: number | null): string {
  return cents == null ? "n/a" : money(cents);
}

export async function renderAssetReportPdf(report: AssetReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Legacy Inc Global Weekly Asset Management Report");
  doc.setCreationDate(new Date("2026-10-07T00:00:00Z"));
  doc.setModificationDate(new Date("2026-10-07T00:00:00Z"));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new Writer(doc, font, bold);
  writer.draw(report);
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 28, color: NAVY });
    page.drawRectangle({ x: 0, y: 28, width: PAGE_W, height: 2, color: GOLD });
    const label = `Legacy Inc Global | Confidential | Weekly Asset Management Reporting | Page ${index + 1} of ${pages.length}`;
    const width = font.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: Math.max(MARGIN, (PAGE_W - width) / 2),
      y: 11,
      size: 8,
      font,
      color: WHITE,
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
    this.pageOne(report);
    this.pageTwo(report);
  }

  private pageOne(report: AssetReport): void {
    this.newPage();
    this.banner("LEGACY INC GLOBAL", "Weekly Asset Management Report | Transportation Asset Management Division");
    this.meta([
      ["Reporting Period", report.periodLabel],
      ["Driver", report.driver],
      ["Asset Partner", report.assetPartner],
      ["Truck", `Truck ${report.unitNumber}`],
      ["Trailer", report.trailer],
      ["VIN", report.vin],
      ["Dispatcher", report.dispatcher],
      ["Program", report.program],
    ]);
    this.kpis([
      ["GROSS REVENUE", money(report.grossCents)],
      ["TOTAL TRUCK EXPENSES", money(report.expenseCents)],
      ["NET OWNER EARNINGS", money(report.netCents)],
      ["LOADS COMPLETED", String(report.loadCount)],
      ["DISPATCH MILES", formatMilesHundredths(report.dispatchMilesHundredths)],
      ["RATE / DISPATCH MILE", moneyOrBlank(report.ratePerMileCents)],
      ["FUEL COST / MILE", moneyOrBlank(report.fuelPerMileCents)],
      ["ON-TIME DELIVERIES", report.onTime],
    ]);
    this.section("Executive Summary");
    this.callout(report.summary);
    this.section("Weekly Load Activity");
    this.loadTable(report);
    this.section("Weekly Totals");
    this.pairTable(
      [
        ["Gross Freight Revenue", money(report.grossCents)],
        ["Total Loads Completed", String(report.loadCount)],
        ["Loaded Miles", milesLabel(report.loadedMilesHundredths)],
        ["Deadhead Miles", milesLabel(report.deadheadMilesHundredths)],
        ["Dispatch Miles", formatMilesHundredths(report.dispatchMilesHundredths)],
        ["Fuel Economy", report.fuelEconomy],
        ["Average Revenue Per Load", moneyOrBlank(report.revenuePerLoadCents)],
        ["Average Rate Per Dispatch Mile", moneyOrBlank(report.ratePerMileCents)],
        ["Fuel Cost Per Mile", moneyOrBlank(report.fuelPerMileCents)],
      ],
      [
        ["Loads Accepted", report.loadsAccepted],
        ["Loads Delivered", report.loadsDelivered],
        ["On-Time Deliveries", report.onTime],
        ["Claims", report.claims],
        ["Cargo Damage", report.cargoDamage],
        ["Service Failures", report.serviceFailures],
        ["Cancellation", report.cancellations],
      ],
      "Weekly Totals",
      "Daily Performance",
    );
  }

  private pageTwo(report: AssetReport): void {
    this.newPage();
    this.banner(
      "LEGACY INC GLOBAL",
      `Owner Earnings Snapshot | ${report.assetPartner || "Asset Partner"} | Truck ${report.unitNumber} | ${report.periodLabel}`,
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
      ["AVAILABLE FOR DISPATCH", report.availableForDispatch],
      ["OPERATING CONDITION", report.operatingCondition],
      ["REVENUE PERFORMANCE", report.revenuePerformance],
      ["COMPLIANCE", report.compliance],
      ["MAINTENANCE", report.maintenance],
    ]);
    this.section("Fuel Summary and Compliance");
    this.pairTable(
      [
        ["Fuel Purchased", report.fuelGallonsLabel],
        ["Fuel Cost", money(report.fuelCostCents)],
        ["Avg Unit Price", moneyOrBlank(report.fuelUnitPriceCents)],
        ["Fuel Economy", report.fuelEconomy],
        ["Fuel Cost / Mile", moneyOrBlank(report.fuelPerMileCents)],
        ["Dispatch Miles", formatMilesHundredths(report.dispatchMilesHundredths)],
      ],
      [
        ["Driver Qualification", report.driverQualification],
        ["Medical Card", report.medicalCard],
        ["Insurance", report.insuranceStatus],
        ["Registration", report.registration],
        ["Annual DOT Insp.", report.annualDot],
        ["ELD Compliance", report.eldCompliance],
        ["Maintenance", report.maintenance],
      ],
      "Fuel Summary",
      "Compliance / Maintenance",
    );
    this.section("Notes");
    this.noteBox(report.notes);
  }

  private newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H;
  }

  private ensure(height: number): void {
    if (this.y - height < FOOTER_TOP) this.newPage();
  }

  private banner(title: string, subtitle: string): void {
    const height = 52;
    this.gradient(0, PAGE_H - height, PAGE_W, height, NAVY, NAVY_LIFT);
    this.page.drawRectangle({ x: 0, y: PAGE_H - height, width: PAGE_W, height: 3, color: GOLD });
    this.page.drawText(safe(title), { x: MARGIN, y: PAGE_H - 22, size: 14, font: this.bold, color: WHITE });
    this.page.drawText(clip(safe(subtitle), this.font, 8, CONTENT_W), {
      x: MARGIN,
      y: PAGE_H - 38,
      size: 8,
      font: this.font,
      color: GOLD,
    });
    this.y = PAGE_H - height - 14;
  }

  private section(title: string): void {
    this.ensure(18);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: 18, height: 3, color: GOLD });
    this.page.drawText(safe(title), { x: MARGIN + 24, y: this.y - 1, size: 11, font: this.bold, color: NAVY });
    this.y -= 16;
  }

  private callout(text: string): void {
    const lines = wrap(safe(text), this.font, 9, CONTENT_W - 18);
    const height = 10 + lines.length * 12;
    this.ensure(height + 6);
    const y = this.y - height;
    this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height, color: BAND });
    this.page.drawRectangle({ x: MARGIN, y, width: 3, height, color: GOLD });
    lines.forEach((line, index) => {
      this.page.drawText(line, {
        x: MARGIN + 10,
        y: this.y - 14 - index * 12,
        size: 9,
        font: this.font,
        color: INK,
      });
    });
    this.y = y - 8;
  }

  private noteBox(notes: string[]): void {
    const wrapped = notes.flatMap((note) => wrap(safe(`- ${note}`), this.font, 8, CONTENT_W - 18));
    const height = 8 + Math.max(wrapped.length, 1) * 11;
    this.ensure(height);
    const y = this.y - height;
    this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height, color: BAND_ALT, borderColor: LINE, borderWidth: 0.4 });
    wrapped.forEach((line, index) => {
      this.page.drawText(line, { x: MARGIN + 8, y: this.y - 14 - index * 11, size: 8, font: this.font, color: INK });
    });
    this.y = y - 6;
  }

  private meta(pairs: Array<[string, string]>): void {
    const gap = 8;
    const colW = (CONTENT_W - gap) / 2;
    const rowH = 30;
    for (let index = 0; index < pairs.length; index += 2) {
      this.ensure(rowH + 4);
      const y = this.y - rowH;
      this.fieldBox(MARGIN, y, colW, rowH, pairs[index]!);
      if (pairs[index + 1]) this.fieldBox(MARGIN + colW + gap, y, colW, rowH, pairs[index + 1]!);
      this.y -= rowH + 4;
    }
    this.y -= 2;
  }

  private fieldBox(x: number, y: number, width: number, height: number, pair: [string, string]): void {
    this.page.drawRectangle({ x, y, width, height, color: BAND_ALT, borderColor: LINE, borderWidth: 0.4 });
    this.page.drawRectangle({ x, y, width: 3, height, color: GOLD });
    this.page.drawText(safe(pair[0]).toUpperCase(), {
      x: x + 8,
      y: y + height - 11,
      size: 6.5,
      font: this.bold,
      color: NAVY,
    });
    const value = safe(pair[1]);
    if (value) {
      this.page.drawText(clip(value, this.bold, 9, width - 16), {
        x: x + 8,
        y: y + 6,
        size: 9,
        font: this.bold,
        color: INK,
      });
    }
  }

  private kpis(items: Array<[string, string]>): void {
    const cols = items.length === 6 ? 3 : Math.min(4, items.length);
    const gap = 7;
    const width = (CONTENT_W - gap * (cols - 1)) / cols;
    const cardH = 34;
    const rows = Math.ceil(items.length / cols);
    this.ensure(rows * (cardH + 6));
    items.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = MARGIN + col * (width + gap);
      const y = this.y - cardH - row * (cardH + 6);
      this.gradient(x, y, width, cardH, CARD_BOT, CARD_TOP);
      this.page.drawRectangle({ x, y, width: 3, height: cardH, color: GOLD });
      this.page.drawText(clip(safe(item[0]), this.bold, 6, width - 12), {
        x: x + 8,
        y: y + cardH - 12,
        size: 6,
        font: this.bold,
        color: MUTED,
      });
      this.page.drawText(clip(safe(item[1]), this.bold, 10, width - 12), {
        x: x + 8,
        y: y + 8,
        size: 10,
        font: this.bold,
        color: NAVY,
      });
    });
    this.y -= rows * (cardH + 6) + 2;
  }

  private loadTable(report: AssetReport): void {
    const headers = ["Load # / Ref", "Date", "Broker / Customer", "Origin", "Destination", "Loaded Mi", "Deadhead", "Rate"];
    const widths = [68, 48, 112, 80, 80, 52, 52, 56];
    this.tableHeader(headers, widths);
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
    rows.forEach((load, index) => {
      this.tableRow(
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
        index % 2 === 0 ? BAND : WHITE,
        false,
      );
    });
    this.tableRow(
      [
        "TOTALS",
        "",
        "",
        "",
        "",
        formatMilesHundredths(report.loadedMilesHundredths),
        formatMilesHundredths(report.deadheadMilesHundredths),
        money(report.grossCents),
      ],
      widths,
      GOLD_WASH,
      true,
    );
    this.y -= 6;
  }

  private expenseTable(report: AssetReport): void {
    const headers = ["Expense", "Amount", "% Rev", "Expense", "Amount", "% Rev"];
    const widths = [150, 68, 46, 142, 68, 74];
    this.tableHeader(headers, widths);
    const count = Math.max(report.leftExpenses.length, report.rightExpenses.length);
    for (let index = 0; index < count; index++) {
      const left = report.leftExpenses[index];
      const right = report.rightExpenses[index];
      this.tableRow(
        [
          left?.label ?? "",
          left ? money(left.cents) : "",
          left ? percentOfRevenue(left.cents, report.grossCents) : "",
          right?.label ?? "",
          right ? money(right.cents) : "",
          right ? percentOfRevenue(right.cents, report.grossCents) : "",
        ],
        widths,
        index % 2 === 0 ? BAND : WHITE,
        false,
      );
    }
    this.tableRow(
      [
        "TOTAL TRUCK EXPENSES",
        money(report.expenseCents),
        percentOfRevenue(report.expenseCents, report.grossCents),
        "",
        "",
        "",
      ],
      widths,
      GOLD_WASH,
      true,
    );
    this.y -= 6;
  }

  private pairTable(
    left: Array<[string, string]>,
    right: Array<[string, string]>,
    leftTitle: string,
    rightTitle: string,
  ): void {
    const widths = [156, 118, 156, 118];
    this.tableHeader([leftTitle, "Amount", rightTitle, "Result"], widths);
    const count = Math.max(left.length, right.length);
    for (let index = 0; index < count; index++) {
      this.tableRow(
        [left[index]?.[0] ?? "", left[index]?.[1] ?? "", right[index]?.[0] ?? "", right[index]?.[1] ?? ""],
        widths,
        index % 2 === 0 ? BAND : WHITE,
        false,
      );
    }
    this.y -= 4;
  }

  private tableHeader(cells: string[], widths: number[]): void {
    this.tableRow(cells, widths, NAVY, true, true);
  }

  private tableRow(cells: string[], widths: number[], fill: RGB, strong: boolean, header = false): void {
    const height = header ? 15 : 13;
    this.ensure(height);
    const y = this.y - height;
    this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height, color: fill });
    if (!header) {
      this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 0.3, color: LINE });
    }
    let x = MARGIN + 3;
    cells.forEach((cell, index) => {
      const width = widths[index] ?? 40;
      const font = header || strong ? this.bold : this.font;
      const color = header ? WHITE : INK;
      this.page.drawText(clip(safe(cell), font, 7, width - 4), {
        x,
        y: y + 3.5,
        size: 7,
        font,
        color,
      });
      x += width;
    });
    this.y -= height;
  }

  private gradient(x: number, y: number, width: number, height: number, from: RGB, to: RGB): void {
    const steps = 16;
    const step = height / steps;
    for (let index = 0; index < steps; index++) {
      const t = index / (steps - 1);
      this.page.drawRectangle({
        x,
        y: y + index * step,
        width,
        height: step + 0.2,
        color: rgb(
          from.red + (to.red - from.red) * t,
          from.green + (to.green - from.green) * t,
          from.blue + (to.blue - from.blue) * t,
        ),
      });
    }
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function clip(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let next = text;
  while (next.length > 1 && font.widthOfTextAtSize(`${next}...`, size) > width) next = next.slice(0, -1);
  return `${next}...`;
}
