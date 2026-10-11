import { tryDollarStringToCents } from "@/lib/money/cents";
import { sheetDay } from "@/lib/sheets/cell";

export type ReceiptSuggestion = {
  vendor: string;
  isoDate: string | null;
  amountCents: number | null;
  flags: string[];
};

export type ReceiptDecision =
  | { skip: true; reason: string }
  | { skip: false; suggestion: ReceiptSuggestion };

const BOL = /bill of lading|\bBOL\b|shipper\b|consignee\b|pro number/i;

/** A file named Receipt that is really a BOL is skipped. */
export function interpretReceipt(input: {
  fileName: string;
  text: string;
  weekStart: string;
  weekEnd: string;
  truckUnit: string;
  driverName?: string | null;
}): ReceiptDecision {
  const namedReceipt = /receipt/i.test(input.fileName);
  if (BOL.test(input.text) && (namedReceipt || BOL.test(input.fileName))) {
    return { skip: true, reason: "This file is a BOL, not a receipt." };
  }
  if (BOL.test(input.text) && !/\$\s*[0-9]/.test(input.text)) {
    return { skip: true, reason: "This file is a BOL, not a receipt." };
  }
  const vendor = vendorOf(input.text, input.fileName);
  const isoDate = dateOf(input.text);
  const amountCents = amountOf(input.text);
  const flags: string[] = [];
  if (isoDate && (isoDate < input.weekStart || isoDate > input.weekEnd)) {
    flags.push("Date is outside this week.");
  }
  if (differentVehicle(input.text, input.truckUnit)) {
    flags.push("The vehicle on the receipt does not match this truck.");
  }
  if (input.driverName && differentName(input.text, input.driverName)) {
    flags.push("The name on the receipt does not match the driver.");
  }
  return {
    skip: false,
    suggestion: { vendor, isoDate, amountCents, flags },
  };
}

function vendorOf(text: string, fileName: string): string {
  const line = text
    .split(/\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 1 && !/receipt|total|amount|date/i.test(part));
  if (line) return line.slice(0, 80);
  return fileName.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "Receipt";
}

function dateOf(text: string): string | null {
  const match = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/.exec(text);
  if (!match?.[1]) return null;
  return sheetDay(match[1]);
}

function amountOf(text: string): number | null {
  const amounts = [...text.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/g)];
  const last = amounts[amounts.length - 1]?.[1];
  if (!last) return null;
  const parsed = tryDollarStringToCents(last.replace(/,/g, ""));
  return parsed.ok ? parsed.cents : null;
}

function differentVehicle(text: string, unit: string): boolean {
  const match = /(?:unit|truck|vehicle)\s*#?\s*([0-9]+)/i.exec(text);
  if (!match?.[1]) return false;
  return match[1].replace(/^0+/, "") !== unit.replace(/^0+/, "");
}

function differentName(text: string, driverName: string): boolean {
  const last = driverName.trim().split(/\s+/).at(-1)?.toLowerCase();
  if (!last || last.length < 3) return false;
  return !text.toLowerCase().includes(last);
}
