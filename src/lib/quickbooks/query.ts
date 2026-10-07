import { assertIsoDate } from "@/lib/fee-engine";

export const QBO_MINOR_VERSION = "75";
export const QBO_PAGE_SIZE = 1000;
export const QBO_MAX_PAGES = 20;

export function qboApiBase(environment: "sandbox" | "production"): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export function assertRealmId(realmId: string): string {
  const trimmed = realmId.trim();
  if (!/^\d{1,20}$/.test(trimmed)) throw new Error("QuickBooks company id is not valid");
  return trimmed;
}

export function assertDateRange(from: string, to: string): { from: string; to: string } {
  assertIsoDate(from, "Start date");
  assertIsoDate(to, "End date");
  if (from > to) throw new Error("The start date must be on or before the end date");
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000);
  if (days > 366) throw new Error("Choose a date range of one year or less");
  return { from, to };
}

export function entityQuery(
  entity: "Purchase" | "Bill" | "Account",
  input: { from?: string; to?: string; startPosition: number },
): string {
  const start = input.startPosition;
  if (!Number.isInteger(start) || start < 1) throw new Error("Page start is not valid");
  if (entity === "Account") {
    return `select Id, Name, AccountType, Active from Account where Active = true startposition ${start} maxresults ${QBO_PAGE_SIZE}`;
  }
  if (!input.from || !input.to) throw new Error("A date range is required");
  const range = assertDateRange(input.from, input.to);
  return `select * from ${entity} where TxnDate >= '${range.from}' and TxnDate <= '${range.to}' startposition ${start} maxresults ${QBO_PAGE_SIZE}`;
}

export function queryUrl(input: {
  environment: "sandbox" | "production";
  realmId: string;
  sql: string;
}): string {
  const realmId = assertRealmId(input.realmId);
  const url = new URL(`${qboApiBase(input.environment)}/v3/company/${realmId}/query`);
  url.searchParams.set("query", input.sql);
  url.searchParams.set("minorversion", QBO_MINOR_VERSION);
  return url.toString();
}

export function journalUrl(input: {
  environment: "sandbox" | "production";
  realmId: string;
}): string {
  const realmId = assertRealmId(input.realmId);
  const url = new URL(`${qboApiBase(input.environment)}/v3/company/${realmId}/journalentry`);
  url.searchParams.set("minorversion", QBO_MINOR_VERSION);
  return url.toString();
}
