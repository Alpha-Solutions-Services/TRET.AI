import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quickbooksApiEnabled } from "./api-flag";
import { buildFilePreview, parseQuickbooksExpenseCsv, quickbooksRowHash } from "./file-import";
import { buildJournalCsv } from "./file-journal";

const ACCOUNTS = {
  feeDebitName: "Accounts Receivable",
  feeCreditName: "Management Fee Income",
  tolsonDebitName: "Contract Labor",
  tolsonCreditName: "Tolson Payable",
};

describe("QuickBooks file export", () => {
  it("builds a balanced journal CSV for fee income and Tolson payable", () => {
    const csv = buildJournalCsv({
      weekStart: "2026-10-05",
      incomeCents: 150_000,
      tolsonCents: 20_000,
      accounts: ACCOUNTS,
    });
    expect(csv).toContain("Journal No.,Journal Date,Account Name,Journal/Description,Debits,Credits");
    expect(csv).toContain("TRET20261005,10/05/2026,Accounts Receivable,Weekly management fee income,1500.00,");
    expect(csv).toContain("TRET20261005,10/05/2026,Management Fee Income,Weekly management fee income,,1500.00");
    expect(csv).toContain("TRET20261005,10/05/2026,Contract Labor,Tolson payable,200.00,");
    expect(csv).toContain("TRET20261005,10/05/2026,Tolson Payable,Tolson payable,,200.00");
    expect(buildJournalCsv({ weekStart: "2026-10-05", incomeCents: 0, tolsonCents: 0, accounts: ACCOUNTS })).toBeNull();
  });
});

describe("QuickBooks file import", () => {
  it("previews a transaction list, skips credits and duplicates, and keeps a stable hash", () => {
    const text = readFileSync("fixtures/quickbooks/transaction-list-sample.csv", "utf8");
    const drafts = parseQuickbooksExpenseCsv(text);
    expect(drafts).toHaveLength(4);
    expect(drafts[0]).toMatchObject({ date: "2026-10-02", vendorName: "Vektor", amountCents: 12550, skipReason: null });
    expect(drafts[2]?.skipReason).toBe("Credit is not saved as an expense.");
    expect(drafts[3]?.skipReason).toBe("Duplicate row in this file.");
    const hash = quickbooksRowHash({
      date: "2026-10-02",
      vendorName: "Vektor",
      accountName: "Software",
      memo: "October dispatch",
      amountCents: 12550,
    });
    expect(drafts[0]?.hash).toBe(hash);
    expect(hash).toMatch(/^csv:[a-f0-9]{64}$/);
    const preview = buildFilePreview(
      drafts,
      [{ kind: "vendor", name: "Vektor", category: "Vektor Fee" }],
      new Set([hash]),
    );
    expect(preview[0]).toMatchObject({ category: "Vektor Fee", alreadySaved: true });
    expect(preview[1]?.category).toBeNull();
  });
});

describe("QuickBooks API flag", () => {
  it("stays off unless the flag is true", () => {
    expect(quickbooksApiEnabled({})).toBe(false);
    expect(quickbooksApiEnabled({ QUICKBOOKS_API_ENABLED: "false" })).toBe(false);
    expect(quickbooksApiEnabled({ QUICKBOOKS_API_ENABLED: "true" })).toBe(true);
  });
});
