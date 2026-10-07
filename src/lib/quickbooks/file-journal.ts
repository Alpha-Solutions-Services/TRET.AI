import { assertCents, centsToDollarString } from "@/lib/money/cents";
import { assertIsoDate } from "@/lib/fee-engine";

export type FileAccountNames = {
  feeDebitName: string;
  feeCreditName: string;
  tolsonDebitName: string;
  tolsonCreditName: string;
};

export function emptyFileAccountNames(): FileAccountNames {
  return { feeDebitName: "", feeCreditName: "", tolsonDebitName: "", tolsonCreditName: "" };
}

export function fileAccountsComplete(accounts: FileAccountNames): boolean {
  return Object.values(accounts).every((value) => value.trim().length > 0);
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function usDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}

/**
 * QuickBooks Online journal entry CSV.
 * Columns match Import data, Journal entries: Journal No., Journal Date,
 * Account Name, Journal/Description, Debits, Credits.
 */
export function buildJournalCsv(input: {
  weekStart: string;
  incomeCents: number;
  tolsonCents: number;
  accounts: FileAccountNames;
}): string | null {
  assertIsoDate(input.weekStart, "Week");
  assertCents(input.incomeCents, "Income");
  assertCents(input.tolsonCents, "Tolson payable");
  if (input.incomeCents === 0 && input.tolsonCents === 0) return null;
  if (!fileAccountsComplete(input.accounts)) {
    throw new Error("Save the four QuickBooks account names first");
  }
  const journalNo = `TRET${input.weekStart.replace(/-/g, "")}`;
  const date = usDate(input.weekStart);
  const lines: string[][] = [
    ["Journal No.", "Journal Date", "Account Name", "Journal/Description", "Debits", "Credits"],
  ];
  function add(account: string, description: string, debit: number, credit: number) {
    lines.push([
      journalNo,
      date,
      account.trim(),
      description,
      debit > 0 ? centsToDollarString(debit) : "",
      credit > 0 ? centsToDollarString(credit) : "",
    ]);
  }
  if (input.incomeCents > 0) {
    add(input.accounts.feeDebitName, "Weekly management fee income", input.incomeCents, 0);
    add(input.accounts.feeCreditName, "Weekly management fee income", 0, input.incomeCents);
  }
  if (input.tolsonCents > 0) {
    add(input.accounts.tolsonDebitName, "Tolson payable", input.tolsonCents, 0);
    add(input.accounts.tolsonCreditName, "Tolson payable", 0, input.tolsonCents);
  }
  return lines.map((line) => line.map(csvCell).join(",")).join("\n") + "\n";
}
