import { faultMessage, parseAccounts, parseQueryEntities, type QboAccount } from "@/lib/quickbooks/parse";
import { QBO_MAX_PAGES, QBO_PAGE_SIZE, entityQuery, journalUrl, queryUrl } from "@/lib/quickbooks/query";

export type QboCaller = {
  environment: "sandbox" | "production";
  realmId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
};

async function qboFetch(
  caller: QboCaller,
  url: string,
  init: { method: "GET" | "POST"; body?: string },
): Promise<unknown> {
  const response = await (caller.fetchImpl ?? fetch)(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${caller.accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as unknown;
  if (response.status === 401) {
    throw new Error("QuickBooks needs to be connected again");
  }
  const fault = faultMessage(json);
  if (!response.ok || fault) {
    throw new Error(fault || `QuickBooks returned ${response.status}`);
  }
  return json;
}

export async function fetchAllEntities(
  caller: QboCaller,
  entity: "Purchase" | "Bill" | "Account",
  range?: { from: string; to: string },
): Promise<{ rows: unknown[]; truncated: boolean }> {
  const rows: unknown[] = [];
  let truncated = false;
  for (let page = 0; page < QBO_MAX_PAGES; page += 1) {
    const startPosition = page * QBO_PAGE_SIZE + 1;
    const sql = entityQuery(entity, {
      from: range?.from,
      to: range?.to,
      startPosition,
    });
    const body = await qboFetch(caller, queryUrl({ ...caller, sql }), { method: "GET" });
    const key = entity;
    const pageRows = parseQueryEntities(body, key);
    rows.push(...pageRows);
    if (pageRows.length < QBO_PAGE_SIZE) return { rows, truncated };
    if (page === QBO_MAX_PAGES - 1) truncated = true;
  }
  return { rows, truncated };
}

export async function fetchAccounts(caller: QboCaller): Promise<{ accounts: QboAccount[]; truncated: boolean }> {
  const result = await fetchAllEntities(caller, "Account");
  return { accounts: parseAccounts(result.rows), truncated: result.truncated };
}

export async function postJournal(caller: QboCaller, body: string): Promise<string> {
  const json = await qboFetch(caller, journalUrl(caller), { method: "POST", body });
  const entry = (json as { JournalEntry?: { Id?: unknown } }).JournalEntry;
  const id = typeof entry?.Id === "string" ? entry.Id.trim() : "";
  if (!id) throw new Error("QuickBooks did not return an id");
  return id;
}
