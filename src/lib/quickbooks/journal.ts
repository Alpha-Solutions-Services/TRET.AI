import { assertCents, centsToDollarString } from "@/lib/money/cents";
import { assertIsoDate } from "@/lib/fee-engine";

export type PostingAccounts = {
  feeDebitAccountId: string;
  feeDebitAccountName: string;
  feeCreditAccountId: string;
  feeCreditAccountName: string;
  tolsonDebitAccountId: string;
  tolsonDebitAccountName: string;
  tolsonCreditAccountId: string;
  tolsonCreditAccountName: string;
};

export type JournalPreviewLine = {
  postingType: "Debit" | "Credit";
  accountName: string;
  amountCents: number;
  description: string;
};

const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,40}$/;

function accountId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!ACCOUNT_ID.test(trimmed)) throw new Error(`${label} is not saved`);
  return trimmed;
}

function lineJson(input: {
  amountCents: number;
  description: string;
  postingType: "Debit" | "Credit";
  accountId: string;
  accountName: string;
}): string {
  assertCents(input.amountCents, input.description);
  if (input.amountCents <= 0) throw new Error(`${input.description} must be more than zero`);
  return (
    `{"DetailType":"JournalEntryLineDetail","Amount":${centsToDollarString(input.amountCents)},` +
    `"Description":${JSON.stringify(input.description)},"JournalEntryLineDetail":{"PostingType":${JSON.stringify(input.postingType)},` +
    `"AccountRef":{"value":${JSON.stringify(input.accountId)},"name":${JSON.stringify(input.accountName)}}}}`
  );
}

export function buildWeekJournal(input: {
  weekStart: string;
  incomeCents: number;
  tolsonCents: number;
  accounts: PostingAccounts;
}): { body: string; lines: JournalPreviewLine[] } | null {
  assertIsoDate(input.weekStart, "Week");
  assertCents(input.incomeCents, "Income");
  assertCents(input.tolsonCents, "Tolson payable");
  if (input.incomeCents === 0 && input.tolsonCents === 0) return null;

  const lines: JournalPreviewLine[] = [];
  const jsonLines: string[] = [];

  if (input.incomeCents > 0) {
    const debitId = accountId(input.accounts.feeDebitAccountId, "Management fee debit account");
    const creditId = accountId(input.accounts.feeCreditAccountId, "Management fee income account");
    const description = "Weekly management fee income";
    lines.push(
      {
        postingType: "Debit",
        accountName: input.accounts.feeDebitAccountName.trim() || debitId,
        amountCents: input.incomeCents,
        description,
      },
      {
        postingType: "Credit",
        accountName: input.accounts.feeCreditAccountName.trim() || creditId,
        amountCents: input.incomeCents,
        description,
      },
    );
    jsonLines.push(
      lineJson({
        amountCents: input.incomeCents,
        description,
        postingType: "Debit",
        accountId: debitId,
        accountName: input.accounts.feeDebitAccountName.trim() || debitId,
      }),
      lineJson({
        amountCents: input.incomeCents,
        description,
        postingType: "Credit",
        accountId: creditId,
        accountName: input.accounts.feeCreditAccountName.trim() || creditId,
      }),
    );
  }

  if (input.tolsonCents > 0) {
    const debitId = accountId(input.accounts.tolsonDebitAccountId, "Tolson debit account");
    const creditId = accountId(input.accounts.tolsonCreditAccountId, "Tolson payable account");
    const description = "Tolson payable";
    lines.push(
      {
        postingType: "Debit",
        accountName: input.accounts.tolsonDebitAccountName.trim() || debitId,
        amountCents: input.tolsonCents,
        description,
      },
      {
        postingType: "Credit",
        accountName: input.accounts.tolsonCreditAccountName.trim() || creditId,
        amountCents: input.tolsonCents,
        description,
      },
    );
    jsonLines.push(
      lineJson({
        amountCents: input.tolsonCents,
        description,
        postingType: "Debit",
        accountId: debitId,
        accountName: input.accounts.tolsonDebitAccountName.trim() || debitId,
      }),
      lineJson({
        amountCents: input.tolsonCents,
        description,
        postingType: "Credit",
        accountId: creditId,
        accountName: input.accounts.tolsonCreditAccountName.trim() || creditId,
      }),
    );
  }

  const debits = lines.filter((line) => line.postingType === "Debit").reduce((sum, line) => sum + line.amountCents, 0);
  const credits = lines.filter((line) => line.postingType === "Credit").reduce((sum, line) => sum + line.amountCents, 0);
  if (debits !== credits) throw new Error("Journal entry does not balance");

  const body =
    `{"TxnDate":${JSON.stringify(input.weekStart)},` +
    `"PrivateNote":${JSON.stringify(`TRET.AI week starting ${input.weekStart}`)},` +
    `"Line":[${jsonLines.join(",")}]}`;
  return { body, lines };
}

export function emptyPostingAccounts(): PostingAccounts {
  return {
    feeDebitAccountId: "",
    feeDebitAccountName: "",
    feeCreditAccountId: "",
    feeCreditAccountName: "",
    tolsonDebitAccountId: "",
    tolsonDebitAccountName: "",
    tolsonCreditAccountId: "",
    tolsonCreditAccountName: "",
  };
}

export function postingAccountsComplete(accounts: PostingAccounts): boolean {
  return Object.values(accounts).every((value) => value.trim().length > 0);
}
