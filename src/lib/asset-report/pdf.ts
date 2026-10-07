import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatStatementDollars } from "@/lib/reports/format";
import { milesLabel, type AssetReport } from "./build";

/** Legacy template page, landscape 16:9. */
export const PAGE_W = 960;
export const PAGE_H = 540;

const INK: RGB = rgb(20 / 255, 41 / 255, 64 / 255);
const BLACK: RGB = rgb(0, 0, 0);
const WHITE: RGB = rgb(1, 1, 1);
const GREEN: RGB = rgb(5 / 255, 168 / 255, 92 / 255);
const ZEBRA_A: RGB = rgb(224 / 255, 235 / 255, 245 / 255);
const ZEBRA_B: RGB = rgb(209 / 255, 222 / 255, 235 / 255);
const ROW: RGB = rgb(221 / 255, 232 / 255, 243 / 255);
const CARD: RGB = rgb(240 / 255, 244 / 255, 248 / 255);
const BOX_FILL: RGB = rgb(238 / 255, 242 / 255, 247 / 255);
const PERIOD_BOX: Box = { x: 748, y: 12, w: 188, h: 32 };

type Box = { x: number; y: number; w: number; h: number };
type Align = "left" | "right" | "center";

function safe(text: string): string {
  return text.replace(/\u2014/g, "-").replace(/\u2013/g, "-").replace(/[^\x20-\x7E]/g, "");
}

function money(cents: number): string {
  return formatStatementDollars(cents);
}

function asset(name: string): Uint8Array {
  return readFileSync(join(process.cwd(), "src/lib/asset-report/assets", name));
}

function paint(page: PDFPage, box: Box, color: RGB): void {
  page.drawRectangle({
    x: box.x,
    y: PAGE_H - box.y - box.h,
    width: box.w,
    height: box.h,
    color,
  });
}

/** Table fills stop on the template border. A box that crosses it is clipped. */
function paintInside(page: PDFPage, box: Box, color: RGB, limit: Box): void {
  const x = Math.max(box.x, limit.x);
  const y = Math.max(box.y, limit.y);
  const right = Math.min(box.x + box.w, limit.x + limit.w);
  const bottom = Math.min(box.y + box.h, limit.y + limit.h);
  if (right <= x || bottom <= y) return;
  paint(page, { x, y, w: right - x, h: bottom - y }, color);
}

/** Page 2 table interiors, measured from the Legacy template. */
const LOAD_TABLE: Box = { x: 57.2, y: 219, w: 601.1, h: 173.4 };
const SIDE_TABLE: Box = { x: 679, y: 219, w: 278, h: 224.2 };

function textIn(
  page: PDFPage,
  box: Box,
  text: string,
  font: PDFFont,
  size: number,
  color: RGB,
  align: Align,
): void {
  const value = safe(text).trim();
  if (!value) return;
  let used = size;
  let width = font.widthOfTextAtSize(value, used);
  const max = Math.max(8, box.w - 4);
  while (width > max && used > 3.5) {
    used = Math.round((used - 0.2) * 10) / 10;
    width = font.widthOfTextAtSize(value, used);
  }
  let x = box.x + 2;
  if (align === "right") x = box.x + box.w - width - 2;
  if (align === "center") x = box.x + (box.w - width) / 2;
  const baseline = PAGE_H - box.y - box.h / 2 - used * 0.35;
  page.drawText(value, { x, y: baseline, size: used, font, color });
}

function fill(
  page: PDFPage,
  box: Box,
  text: string,
  font: PDFFont,
  size: number,
  color: RGB,
  align: Align,
  background?: RGB,
): void {
  if (background) paint(page, box, background);
  textIn(page, box, text, font, size, color, align);
}

function drawPeriod(page: PDFPage, bold: PDFFont, period: string): void {
  fill(page, PERIOD_BOX, period, bold, 10, INK, "center", BOX_FILL);
}

function mpg(value: string): string {
  if (!value || value === "n/a") return "n/a";
  return value.endsWith("MPG") ? value : `${value} MPG`;
}

function gallons(value: string): string {
  if (!value || value === "n/a") return "n/a";
  return value.endsWith("gal") ? value : `${value} gal`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderAssetReportPdf(report: AssetReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Legacy Inc Global Weekly Asset Management Report");
  doc.setCreationDate(new Date("2026-10-07T00:00:00Z"));
  doc.setModificationDate(new Date("2026-10-07T00:00:00Z"));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const header = await doc.embedPng(asset("legacy-cover-header.png"));
  const art = await doc.embedPng(asset("legacy-cover-art.png"));
  const footer = await doc.embedPng(asset("legacy-cover-footer.png"));
  const page2 = await doc.embedPng(asset("legacy-page-2.png"));
  const page3 = await doc.embedPng(asset("legacy-page-3.png"));
  const page4 = await doc.embedPng(asset("legacy-page-4.png"));
  drawCover(doc, header, art, footer, font, bold, report);
  drawLoads(doc, page2, font, bold, report);
  drawEarnings(doc, page3, font, bold, report);
  drawSummary(doc, page4, font, bold, report);
  return doc.save();
}

function drawCover(
  doc: PDFDocument,
  header: PDFImage,
  art: PDFImage,
  footer: PDFImage,
  font: PDFFont,
  bold: PDFFont,
  report: AssetReport,
): void {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const headerH = (128 * PAGE_H) / 1200;
  const footerH = (56 * PAGE_H) / 1200;
  page.drawImage(header, { x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH });
  page.drawImage(art, { x: 0, y: footerH, width: PAGE_W, height: PAGE_H - headerH - footerH });
  page.drawImage(footer, { x: 0, y: 0, width: PAGE_W, height: footerH });
  drawPeriod(page, bold, report.periodLabel);
}

function drawLoads(doc: PDFDocument, background: PDFImage, font: PDFFont, bold: PDFFont, report: AssetReport): void {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawImage(background, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  drawPeriod(page, bold, report.periodLabel);
  // The page image is a filled example. Cover that text, then draw this truck.
  paint(page, { x: 60, y: 98, w: 600, h: 84 }, WHITE);
  textIn(page, { x: 70, y: 102, w: 110, h: 16 }, "Reporting Period:", bold, 7.4, INK, "left");
  textIn(page, { x: 182, y: 102, w: 200, h: 16 }, report.periodLabel, font, 7.4, INK, "left");
  textIn(page, { x: 70, y: 120, w: 80, h: 16 }, "Asset Partner:", bold, 7.4, INK, "left");
  textIn(page, { x: 152, y: 120, w: 180, h: 16 }, report.assetPartner, bold, 7.4, INK, "left");
  textIn(page, { x: 350, y: 120, w: 48, h: 16 }, "Driver:", bold, 7.4, INK, "left");
  textIn(page, { x: 400, y: 120, w: 200, h: 16 }, report.driver, bold, 7.4, INK, "left");
  textIn(page, { x: 70, y: 140, w: 40, h: 16 }, "Truck:", bold, 7.4, INK, "left");
  textIn(page, { x: 112, y: 140, w: 40, h: 16 }, report.unitNumber, font, 7.4, INK, "left");
  textIn(page, { x: 160, y: 140, w: 48, h: 16 }, "Trailer:", bold, 7.4, INK, "left");
  textIn(page, { x: 210, y: 140, w: 70, h: 16 }, report.trailer, font, 7.4, INK, "left");
  textIn(page, { x: 290, y: 140, w: 28, h: 16 }, "VIN:", bold, 7.4, INK, "left");
  textIn(page, { x: 320, y: 140, w: 120, h: 16 }, report.vin, font, 7.4, INK, "left");
  textIn(page, { x: 70, y: 160, w: 70, h: 16 }, "Dispatcher:", bold, 7.4, INK, "left");
  textIn(page, { x: 142, y: 160, w: 240, h: 16 }, report.dispatcher, font, 7.4, INK, "left");
  paint(page, LOAD_TABLE, ROW);
  paint(page, SIDE_TABLE, ROW);

  const columns: Array<{ x: number; w: number; align: Align; size: number }> = [
    { x: 55.7, w: 73.6, align: "left", size: 6.2 },
    { x: 130.7, w: 50.6, align: "left", size: 6.2 },
    { x: 182.7, w: 103.6, align: "left", size: 5.8 },
    { x: 287.7, w: 89.6, align: "left", size: 5.8 },
    { x: 378.7, w: 97.6, align: "left", size: 5.8 },
    { x: 477.7, w: 58.6, align: "right", size: 6.2 },
    { x: 537.7, w: 58.6, align: "right", size: 6.2 },
    { x: 597.7, w: 62.6, align: "right", size: 6.2 },
  ];
  const rowH = 27.6;
  const rowTop = 220;
  const shown = report.loads.slice(0, 5);
  for (let index = 0; index < shown.length; index += 1) {
    const y = rowTop + index * rowH;
    const backgroundColor = index % 2 === 0 ? ZEBRA_A : ZEBRA_B;
    const load = shown[index];
    if (!load) continue;
    const loaded = load.manifestRole === "partial" ? "partial" : milesLabel(load.loadedHundredths);
    const manifest = load.manifestRef ? `Manifest ${load.manifestRef}` : "";
    const values = [
      load.loadId,
      load.date,
      load.broker,
      load.origin,
      load.destination,
      loaded,
      milesLabel(load.deadheadHundredths),
      money(load.rateCents),
    ];
    columns.forEach((column, columnIndex) => {
      const box = { x: column.x, y, w: column.w, h: 27.6 };
      paintInside(page, box, backgroundColor, LOAD_TABLE);
      const value = values[columnIndex] ?? "";
      if (columnIndex === 0 && manifest) {
        textIn(page, { x: box.x, y: box.y + 2, w: box.w, h: 12 }, value, font, column.size, BLACK, "left");
        textIn(page, { x: box.x, y: box.y + 13, w: box.w, h: 12 }, manifest, font, 5, BLACK, "left");
      } else {
        textIn(page, box, value, font, column.size, BLACK, column.align);
      }
    });
  }

  const totalY = rowTop + shown.length * rowH;
  paintInside(page, { x: 55.7, y: totalY, w: 604.6, h: rowH }, ZEBRA_B, LOAD_TABLE);
  textIn(page, { x: 55.7, y: totalY, w: 73.6, h: rowH }, "TOTALS", bold, 6.4, BLACK, "left");
  const totals = [
    { x: 477.7, w: 58.6, text: milesLabel(report.loadedMilesHundredths) },
    { x: 537.7, w: 58.6, text: milesLabel(report.deadheadMilesHundredths) },
    { x: 597.7, w: 62.6, text: money(report.grossCents) },
  ];
  for (const total of totals) {
    textIn(page, { x: total.x, y: totalY, w: total.w, h: rowH }, total.text, bold, 6.4, BLACK, "right");
  }
  const weeklyY = [222, 246, 270, 294, 318, 342, 366, 390, 414];
  const weeklyLabels = [
    "Gross Freight Revenue",
    "Total Loads Completed",
    "Loaded Miles",
    "Deadhead Miles",
    "Dispatch Miles",
    "Fuel Economy",
    "Average Revenue Per Load",
    "Average Rate Per Dispatch Mile",
    "Fuel Cost Per Mile",
  ];
  const weekly = [
    money(report.grossCents),
    String(report.loadCount),
    milesLabel(report.loadedMilesHundredths),
    milesLabel(report.deadheadMilesHundredths),
    milesLabel(report.dispatchMilesHundredths),
    mpg(report.fuelEconomy),
    report.revenuePerLoadCents == null ? "n/a" : money(report.revenuePerLoadCents),
    report.ratePerMileCents == null ? "n/a" : money(report.ratePerMileCents),
    report.fuelPerMileCents == null ? "n/a" : money(report.fuelPerMileCents),
  ];
  weekly.forEach((value, index) => {
    const y = weeklyY[index] ?? 0;
    textIn(page, { x: 684, y, w: 94, h: 22 }, weeklyLabels[index] ?? "", font, 5.6, BLACK, "left");
    textIn(page, { x: 776, y, w: 48, h: 22 }, value, font, 5.6, BLACK, "right");
  });
  const dailyLabels = [
    "Loads Accepted",
    "Loads Delivered",
    "On-Time Deliveries",
    "Claims",
    "Cargo Damage",
    "Service Failures",
    "Cancellation",
  ];
  const daily = [
    report.loadsAccepted,
    report.loadsDelivered,
    report.onTime,
    report.claims,
    report.cargoDamage,
    report.serviceFailures,
    report.cancellations,
  ];
  daily.forEach((value, index) => {
    const y = weeklyY[index] ?? 0;
    textIn(page, { x: 830, y, w: 80, h: 22 }, dailyLabels[index] ?? "", font, 5.6, BLACK, "left");
    textIn(page, { x: 908, y, w: 46, h: 22 }, value, font, 5.6, BLACK, "right");
  });

  // The template notes bar runs past the load table, into the gap under Weekly Totals.
  paint(page, { x: 57, y: 450, w: 618, h: 44 }, WHITE);
  const note = report.notes.join(" ").trim();
  if (note) {
    fill(page, { x: 62, y: 458, w: 590, h: 28 }, note, font, 5.5, BLACK, "left", WHITE);
  }
}

function drawEarnings(doc: PDFDocument, background: PDFImage, font: PDFFont, bold: PDFFont, report: AssetReport): void {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawImage(background, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  drawPeriod(page, bold, report.periodLabel);
  paint(page, { x: 28, y: 112, w: 910, h: 390 }, WHITE);
  const who = `${report.assetPartner} | Truck ${report.unitNumber} | ${report.periodLabel}`;
  fill(page, { x: 35, y: 116, w: 520, h: 18 }, who, font, 8, INK, "left");

  report.leftExpenses.forEach((line, index) => {
    const y = 160 + index * 27;
    textIn(page, { x: 40, y, w: 320, h: 18 }, line.label, font, 7.4, INK, "left");
    textIn(page, { x: 370, y, w: 88, h: 18 }, money(line.cents), bold, 7.5, INK, "right");
  });

  const rightY = [160, 187, 214, 241, 268, 295, 322];
  rightY.forEach((y, index) => {
    const line = report.rightExpenses[index];
    paint(page, { x: 490, y, w: 345, h: 18 }, WHITE);
    textIn(page, { x: 496, y, w: 330, h: 18 }, line?.label ?? "", font, 7.4, INK, "left");
    fill(page, { x: 840, y, w: 83, h: 18 }, line ? money(line.cents) : "", bold, 7.5, INK, "right", WHITE);
  });

  paint(page, { x: 36, y: 418, w: 888, h: 72 }, CARD);
  textIn(page, { x: 48, y: 422, w: 200, h: 20 }, "Gross Revenue", bold, 10, INK, "left");
  textIn(page, { x: 250, y: 422, w: 160, h: 20 }, money(report.grossCents), bold, 11, INK, "right");
  textIn(page, { x: 470, y: 422, w: 220, h: 20 }, "Total Truck Expenses", bold, 10, INK, "left");
  textIn(page, { x: 700, y: 422, w: 200, h: 20 }, money(report.expenseCents), bold, 11, INK, "right");
  textIn(page, { x: 48, y: 448, w: 200, h: 20 }, "Net Owner Earnings", bold, 10, INK, "left");
  textIn(page, { x: 250, y: 448, w: 160, h: 20 }, money(report.netCents), bold, 11, GREEN, "right");
  textIn(page, { x: 470, y: 448, w: 250, h: 20 }, report.escrowCardLabel, bold, 9, INK, "left");
  textIn(page, { x: 720, y: 448, w: 180, h: 20 }, money(report.escrowCents), bold, 11, INK, "right");
  textIn(
    page,
    { x: 36, y: 492, w: 700, h: 14 },
    "All expenses shown above are included in Total Truck Expenses.",
    font,
    6.5,
    BLACK,
    "left",
  );
}

function drawSummary(doc: PDFDocument, background: PDFImage, font: PDFFont, bold: PDFFont, report: AssetReport): void {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawImage(background, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  drawPeriod(page, bold, report.periodLabel);
  paint(page, { x: 20, y: 118, w: 920, h: 385 }, WHITE);

  paint(page, { x: 25, y: 124, w: 910, h: 58 }, CARD);
  const lines = wrap(report.summary, font, 6.4, 890);
  lines.slice(0, 5).forEach((line, index) => {
    page.drawText(line, { x: 34, y: PAGE_H - 142 - index * 8.2, size: 6.4, font, color: BLACK });
  });

  const panels: Array<{ x: number; w: number; title: string }> = [
    { x: 24, w: 176, title: "Asset Status" },
    { x: 206, w: 188, title: "Performance KPIs" },
    { x: 400, w: 200, title: "Operating Expenses" },
    { x: 606, w: 176, title: "Fuel Summary" },
    { x: 788, w: 150, title: "Compliance / Maintenance" },
  ];
  for (const panel of panels) {
    paint(page, { x: panel.x, y: 196, w: panel.w, h: 18 }, rgb(47 / 255, 106 / 255, 151 / 255));
    textIn(page, { x: panel.x + 4, y: 196, w: panel.w - 8, h: 18 }, panel.title, bold, 6.5, WHITE, "left");
  }

  const statusY = [220, 248, 276, 304, 332, 360];
  const statusLabels = [
    "Asset Status",
    "Available for Dispatch",
    "Operating Condition",
    "Revenue Performance",
    "Compliance",
    "Maintenance",
  ];
  statusLabels.forEach((label, index) => {
    textIn(page, { x: 28, y: statusY[index] ?? 0, w: 100, h: 24 }, label, font, 6, BLACK, "left");
  });
  const status = [
    report.assetStatus,
    report.availableForDispatch,
    report.operatingCondition,
    report.revenuePerformance,
    report.compliance,
    report.maintenance,
  ];
  status.forEach((value, index) => {
    const y = statusY[index] ?? 0;
    fill(page, { x: 120, y, w: 76, h: 24 }, value, font, 6.2, BLACK, "right", index % 2 === 0 ? ZEBRA_A : ZEBRA_B);
  });

  const kpiLabels = [
    "Gross Revenue",
    "Fuel Cost Per Mile",
    "Owner Earnings",
    "Loads Completed",
    "Dispatch Miles",
    "Rate Per Dispatch Mile",
  ];
  kpiLabels.forEach((label, index) => {
    textIn(page, { x: 210, y: statusY[index] ?? 0, w: 110, h: 24 }, label, font, 6, BLACK, "left");
  });
  const kpis = [
    money(report.grossCents),
    report.fuelPerMileCents == null ? "n/a" : money(report.fuelPerMileCents),
    money(report.netCents),
    String(report.loadCount),
    milesLabel(report.dispatchMilesHundredths),
    report.ratePerMileCents == null ? "n/a" : money(report.ratePerMileCents),
  ];
  kpis.forEach((value, index) => {
    const y = statusY[index] ?? 0;
    fill(
      page,
      { x: 318, y, w: 72, h: 24 },
      value,
      bold,
      6.4,
      index === 2 ? GREEN : BLACK,
      "right",
      index % 2 === 0 ? ZEBRA_A : ZEBRA_B,
    );
  });

  const expenseLines = [
    ...report.leftExpenses,
    ...report.rightExpenses,
    { label: "Total Truck Expenses", cents: report.expenseCents },
  ];
  const expenseY = expenseLines.map((_, index) => 220 + index * 16);
  expenseLines.forEach((line, index) => {
    const y = expenseY[index] ?? 0;
    const strong = index === expenseLines.length - 1;
    paint(page, { x: 404, y, w: 118, h: 15 }, ROW);
    textIn(page, { x: 406, y, w: 114, h: 15 }, line.label, strong ? bold : font, 5, BLACK, "left");
    fill(page, { x: 525, y, w: 79.5, h: 15 }, money(line.cents), strong ? bold : font, 5, BLACK, "right", ROW);
  });

  const fuelLabels = ["Fuel Purchased", "Fuel Cost", "Avg Unit Price", "Fuel Economy", "Fuel Cost / Mile", "Dispatch Miles"];
  const fuelY = statusY;
  fuelLabels.forEach((label, index) => {
    textIn(page, { x: 610, y: fuelY[index] ?? 0, w: 90, h: 24 }, label, font, 6, BLACK, "left");
  });
  const fuel = [
    gallons(report.fuelGallonsLabel),
    money(report.fuelCostCents),
    report.fuelUnitPriceCents == null ? "n/a" : money(report.fuelUnitPriceCents),
    mpg(report.fuelEconomy),
    report.fuelPerMileCents == null ? "n/a" : money(report.fuelPerMileCents),
    milesLabel(report.dispatchMilesHundredths),
  ];
  fuel.forEach((value, index) => {
    const y = fuelY[index] ?? 0;
    fill(page, { x: 700, y, w: 76, h: 24 }, value, font, 6, BLACK, "right", index % 2 === 0 ? ZEBRA_A : ZEBRA_B);
  });

  const complianceLabels = [
    "Driver Qualification",
    "Medical Card",
    "Insurance",
    "Registration",
    "Annual DOT Insp.",
    "ELD Compliance",
    "Maintenance",
  ];
  const complianceY = [220, 248, 276, 304, 332, 360, 388];
  complianceLabels.forEach((label, index) => {
    textIn(page, { x: 792, y: complianceY[index] ?? 0, w: 88, h: 24 }, label, font, 5.4, BLACK, "left");
  });
  const compliance = [
    report.driverQualification,
    report.medicalCard,
    report.insuranceStatus,
    report.registration,
    report.annualDot,
    report.eldCompliance,
    report.maintenance,
  ];
  compliance.forEach((value, index) => {
    const y = complianceY[index] ?? 0;
    fill(page, { x: 878, y, w: 56, h: 24 }, value, font, 5.6, BLACK, "right", index % 2 === 0 ? ZEBRA_A : ZEBRA_B);
  });
}
