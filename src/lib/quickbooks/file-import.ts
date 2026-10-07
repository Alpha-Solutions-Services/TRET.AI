import { createHash } from "node:crypto";
import { parseCsv } from "@/lib/fuel-tolls/csv";
import { canonicalLegacyCategory } from "@/lib/legacy/expenses";
import { dollarStringToCents } from "@/lib/money/cents";
import { isEmptyCell, normalizeHeader, sheetDay } from "@/lib/sheets/cell";

export type FileMapKind = "vendor" | "account";

export type FileCategoryMap = {
  kind: FileMapKind;
  name: string;
  category: string;
};

export type FileExpenseDraft = {
  hash: string;
  date: string;
  vendorName: string;
  accountName: string;
  memo: string;
  amountCents: number;
  skipReason: string | null;
};

export type FilePreviewRow = FileExpenseDraft & {
  category: string | null;
  alreadySaved: boolean;
};

const DATE_HEADERS = ["date", "transaction date"];
const VENDOR_HEADERS = ["name", "vendor", "payee", "customer"];
const ACCOUNT_HEADERS = ["account", "account name", "distribution account"];
const MEMO_HEADERS = ["memo/description", "memo", "description"];
const AMOUNT_HEADERS = ["amount"];
const DEBIT_HEADERS = ["debit"];
const CREDIT_HEADERS = ["credit"];

function findHeader(headers: string[], names: string[]): number {
  const wanted = new Set(names);
  return headers.findIndex((header) => wanted.has(normalizeHeader(header)));
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function quickbooksRowHash(input: {
  date: string;
  vendorName: string;
  accountName: string;
  memo: string;
  amountCents: number;
}): string {
  const body = [input.date, norm(input.vendorName), norm(input.accountName), norm(input.memo), String(input.amountCents)].join("|");
  return `csv:${createHash("sha256").update(body).digest("hex")}`;
}

function amountCents(raw: string): number | null {
  if (isEmptyCell(raw)) return null;
  const negative = raw.trim().startsWith("-") || raw.trim().startsWith("(");
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/[()]/g, "").replace(/^-/, "");
  if (!cleaned) return null;
  try {
    const cents = dollarStringToCents(cleaned);
    return negative ? -cents : cents;
  } catch {
    return null;
  }
}

export function parseQuickbooksExpenseCsv(text: string): FileExpenseDraft[] {
  const grid = parseCsv(text);
  if (grid.length < 2) throw new Error("CSV needs a header row and at least one row.");
  const headers = grid[0] ?? [];
  const dateCol = findHeader(headers, DATE_HEADERS);
  const vendorCol = findHeader(headers, VENDOR_HEADERS);
  const accountCol = findHeader(headers, ACCOUNT_HEADERS);
  const memoCol = findHeader(headers, MEMO_HEADERS);
  const amountCol = findHeader(headers, AMOUNT_HEADERS);
  const debitCol = findHeader(headers, DEBIT_HEADERS);
  const creditCol = findHeader(headers, CREDIT_HEADERS);
  if (dateCol < 0) throw new Error("CSV needs a Date column.");
  if (vendorCol < 0 && accountCol < 0) throw new Error("CSV needs a Name or Account column.");
  if (amountCol < 0 && debitCol < 0) throw new Error("CSV needs an Amount or Debit column.");

  const out: FileExpenseDraft[] = [];
  const seen = new Set<string>();
  for (const line of grid.slice(1)) {
    const date = sheetDay(line[dateCol] ?? "");
    const vendorName = vendorCol < 0 ? "" : (line[vendorCol] ?? "").trim();
    const accountName = accountCol < 0 ? "" : (line[accountCol] ?? "").trim();
    const memo = memoCol < 0 ? "" : (line[memoCol] ?? "").replace(/\s+/g, " ").trim();
    if (!date && !vendorName && !accountName) continue;
    if (/^total/i.test(vendorName) || /^total/i.test(accountName)) continue;
    let cents: number | null = null;
    if (amountCol >= 0) cents = amountCents(line[amountCol] ?? "");
    if (cents == null && debitCol >= 0) cents = amountCents(line[debitCol] ?? "");
    if ((cents == null || cents === 0) && creditCol >= 0) {
      const credit = amountCents(line[creditCol] ?? "");
      if (credit != null && credit !== 0) cents = -Math.abs(credit);
    }
    const draftBase = {
      date: date ?? "",
      vendorName,
      accountName,
      memo,
      amountCents: cents ?? 0,
    };
    let skipReason: string | null = null;
    if (!date) skipReason = "Date is empty.";
    else if (cents == null || cents === 0) skipReason = "Amount is empty.";
    else if (cents < 0) skipReason = "Credit is not saved as an expense.";
    const hash = quickbooksRowHash({ ...draftBase, amountCents: cents ?? 0 });
    if (!skipReason && seen.has(hash)) skipReason = "Duplicate row in this file.";
    if (!skipReason) seen.add(hash);
    out.push({ ...draftBase, amountCents: cents ?? 0, hash, skipReason });
  }
  return out;
}

export function suggestFileCategory(row: FileExpenseDraft, maps: FileCategoryMap[]): string | null {
  const vendor = norm(row.vendorName);
  if (vendor) {
    const match = maps.find((map) => map.kind === "vendor" && norm(map.name) === vendor);
    const category = match ? canonicalLegacyCategory(match.category) : null;
    if (category) return category;
  }
  const account = norm(row.accountName);
  if (account) {
    const match = maps.find((map) => map.kind === "account" && norm(map.name) === account);
    const category = match ? canonicalLegacyCategory(match.category) : null;
    if (category) return category;
  }
  return null;
}

export function buildFilePreview(
  drafts: FileExpenseDraft[],
  maps: FileCategoryMap[],
  existing: ReadonlySet<string>,
): FilePreviewRow[] {
  return drafts.map((row) => ({
    ...row,
    category: row.skipReason ? null : suggestFileCategory(row, maps),
    alreadySaved: existing.has(row.hash),
  }));
}
