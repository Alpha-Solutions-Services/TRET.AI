import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatMilesHundredths, formatStatementDollars } from "@/lib/reports/format";
import { milesLabel, type AssetReport } from "./build";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 28;
const CONTENT_W = PAGE_W - MARGIN * 2;

const NAVY: RGB = rgb(10 / 255, 33 / 255, 71 / 255);
const STEEL: RGB = rgb(51 / 255, 112 / 255, 158 / 255);
const GOLD: RGB = rgb(160 / 255, 131 / 255, 61 / 255);
const INK: RGB = rgb(20 / 255, 41 / 255, 64 / 255);
const MUTED: RGB = rgb(71 / 255, 85 / 255, 105 / 255);
const ZEBRA: RGB = rgb(224 / 255, 235 / 255, 245 / 255);
const ZEBRA_SOFT: RGB = rgb(240 / 255, 245 / 255, 250 / 255);
const TOTAL: RGB = rgb(209 / 255, 221 / 255, 234 / 255);
const GREEN: RGB = rgb(5 / 255, 168 / 255, 92 / 255);
const WHITE: RGB = rgb(1, 1, 1);
const RULE: RGB = rgb(188 / 255, 204 / 255, 218 / 255);

function safe(text: string): string {
  return text.replace(/\u2014/g, "-").replace(/\u2013/g, "-").replace(/[^\x20-\x7E]/g, "");
}

function money(cents: number): string {
  return formatStatementDollars(cents);
}

function moneyOrBlank(cents: number | null): string {
  return cents == null ? "n/a" : money(cents);
}

function mpg(value: string): string {
  if (!value || value === "n/a") return "n/a";
  return value.endsWith("MPG") ? value : `${value} MPG`;
}

function gallons(value: string): string {
  if (!value || value === "n/a") return "n/a";
  return value.endsWith("gal") ? value : `${value} gal`;
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
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 26, color: NAVY });
    page.drawRectangle({ x: 0, y: 26, width: PAGE_W, height: 2, color: GOLD });
    const label = `Legacy Inc Global  |  Weekly Asset Management Report  |  Page ${index + 1} of ${pages.length}`;
    const width = font.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: Math.max(MARGIN, (PAGE_W - width) / 2),
      y: 10,
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
    this.banner("LEGACY INC GLOBAL", "Weekly Asset Management Report", "Transportation Asset Management Division");
    this.identity(report);
    this.section("Weekly Load Activity");
    this.loadTable(report);
    this.y -= 8;
    this.pairTable(
      [
        ["Gross Freight Revenue", money(report.grossCents)],
        ["Total Loads Completed", String(report.loadCount)],
        ["Loaded Miles", milesLabel(report.loadedMilesHundredths)],
        ["Deadhead Miles", milesLabel(report.deadheadMilesHundredths)],
        ["Dispatch Miles", milesLabel(report.dispatchMilesHundredths)],
        ["Fuel Economy", mpg(report.fuelEconomy)],
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
      "Amount",
      "Daily Performance",
      "Result",
    );
    const operations = report.notes.filter((note) => note.trim());
    if (operations.length > 0) {
      this.section("Weekly Operations Note");
      this.noteBox(operations);
    }
  }

  private pageTwo(report: AssetReport): void {
    this.newPage();
    const who = report.assetPartner || "Asset Partner";
    this.banner(
      "Owner Earnings Snapshot",
      `${who}  |  Truck ${report.unitNumber}  |  ${report.periodLabel}`,
      "Legacy Inc Global",
    );
    this.expenseTable(report);
    this.y -= 8;
    this.cards([
      ["Gross Revenue", money(report.grossCents), STEEL],
      ["Total Truck Expenses", money(report.expenseCents), STEEL],
      ["Net Owner Earnings", money(report.netCents), GREEN],
      [report.escrowCardLabel, money(report.escrowCents), GREEN],
    ]);
    this.y -= 4;
    this.line("All expenses shown above are included in Total Truck Expenses.", 8, this.font, MUTED);
    this.section("Executive Summary");
    this.paragraph(report.summary);
    this.y -= 4;
    this.quad(report);
  }

  private newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H;
  }

  private banner(title: string, subtitle: string, kicker: string): void {
    const height = 52;
    this.page.drawRectangle({ x: 0, y: PAGE_H - height, width: PAGE_W, height, color: NAVY });
    this.page.drawRectangle({ x: 0, y: PAGE_H - height, width: PAGE_W, height: 3, color: GOLD });
    this.page.drawText(safe(title), { x: MARGIN, y: PAGE_H - 20, size: 14, font: this.bold, color: WHITE });
    this.page.drawText(clip(safe(subtitle), this.font, 8, CONTENT_W), {
      x: MARGIN,
      y: PAGE_H - 34,
      size: 8,
      font: this.font,
      color: rgb(214 / 255, 226 / 255, 235 / 255),
    });
    this.page.drawText(clip(safe(kicker), this.bold, 7, CONTENT_W), {
      x: MARGIN,
      y: PAGE_H - 46,
      size: 7,
      font: this.bold,
      color: GOLD,
    });
    this.y = PAGE_H - height - 12;
  }

  private identity(report: AssetReport): void {
    const lines = [
      ["Reporting Period", report.periodLabel],
      ["Asset Partner", report.assetPartner],
      ["Truck", `${report.unitNumber}     Trailer: ${report.trailer}     VIN: ${report.vin}`],
      ["Dispatcher", report.dispatcher],
      ["Driver", report.driver],
    ] as const;
    for (const [label, value] of lines) {
      const text = `${label}:  ${value}`;
      this.page.drawText(clip(safe(text), label === "Asset Partner" || label === "Driver" ? this.bold : this.font, 9, CONTENT_W), {
        x: MARGIN,
        y: this.y - 11,
        size: 9,
        font: label === "Asset Partner" || label === "Driver" ? this.bold : this.font,
        color: INK,
      });
      this.y -= 14;
    }
    this.y -= 4;
  }

  private section(title: string): void {
    this.y -= 8;
    this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: 16, height: 3, color: STEEL });
    this.page.drawText(safe(title), { x: MARGIN + 22, y: this.y - 6, size: 11, font: this.bold, color: NAVY });
    this.y -= 16;
  }

  private line(text: string, size: number, font: PDFFont, color: RGB): void {
    this.page.drawText(clip(safe(text), font, size, CONTENT_W), {
      x: MARGIN,
      y: this.y - size,
      size,
      font,
      color,
    });
    this.y -= size + 6;
  }

  private paragraph(text: string): void {
    const lines = wrap(safe(text), this.font, 8, CONTENT_W);
    lines.forEach((line, index) => {
      this.page.drawText(line, { x: MARGIN, y: this.y - 10 - index * 11, size: 8, font: this.font, color: INK });
    });
    this.y -= lines.length * 11 + 4;
  }

  private noteBox(notes: string[]): void {
    const wrapped = notes.flatMap((note) => wrap(safe(`- ${note}`), this.font, 8, CONTENT_W - 16));
    const height = 8 + wrapped.length * 11;
    const y = this.y - height;
    this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height, color: ZEBRA_SOFT, borderColor: RULE, borderWidth: 0.4 });
    this.page.drawRectangle({ x: MARGIN, y, width: 3, height, color: STEEL });
    wrapped.forEach((line, index) => {
      this.page.drawText(line, { x: MARGIN + 10, y: this.y - 14 - index * 11, size: 8, font: this.font, color: INK });
    });
    this.y = y - 6;
  }

  private cards(items: Array<[string, string, RGB]>): void {
    const gap = 6;
    const width = (CONTENT_W - gap * (items.length - 1)) / items.length;
    const cardH = 40;
    items.forEach((item, index) => {
      const x = MARGIN + index * (width + gap);
      const y = this.y - cardH;
      this.page.drawRectangle({ x, y, width, height: cardH, color: ZEBRA_SOFT, borderColor: RULE, borderWidth: 0.4 });
      this.page.drawRectangle({ x, y, width: 3, height: cardH, color: item[2] });
      this.page.drawText(clip(safe(item[0]).toUpperCase(), this.bold, 6, width - 14), {
        x: x + 8,
        y: y + cardH - 13,
        size: 6,
        font: this.bold,
        color: MUTED,
      });
      this.page.drawText(clip(safe(item[1]), this.bold, 11, width - 14), {
        x: x + 8,
        y: y + 8,
        size: 11,
        font: this.bold,
        color: NAVY,
      });
    });
    this.y -= cardH + 8;
  }

  private loadTable(report: AssetReport): void {
    const headers = ["Load #", "Date", "Broker/Customer", "Origin", "Destination", "Loaded", "Deadhead", "Rate"];
    const widths = [72, 52, 108, 78, 86, 54, 52, 54];
    const align: Array<"left" | "right"> = ["left", "left", "left", "left", "left", "right", "right", "right"];
    this.tableHeader(headers, widths, align);
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
            manifestRef: null,
            manifestRole: "solo" as const,
            manifestHeader: false,
          },
        ];
    rows.forEach((load, index) => {
      if (load.manifestHeader && load.manifestRef) {
        this.spanRow(`Manifest ${load.manifestRef}`, STEEL, true);
      }
      const zebra = index % 2 === 0 ? ZEBRA : WHITE;
      this.tableRow(
        [
          load.loadId,
          load.date,
          load.broker,
          load.origin,
          load.destination,
          load.manifestRole === "partial" ? "partial" : formatMilesHundredths(load.loadedHundredths),
          formatMilesHundredths(load.deadheadHundredths),
          money(load.rateCents),
        ],
        widths,
        align,
        zebra,
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
      align,
      TOTAL,
      true,
    );
  }

  private expenseTable(report: AssetReport): void {
    const leftW = CONTENT_W / 2 - 8;
    const count = Math.max(report.leftExpenses.length, report.rightExpenses.length);
    for (let index = 0; index < count; index++) {
      const y = this.y - 16;
      const fill = index % 2 === 0 ? ZEBRA : WHITE;
      this.page.drawRectangle({ x: MARGIN, y, width: leftW, height: 16, color: fill });
      this.page.drawRectangle({ x: MARGIN + leftW + 16, y, width: leftW, height: 16, color: fill });
      const left = report.leftExpenses[index];
      const right = report.rightExpenses[index];
      if (left) this.expenseCell(MARGIN, y, leftW, left.label, money(left.cents));
      if (right) this.expenseCell(MARGIN + leftW + 16, y, leftW, right.label, money(right.cents));
      this.y -= 16;
    }
    const y = this.y - 18;
    this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 18, color: TOTAL });
    this.page.drawText("Total Truck Expenses", { x: MARGIN + 6, y: y + 5, size: 8, font: this.bold, color: NAVY });
    const total = money(report.expenseCents);
    const totalW = this.bold.widthOfTextAtSize(total, 8);
    this.page.drawText(total, { x: MARGIN + CONTENT_W - totalW - 6, y: y + 5, size: 8, font: this.bold, color: NAVY });
    this.y = y - 4;
  }

  private expenseCell(x: number, y: number, width: number, label: string, amount: string): void {
    this.page.drawText(clip(safe(label), this.font, 8, width - 70), {
      x: x + 6,
      y: y + 4,
      size: 8,
      font: this.font,
      color: INK,
    });
    const amountW = this.bold.widthOfTextAtSize(amount, 8);
    this.page.drawText(amount, { x: x + width - amountW - 6, y: y + 4, size: 8, font: this.bold, color: NAVY });
  }

  private pairTable(
    left: Array<[string, string]>,
    right: Array<[string, string]>,
    leftTitle: string,
    leftAmount: string,
    rightTitle: string,
    rightAmount: string,
  ): void {
    const gap = 10;
    const colW = (CONTENT_W - gap) / 2;
    const labelW = colW * 0.68;
    const valueW = colW - labelW;
    this.tableHeader([leftTitle, leftAmount, rightTitle, rightAmount], [labelW, valueW, labelW, valueW], ["left", "right", "left", "right"]);
    const count = Math.max(left.length, right.length);
    for (let index = 0; index < count; index++) {
      this.tableRow(
        [left[index]?.[0] ?? "", left[index]?.[1] ?? "", right[index]?.[0] ?? "", right[index]?.[1] ?? ""],
        [labelW, valueW, labelW, valueW],
        ["left", "right", "left", "right"],
        index % 2 === 0 ? ZEBRA : WHITE,
        false,
      );
    }
  }

  private quad(report: AssetReport): void {
    const gap = 8;
    const colW = (CONTENT_W - gap) / 2;
    const left: Array<[string, string]> = [
      ["Asset Status", report.assetStatus],
      ["Available for Dispatch", report.availableForDispatch],
      ["Operating Condition", report.operatingCondition],
      ["Revenue Performance", report.revenuePerformance],
      ["Compliance", report.compliance],
      ["Maintenance", report.maintenance],
    ];
    const kpis: Array<[string, string]> = [
      ["Gross Revenue", money(report.grossCents)],
      ["Owner Earnings", money(report.netCents)],
      ["Loads Completed", String(report.loadCount)],
      ["Dispatch Miles", milesLabel(report.dispatchMilesHundredths)],
      ["Rate Per Dispatch Mile", moneyOrBlank(report.ratePerMileCents)],
      ["Fuel Cost Per Mile", moneyOrBlank(report.fuelPerMileCents)],
    ];
    const fuel: Array<[string, string]> = [
      ["Fuel Purchased", gallons(report.fuelGallonsLabel)],
      ["Fuel Cost", money(report.fuelCostCents)],
      ["Avg Unit Price", moneyOrBlank(report.fuelUnitPriceCents)],
      ["Fuel Economy", mpg(report.fuelEconomy)],
      ["Fuel Cost / Mile", moneyOrBlank(report.fuelPerMileCents)],
      ["Dispatch Miles", milesLabel(report.dispatchMilesHundredths)],
    ];
    const compliance: Array<[string, string]> = [
      ["Driver Qualification", report.driverQualification],
      ["Medical Card", report.medicalCard],
      ["Insurance", report.insuranceStatus],
      ["Registration", report.registration],
      ["Annual DOT Insp.", report.annualDot],
      ["ELD Compliance", report.eldCompliance],
      ["Maintenance", report.maintenance],
    ];
    const rowH = 12;
    const headH = 14;
    const block = (title: string, pairs: Array<[string, string]>, x: number, top: number): number => {
      const height = headH + pairs.length * rowH;
      this.page.drawRectangle({ x, y: top - height, width: colW, height, color: WHITE, borderColor: RULE, borderWidth: 0.4 });
      this.page.drawRectangle({ x, y: top - headH, width: colW, height: headH, color: STEEL });
      this.page.drawText(safe(title), { x: x + 4, y: top - headH + 4, size: 7, font: this.bold, color: WHITE });
      pairs.forEach((pair, index) => {
        const y = top - headH - (index + 1) * rowH;
        if (index % 2 === 0) {
          this.page.drawRectangle({ x, y, width: colW, height: rowH, color: ZEBRA });
        }
        this.page.drawText(clip(safe(pair[0]), this.font, 6.5, colW * 0.62), {
          x: x + 4,
          y: y + 3,
          size: 6.5,
          font: this.font,
          color: INK,
        });
        const value = clip(safe(pair[1]), this.bold, 6.5, colW * 0.34);
        const valueW = this.bold.widthOfTextAtSize(value, 6.5);
        this.page.drawText(value, { x: x + colW - valueW - 4, y: y + 3, size: 6.5, font: this.bold, color: NAVY });
      });
      return height;
    };
    const top = this.y;
    const leftH = Math.max(block("Asset Status", left, MARGIN, top), block("Performance KPIs", kpis, MARGIN + colW + gap, top));
    const next = top - leftH - 8;
    const rightH = Math.max(
      block("Fuel Summary", fuel, MARGIN, next),
      block("Compliance / Maintenance", compliance, MARGIN + colW + gap, next),
    );
    this.y = next - rightH - 6;
  }

  private tableHeader(cells: string[], widths: number[], align: Array<"left" | "right">): void {
    this.tableRow(cells, widths, align, STEEL, true, true);
  }

  private spanRow(text: string, fill: RGB, strong: boolean): void {
    const height = 13;
    const y = this.y - height;
    this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height, color: fill });
    this.page.drawText(safe(text), { x: MARGIN + 4, y: y + 3, size: 7, font: this.bold, color: WHITE });
    this.y -= height;
    void strong;
  }

  private tableRow(
    cells: string[],
    widths: number[],
    align: Array<"left" | "right">,
    fill: RGB,
    strong: boolean,
    header = false,
  ): void {
    const height = header ? 14 : 12;
    const y = this.y - height;
    this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height, color: fill });
    if (!header) this.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 0.3, color: RULE });
    let x = MARGIN;
    cells.forEach((cell, index) => {
      const width = widths[index] ?? 40;
      const font = header || strong ? this.bold : this.font;
      const color = header ? WHITE : INK;
      const text = clip(safe(cell), font, 7, width - 6);
      const textW = font.widthOfTextAtSize(text, 7);
      const drawX = align[index] === "right" ? x + width - textW - 3 : x + 3;
      this.page.drawText(text, { x: drawX, y: y + 3, size: 7, font, color });
      x += width;
    });
    this.y -= height;
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
