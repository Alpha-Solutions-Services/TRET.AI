import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { categoryColor, percentOf } from "@/lib/charts/palette";
import { formatMilesHundredths, formatStatementDollars } from "@/lib/reports/format";
import { readAppVersion } from "@/lib/version";
import type { PreparedChart, PreparedLoad, PreparedReport, PreparedUnit } from "./types";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const BOTTOM = 48;
const NAVY = rgb(30 / 255, 58 / 255, 95 / 255);
const INK = rgb(0.12, 0.13, 0.15);
const MUTED = rgb(0.33, 0.36, 0.4);
const RULE = rgb(0.82, 0.84, 0.86);
const WHITE = rgb(1, 1, 1);

const LOAD_COLUMNS: Array<{ key: keyof PreparedLoad; label: string; width: number }> = [
  { key: "loadNumber", label: "Load #", width: 58 },
  { key: "deliveryDate", label: "Date", width: 62 },
  { key: "broker", label: "Broker", width: 78 },
  { key: "origin", label: "Origin", width: 84 },
  { key: "destination", label: "Destination", width: 84 },
  { key: "loaded", label: "Loaded", width: 50 },
  { key: "deadhead", label: "Deadhead", width: 52 },
  { key: "rate", label: "Rate", width: 64 },
];

class Writer {
  page!: PDFPage;
  y = 0;
  pageNo = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private readonly version: string,
  ) {}

  newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pageNo += 1;
    this.page.drawRectangle({ x: 0, y: PAGE_H - 36, width: PAGE_W, height: 36, color: NAVY });
    this.page.drawText("Legacy Inc Global", {
      x: MARGIN,
      y: PAGE_H - 23,
      size: 12,
      font: this.bold,
      color: WHITE,
    });
    const brand = "Weekly statement";
    this.page.drawText(brand, {
      x: PAGE_W - MARGIN - this.bold.widthOfTextAtSize(brand, 10),
      y: PAGE_H - 22,
      size: 10,
      font: this.bold,
      color: WHITE,
    });
    const footer = `TRET.AI v${this.version}`;
    this.page.drawText(footer, { x: MARGIN, y: 24, size: 8, font: this.font, color: MUTED });
    const pageLabel = `Page ${this.pageNo}`;
    this.page.drawText(pageLabel, {
      x: PAGE_W - MARGIN - this.font.widthOfTextAtSize(pageLabel, 8),
      y: 24,
      size: 8,
      font: this.font,
      color: MUTED,
    });
    this.y = PAGE_H - 56;
  }

  ensure(height: number): void {
    if (this.y - height < BOTTOM) this.newPage();
  }

  heading(text: string): void {
    this.ensure(20);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 11, font: this.bold, color: NAVY });
    this.y -= 16;
  }

  text(value: string, size = 9): void {
    this.ensure(13);
    this.page.drawText(fit(this.font, value, size, PAGE_W - MARGIN * 2), {
      x: MARGIN,
      y: this.y,
      size,
      font: this.font,
      color: INK,
    });
    this.y -= 13;
  }

  paragraph(value: string, size = 9): void {
    const width = PAGE_W - MARGIN * 2;
    const words = value.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (this.font.widthOfTextAtSize(next, size) <= width) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    for (const row of lines) this.text(row, size);
  }

  pair(label: string, value: string, emphasize = false): void {
    this.ensure(14);
    const font = emphasize ? this.bold : this.font;
    this.page.drawText(fit(font, label, 9, 360), { x: MARGIN, y: this.y, size: 9, font, color: INK });
    const shown = fit(font, value, 9, 140);
    this.page.drawText(shown, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(shown, 9),
      y: this.y,
      size: 9,
      font,
      color: INK,
    });
    this.y -= 13;
  }

  rule(): void {
    this.ensure(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 10;
  }

  bodyFont(): PDFFont {
    return this.font;
  }

  boldFont(): PDFFont {
    return this.bold;
  }
}

/** Draw a prepared report. Money is already formatted. This function does not calculate it. */
export async function renderWeeklyStatementPdf(report: PreparedReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Weekly statement ${report.weekStart}`);
  doc.setAuthor("TRET.AI");
  doc.setCreator("TRET.AI");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new Writer(doc, font, bold, readAppVersion());
  await drawCover(doc, font, bold, report);

  for (const unit of report.units) {
    writer.newPage();
    drawUnit(writer, report, unit);
  }
  writer.newPage();
  drawFleet(writer, report);
  return doc.save({ useObjectStreams: false });
}

function drawUnit(writer: Writer, report: PreparedReport, unit: PreparedUnit): void {
  writer.heading(`Unit ${unit.unitNumber}`);
  writer.text(report.deliveryLabel);
  writer.text(`${report.weekStart} through ${report.weekEnd}`);
  writer.text(report.statusLabel);
  writer.paragraph(unit.chart.summary);
  drawCharts(writer, unit.chart);
  writer.pair("Asset partner", unit.assetPartner);
  writer.pair("Truck", unit.truckLabel);
  writer.pair("Class", unit.truckClassLabel);
  writer.pair("Trailer", unit.trailer);
  writer.pair("VIN", unit.vin);
  writer.pair("Dispatcher", unit.dispatcher);
  writer.y -= 4;
  writer.heading("Loads");
  if (unit.loads.length === 0) {
    writer.text("No loads this week.");
  } else {
    drawLoadTable(writer, unit);
  }
  writer.y -= 4;
  writer.heading("Performance");
  for (const row of unit.performance) writer.pair(row.label, row.value);
  writer.y -= 4;
  writer.heading("Owner earnings");
  for (const row of unit.earnings) writer.pair(row.label, row.value);
  writer.rule();
  writer.pair(unit.net.label, unit.net.value, true);
  writer.y -= 4;
  writer.heading("Fuel summary");
  for (const row of unit.fuelSummary) writer.pair(row.label, row.value);
  if (unit.fixedManagement.length > 0) {
    writer.y -= 4;
    writer.heading("Charged to management (not in net)");
    for (const row of unit.fixedManagement) writer.pair(row.label, row.value);
  }
  writer.y -= 4;
  writer.heading("Compliance");
  writer.text(unit.compliance);
  writer.heading("Operations note");
  writer.text(unit.operationsNote);
}

function drawLoadTable(writer: Writer, unit: PreparedUnit): void {
  const drawHeader = () => {
    writer.ensure(16);
    let x = MARGIN;
    for (const column of LOAD_COLUMNS) {
      writer.page.drawText(column.label, {
        x,
        y: writer.y,
        size: 8,
        font: writer.boldFont(),
        color: MUTED,
      });
      x += column.width;
    }
    writer.y -= 12;
  };
  drawHeader();
  for (const load of unit.loads) {
    if (writer.y - 12 < BOTTOM) {
      writer.newPage();
      writer.heading(`Unit ${unit.unitNumber} (continued)`);
      drawHeader();
    }
    let x = MARGIN;
    for (const column of LOAD_COLUMNS) {
      const value = fit(writer.bodyFont(), load[column.key], 8, column.width - 4);
      writer.page.drawText(value, { x, y: writer.y, size: 8, font: writer.bodyFont(), color: INK });
      x += column.width;
    }
    writer.y -= 12;
  }
  if (unit.loadTotals) {
    writer.rule();
    writer.pair("Loaded miles total", unit.loadTotals.loaded);
    writer.pair("Deadhead total", unit.loadTotals.deadhead);
    writer.pair("Rate total", unit.loadTotals.rate);
  }
}

function drawFleet(writer: Writer, report: PreparedReport): void {
  writer.heading("Fleet totals");
  writer.text(report.deliveryLabel);
  writer.text(`${report.weekStart} through ${report.weekEnd}`);
  writer.text(report.statusLabel);
  writer.paragraph(report.fleetChart.summary);
  drawCharts(writer, report.fleetChart);
  writer.y -= 4;
  for (const row of report.fleetRows) {
    writer.pair(row.label, row.value, row.label === "Net to owner");
  }
  writer.y -= 6;
  writer.paragraph(report.fleetNote);
}

async function drawCover(
  doc: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  report: PreparedReport,
): Promise<void> {
  const page = doc.addPage([960, 540]);
  page.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color: NAVY });
  page.drawText("Legacy Inc Global", { x: 48, y: 470, size: 28, font: bold, color: WHITE });
  page.drawText("Weekly statement", { x: 48, y: 436, size: 16, font: font, color: WHITE });
  page.drawText(fit(font, report.deliveryLabel, 14, 420), { x: 48, y: 400, size: 14, font: font, color: WHITE });
  page.drawText(`${report.weekStart} through ${report.weekEnd}`, { x: 48, y: 376, size: 12, font: font, color: WHITE });
  try {
    const bytes = readFileSync(resolve("src/lib/asset-report/assets/legacy-cover-art.png"));
    const image = await doc.embedPng(bytes);
    const height = 420;
    const width = Math.round((image.width / image.height) * height);
    page.drawImage(image, { x: 960 - width - 36, y: 60, width, height });
  } catch {
    page.drawText("Truck photo was not stored.", { x: 520, y: 260, size: 12, font: font, color: WHITE });
  }
}

function paint(hex: string) {
  const value = hex.replace("#", "");
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
}

function drawCharts(writer: Writer, chart: PreparedChart): void {
  writer.y -= 4;
  writer.heading("Where the money went");
  drawDonut(writer, chart.expenses);
  drawMoneyBars(writer, "Money in, money out, owner keeps", [
    { label: "Money in", cents: chart.earnedCents, color: categoryColor(0) },
    { label: "Money out", cents: Math.max(0, chart.spentCents), color: categoryColor(1) },
    { label: "Owner keeps", cents: Math.max(0, chart.keepsCents), color: categoryColor(2) },
  ]);
  drawMoneyBars(
    writer,
    "Revenue per load",
    chart.loads.map((load, index) => ({ label: load.label, cents: load.cents, color: categoryColor(index) })),
  );
  drawMiles(writer, chart);
  drawGauge(writer, "Miles per gallon", chart.mpg ?? "Not stored", chart.mpg == null ? 0 : Number(chart.mpg), 10);
  drawGauge(
    writer,
    "Rate per loaded mile",
    chart.rpmCents == null ? "Not stored" : formatStatementDollars(chart.rpmCents),
    chart.rpmCents ?? 0,
    1000,
  );
}

function drawDonut(writer: Writer, slices: Array<{ label: string; cents: number }>): void {
  const total = slices.reduce((sum, slice) => sum + slice.cents, 0);
  writer.ensure(120);
  if (total <= 0) {
    writer.text("No expenses this week.");
    return;
  }
  const cx = MARGIN + 52;
  const cy = writer.y - 52;
  const radius = 46;
  if (slices.length === 1) {
    writer.page.drawEllipse({ x: cx, y: cy, xScale: radius, yScale: radius, color: paint(categoryColor(0)) });
  } else {
    let angle = -Math.PI / 2;
    slices.forEach((slice, index) => {
      const sweep = (slice.cents / total) * Math.PI * 2;
      const next = angle + sweep;
      writer.page.drawSvgPath(piePath(cx, cy, radius, angle, next), { color: paint(categoryColor(index)) });
      angle = next;
    });
  }
  writer.page.drawEllipse({ x: cx, y: cy, xScale: 24, yScale: 24, color: WHITE });
  let legendY = writer.y;
  slices.forEach((slice, index) => {
    const label = `${slice.label} ${formatStatementDollars(slice.cents)} ${percentOf(slice.cents, total)}`;
    writer.page.drawRectangle({
      x: MARGIN + 120,
      y: legendY - 2,
      width: 8,
      height: 8,
      color: paint(categoryColor(index)),
    });
    writer.page.drawText(fit(writer.bodyFont(), label, 8, 360), {
      x: MARGIN + 134,
      y: legendY,
      size: 8,
      font: writer.bodyFont(),
      color: INK,
    });
    legendY -= 12;
  });
  writer.y -= Math.max(110, slices.length * 12 + 8);
}

function piePath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const x0 = cx + radius * Math.cos(start);
  const y0 = cy + radius * Math.sin(start);
  const x1 = cx + radius * Math.cos(end);
  const y1 = cy + radius * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1} Z`;
}

function drawMoneyBars(
  writer: Writer,
  title: string,
  rows: Array<{ label: string; cents: number; color: string }>,
): void {
  writer.heading(title);
  if (rows.length === 0) {
    writer.text("Nothing to chart this week.");
    return;
  }
  const max = Math.max(1, ...rows.map((row) => row.cents));
  for (const row of rows) {
    writer.ensure(16);
    const width = Math.round((Math.max(0, row.cents) * 220) / max);
    writer.page.drawText(fit(writer.bodyFont(), row.label, 8, 100), {
      x: MARGIN,
      y: writer.y,
      size: 8,
      font: writer.bodyFont(),
      color: INK,
    });
    if (width > 0) {
      writer.page.drawRectangle({
        x: MARGIN + 108,
        y: writer.y - 2,
        width,
        height: 8,
        color: paint(row.color),
      });
    }
    const money = formatStatementDollars(row.cents);
    writer.page.drawText(money, {
      x: MARGIN + 336,
      y: writer.y,
      size: 8,
      font: writer.bodyFont(),
      color: INK,
    });
    writer.y -= 14;
  }
}

function drawMiles(writer: Writer, chart: PreparedChart): void {
  writer.heading("Loaded miles and deadhead");
  const rows = [
    { label: "Loaded", hundredths: chart.loadedHundredths, color: categoryColor(3) },
    { label: "Deadhead", hundredths: chart.deadheadHundredths, color: categoryColor(4) },
  ];
  const max = Math.max(1, ...rows.map((row) => row.hundredths));
  for (const row of rows) {
    writer.ensure(16);
    const width = Math.round((row.hundredths * 220) / max);
    writer.page.drawText(row.label, { x: MARGIN, y: writer.y, size: 8, font: writer.bodyFont(), color: INK });
    if (width > 0) {
      writer.page.drawRectangle({
        x: MARGIN + 108,
        y: writer.y - 2,
        width,
        height: 8,
        color: paint(row.color),
      });
    }
    writer.page.drawText(formatMilesHundredths(row.hundredths), {
      x: MARGIN + 336,
      y: writer.y,
      size: 8,
      font: writer.bodyFont(),
      color: INK,
    });
    writer.y -= 14;
  }
}

function drawGauge(writer: Writer, label: string, value: string, amount: number, full: number): void {
  writer.ensure(28);
  writer.page.drawText(label, { x: MARGIN, y: writer.y, size: 9, font: writer.boldFont(), color: NAVY });
  writer.page.drawText(fit(writer.bodyFont(), value, 9, 120), {
    x: PAGE_W - MARGIN - 80,
    y: writer.y,
    size: 9,
    font: writer.bodyFont(),
    color: INK,
  });
  writer.y -= 12;
  writer.page.drawRectangle({ x: MARGIN, y: writer.y, width: 220, height: 8, color: RULE });
  const width = full <= 0 ? 0 : Math.max(0, Math.min(220, Math.round((amount * 220) / full)));
  if (width > 0) {
    writer.page.drawRectangle({ x: MARGIN, y: writer.y, width, height: 8, color: paint(categoryColor(5)) });
  }
  writer.y -= 16;
}

function fit(font: PDFFont, text: string, size: number, width: number): string {
  const value = text.replaceAll("—", "-");
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let end = value.length;
  while (end > 0 && font.widthOfTextAtSize(`${value.slice(0, end)}...`, size) > width) end -= 1;
  return end === 0 ? "" : `${value.slice(0, end)}...`;
}
