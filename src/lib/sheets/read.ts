import { createSign } from "node:crypto";
import { parseCsv } from "@/lib/fuel-tolls/csv";
import { readEnv } from "@/lib/env";
import {
  buildTruckWeekInsOuts,
  loadLedgerCandidates,
  pickLoadLedgerTitle,
  pickMgmtExpensesTitle,
  type SheetGrid,
  type TruckWeekInsOuts,
} from "@/lib/sheets/ins-outs";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const SHEET_UNREADABLE =
  "This Google Sheet is not readable. On Trucks, confirm the link. Then either share the sheet so anyone with the link can view, or share it with the Google service account and set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.";

type FetchLike = typeof fetch;

type TruckSheetInput = {
  unitNumber: string;
  truckName: string;
  googleSheetUrl: string | null;
};

function spreadsheetIdFromUrl(url: string): string | null {
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url.trim());
  return match?.[1] ?? null;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function serviceAccountConfig(env: Record<string, string | undefined>): {
  email: string;
  privateKey: string;
} | null {
  const email = readEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", env);
  const privateKey = readEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", env).replace(/\\n/g, "\n");
  if (!email || !privateKey) return null;
  return { email, privateKey };
}

async function serviceAccountToken(
  email: string,
  privateKey: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  const assertion = `${header}.${claim}.${signer.sign(privateKey).toString("base64url")}`;
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error("Google service account sign-in failed. Check the service account env values.");
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("Google service account sign-in failed. Check the service account env values.");
  }
  return body.access_token;
}

function valuesToGrid(values: unknown): SheetGrid {
  if (!Array.isArray(values)) return [];
  return values.map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : [],
  );
}

async function readWithToken(
  spreadsheetId: string,
  unitNumber: string,
  accessToken: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<{ loadLedger: SheetGrid | null; mgmtExpenses: SheetGrid | null; note: string | null }> {
  const metaUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
  metaUrl.searchParams.set("fields", "sheets.properties.title");
  if (!accessToken && apiKey) metaUrl.searchParams.set("key", apiKey);
  const metaResponse = await fetchImpl(metaUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (metaResponse.status === 401 || metaResponse.status === 403 || metaResponse.status === 404) {
    return { loadLedger: null, mgmtExpenses: null, note: SHEET_UNREADABLE };
  }
  if (!metaResponse.ok) {
    return { loadLedger: null, mgmtExpenses: null, note: SHEET_UNREADABLE };
  }
  const meta = (await metaResponse.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const titles = (meta.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter((title) => title.trim() !== "");
  const ledgerTitle = pickLoadLedgerTitle(titles, unitNumber);
  const expenseTitle = pickMgmtExpensesTitle(titles);
  const wanted = [ledgerTitle, expenseTitle].filter((title): title is string => Boolean(title));
  if (wanted.length === 0) {
    return {
      loadLedger: null,
      mgmtExpenses: null,
      note: "The sheet has no Load Ledger tab and no Mgmt Expenses tab.",
    };
  }
  const batchUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet`,
  );
  for (const title of wanted) {
    batchUrl.searchParams.append("ranges", `'${title.replace(/'/g, "''")}'`);
  }
  batchUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  if (!accessToken && apiKey) batchUrl.searchParams.set("key", apiKey);
  const batchResponse = await fetchImpl(batchUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!batchResponse.ok) {
    return { loadLedger: null, mgmtExpenses: null, note: SHEET_UNREADABLE };
  }
  const batch = (await batchResponse.json()) as {
    valueRanges?: Array<{ values?: unknown }>;
  };
  const grids = new Map<string, SheetGrid>();
  wanted.forEach((title, index) => {
    grids.set(title, valuesToGrid(batch.valueRanges?.[index]?.values));
  });
  const notes: string[] = [];
  if (!ledgerTitle) notes.push("Load Ledger tab was not found.");
  if (!expenseTitle) notes.push("Mgmt Expenses tab was not found.");
  return {
    loadLedger: ledgerTitle ? (grids.get(ledgerTitle) ?? null) : null,
    mgmtExpenses: expenseTitle ? (grids.get(expenseTitle) ?? null) : null,
    note: notes.length ? notes.join(" ") : null,
  };
}

function looksPrivate(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 302) return true;
  const head = body.slice(0, 800).toLowerCase();
  return head.includes("accounts.google.com") || head.includes("servicelogin");
}

async function readPublicCsv(
  spreadsheetId: string,
  sheetName: string,
  fetchImpl: FetchLike,
): Promise<{ grid: SheetGrid | null; privateSheet: boolean }> {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`);
  url.searchParams.set("tqx", "out:csv");
  url.searchParams.set("sheet", sheetName);
  const response = await fetchImpl(url, { redirect: "manual" });
  const body = await response.text();
  if (looksPrivate(response.status, body)) return { grid: null, privateSheet: true };
  if (!response.ok) return { grid: null, privateSheet: false };
  if (!body.trim()) return { grid: null, privateSheet: false };
  return { grid: parseCsv(body), privateSheet: false };
}

async function readPublicTabs(
  spreadsheetId: string,
  unitNumber: string,
  fetchImpl: FetchLike,
): Promise<{ loadLedger: SheetGrid | null; mgmtExpenses: SheetGrid | null; note: string | null }> {
  let loadLedger: SheetGrid | null = null;
  for (const title of loadLedgerCandidates(unitNumber)) {
    const result = await readPublicCsv(spreadsheetId, title, fetchImpl);
    if (result.privateSheet) {
      return { loadLedger: null, mgmtExpenses: null, note: SHEET_UNREADABLE };
    }
    if (result.grid && result.grid.some((row) => row.some((cell) => /delivery date/i.test(cell)))) {
      loadLedger = result.grid;
      break;
    }
  }
  const expenses = await readPublicCsv(spreadsheetId, "Mgmt Expenses", fetchImpl);
  if (expenses.privateSheet) {
    return { loadLedger: null, mgmtExpenses: null, note: SHEET_UNREADABLE };
  }
  const mgmtExpenses =
    expenses.grid && expenses.grid.some((row) => row.some((cell) => cell.trim().toLowerCase() === "category"))
      ? expenses.grid
      : null;
  if (!loadLedger && !mgmtExpenses) {
    return {
      loadLedger: null,
      mgmtExpenses: null,
      note: "The sheet has no Load Ledger tab and no Mgmt Expenses tab.",
    };
  }
  const notes: string[] = [];
  if (!loadLedger) notes.push("Load Ledger tab was not found.");
  if (!mgmtExpenses) notes.push("Mgmt Expenses tab was not found.");
  return { loadLedger, mgmtExpenses, note: notes.length ? notes.join(" ") : null };
}

export async function loadTruckWeekInsOuts(
  trucks: TruckSheetInput[],
  weekStart: string,
  weekEnd: string,
  opts?: {
    fetchImpl?: FetchLike;
    env?: Record<string, string | undefined>;
  },
): Promise<TruckWeekInsOuts[]> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const env = opts?.env ?? process.env;
  const account = serviceAccountConfig(env);
  const apiKey = readEnv("GOOGLE_SHEETS_API_KEY", env);
  let accessToken = "";
  let authNote: string | null = null;
  if (account) {
    try {
      accessToken = await serviceAccountToken(account.email, account.privateKey, fetchImpl);
    } catch (err) {
      authNote = err instanceof Error ? err.message : "Google service account sign-in failed.";
    }
  }

  return Promise.all(
    trucks.map(async (truck) => {
      if (!truck.googleSheetUrl) {
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          weekStart,
          weekEnd,
          loadLedger: null,
          mgmtExpenses: null,
          note: "No Google Sheet link. Paste it on Trucks.",
        });
      }
      const spreadsheetId = spreadsheetIdFromUrl(truck.googleSheetUrl);
      if (!spreadsheetId) {
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          weekStart,
          weekEnd,
          loadLedger: null,
          mgmtExpenses: null,
          note: "Google Sheet link must be a docs.google.com spreadsheet URL.",
        });
      }
      if (authNote) {
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          weekStart,
          weekEnd,
          loadLedger: null,
          mgmtExpenses: null,
          note: authNote,
        });
      }
      try {
        const tabs =
          accessToken || apiKey
            ? await readWithToken(spreadsheetId, truck.unitNumber, accessToken, apiKey, fetchImpl)
            : await readPublicTabs(spreadsheetId, truck.unitNumber, fetchImpl);
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          weekStart,
          weekEnd,
          loadLedger: tabs.loadLedger,
          mgmtExpenses: tabs.mgmtExpenses,
          note: tabs.note,
        });
      } catch {
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          weekStart,
          weekEnd,
          loadLedger: null,
          mgmtExpenses: null,
          note: SHEET_UNREADABLE,
        });
      }
    }),
  );
}
