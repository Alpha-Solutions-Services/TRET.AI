import { assertIsoDate } from "@/lib/fee-engine";
import { qboAmountToSignedCents } from "@/lib/quickbooks/amounts";

export type ExpenseEntity = "Purchase" | "Bill";

export type ExpenseDraft = {
  sourceId: string;
  entity: ExpenseEntity;
  txnDate: string;
  vendorId: string | null;
  vendorName: string;
  accountId: string | null;
  accountName: string;
  amountCents: number;
  note: string;
  skipReason: string | null;
};

export type QboAccount = {
  id: string;
  name: string;
  accountType: string;
};

type Ref = { value?: unknown; name?: unknown; type?: unknown };

type Line = {
  Id?: unknown;
  Amount?: unknown;
  Description?: unknown;
  DetailType?: unknown;
  AccountBasedExpenseLineDetail?: { AccountRef?: Ref };
  ItemBasedExpenseLineDetail?: { ItemRef?: Ref };
};

type Txn = {
  Id?: unknown;
  TxnDate?: unknown;
  TotalAmt?: unknown;
  DocNumber?: unknown;
  PrivateNote?: unknown;
  EntityRef?: Ref;
  VendorRef?: Ref;
  AccountRef?: Ref;
  Line?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function refId(ref: Ref | undefined): string | null {
  const value = text(ref?.value);
  return value || null;
}

function refName(ref: Ref | undefined): string {
  return text(ref?.name);
}

function txnDate(value: unknown): string | null {
  const raw = text(value).slice(0, 10);
  try {
    assertIsoDate(raw, "Date");
    return raw;
  } catch {
    return null;
  }
}

function safeToken(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return cleaned || "x";
}

function noteFor(input: {
  entity: ExpenseEntity;
  docNumber: string;
  txnId: string;
  vendorName: string;
  accountName: string;
  description: string;
}): string {
  const parts = [
    input.docNumber ? `${input.entity} ${input.docNumber}` : `${input.entity} ${input.txnId}`,
    input.vendorName,
    input.accountName,
    input.description,
  ].filter(Boolean);
  return parts.join(". ").slice(0, 500);
}

function lineDrafts(entity: ExpenseEntity, txn: Txn): ExpenseDraft[] {
  const txnId = text(txn.Id);
  const date = txnDate(txn.TxnDate);
  const vendorRef = entity === "Bill" ? txn.VendorRef : txn.EntityRef;
  const vendorId = refId(vendorRef);
  const vendorName = refName(vendorRef) || "No vendor";
  const docNumber = text(txn.DocNumber);
  const lines = asArray(txn.Line).filter((line): line is Line => !!line && typeof line === "object");
  const usable = lines.filter((line) => {
    const detail = text(line.DetailType);
    return detail === "AccountBasedExpenseLineDetail" || detail === "ItemBasedExpenseLineDetail";
  });

  const drafts: ExpenseDraft[] = [];
  const sourceLines = usable.length > 0 ? usable : [null];
  sourceLines.forEach((line, index) => {
    const lineId = line ? text(line.Id) || String(index + 1) : "total";
    let accountId: string | null = null;
    let accountName = "";
    let amountSource: unknown = txn.TotalAmt;
    let description = text(txn.PrivateNote);
    if (line) {
      amountSource = line.Amount;
      description = text(line.Description) || description;
      if (text(line.DetailType) === "AccountBasedExpenseLineDetail") {
        accountId = refId(line.AccountBasedExpenseLineDetail?.AccountRef);
        accountName = refName(line.AccountBasedExpenseLineDetail?.AccountRef);
      } else {
        accountName = refName(line.ItemBasedExpenseLineDetail?.ItemRef);
      }
    } else {
      accountId = refId(txn.AccountRef);
      accountName = refName(txn.AccountRef);
    }
    let amountCents = 0;
    let skipReason: string | null = null;
    if (!txnId) skipReason = "QuickBooks did not send an id";
    else if (!date) skipReason = "Date is missing";
    else {
      try {
        amountCents = qboAmountToSignedCents(amountSource);
        if (amountCents < 0) skipReason = "Credit amounts are not imported";
        else if (amountCents === 0) skipReason = "Amount is zero";
      } catch {
        skipReason = "Amount could not be read";
      }
    }
    drafts.push({
      sourceId: `${entity}:${safeToken(txnId || "missing")}:${safeToken(lineId)}`,
      entity,
      txnDate: date ?? "",
      vendorId,
      vendorName,
      accountId,
      accountName: accountName || "No account",
      amountCents: amountCents < 0 ? 0 : amountCents,
      note: noteFor({
        entity,
        docNumber,
        txnId: txnId || "missing",
        vendorName,
        accountName: accountName || "No account",
        description,
      }),
      skipReason,
    });
  });
  return drafts;
}

export function parseExpenseEntities(entity: ExpenseEntity, rows: unknown[]): ExpenseDraft[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    return lineDrafts(entity, row as Txn);
  });
}

export function parseQueryEntities(body: unknown, key: "Purchase" | "Bill" | "Account"): unknown[] {
  if (!body || typeof body !== "object") return [];
  const record = body as { QueryResponse?: Record<string, unknown>; Fault?: unknown };
  if (record.Fault) return [];
  const query = record.QueryResponse;
  if (!query || typeof query !== "object") return [];
  return asArray(query[key]);
}

export function parseAccounts(rows: unknown[]): QboAccount[] {
  const accounts: QboAccount[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const account = row as { Id?: unknown; Name?: unknown; AccountType?: unknown; Active?: unknown };
    if (account.Active === false) continue;
    const id = text(account.Id);
    const name = text(account.Name);
    if (!id || !name) continue;
    accounts.push({
      id,
      name,
      accountType: text(account.AccountType) || "Account",
    });
  }
  accounts.sort((a, b) => a.name.localeCompare(b.name));
  return accounts;
}

export function faultMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const fault = (body as { Fault?: { Error?: unknown } }).Fault;
  if (!fault) return null;
  const errors = asArray(fault.Error);
  const first = errors[0];
  if (!first || typeof first !== "object") return "QuickBooks returned an error";
  const message = text((first as { Message?: unknown }).Message);
  const detail = text((first as { Detail?: unknown }).Detail);
  const combined = [message, detail].filter(Boolean).join(". ");
  return (combined || "QuickBooks returned an error").slice(0, 240);
}
