import { createSign } from "node:crypto";
import { parseCsv } from "@/lib/fuel-tolls/csv";
import { readEnv } from "@/lib/env";
import type { TruckClass } from "@/lib/fee-engine";
import {
  buildTruckWeekInsOuts,
  loadLedgerCandidates,
  pickLoadLedgerTitle,
  pickMgmtExpensesTitle,
  type SheetGrid,
  type TruckWeekInsOuts,
} from "@/lib/sheets/ins-outs";
import { weeklyExpensesCandidates } from "@/lib/sheets/weekly-expenses";
import {
  authFailureFromError,
  missingGoogleServiceAccountEnv,
  resolveServiceAccount,
  serviceAccountSigningKey,
  SHEET_ENV_EMAIL,
  SHEET_ENV_JSON,
  SHEET_ENV_KEY,
} from "@/lib/sheets/private-key";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export { missingGoogleServiceAccountEnv, SHEET_ENV_EMAIL, SHEET_ENV_JSON, SHEET_ENV_KEY };

export function privateSheetNote(env: Record<string, string | undefined>): string {
  const missing = missingGoogleServiceAccountEnv(env);
  if (missing.length === 0) {
    return "This Google Sheet is not readable. The service account was rejected. Share the sheet with that account as a viewer.";
  }
  const verb = missing.length === 1 ? "is" : "are";
  return `This Google Sheet is not readable. ${missing.join(" and ")} ${verb} not set. Share the sheet with the service account after those variables are set, or share it so anyone with the link can view.`;
}

type FetchLike = typeof fetch;

type TruckSheetInput = {
  unitNumber: string;
  truckName: string;
  googleSheetUrl: string | null;
  truckClass?: TruckClass;
};

function spreadsheetIdFromUrl(url: string): string | null {
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url.trim());
  return match?.[1] ?? null;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
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
  const signingKey = serviceAccountSigningKey(privateKey);
  const assertion = `${header}.${claim}.${signer.sign(signingKey).toString("base64url")}`;
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

function sheetRange(title: string): string {
  const escaped = title.replace(/'/g, "''");
  return `'${escaped}'!A1:AZ`;
}

async function googleErrorNote(response: Response, fallback: string): Promise<string> {
  let detail = "";
  try {
    const body = (await response.clone().json()) as { error?: { message?: string } };
    detail = body.error?.message ?? "";
  } catch {
    detail = "";
  }
  const clean = detail.replace(/\s+/g, " ").slice(0, 180);
  if (response.status === 401 || response.status === 403) {
    const share = "Share the sheet with the service account as a viewer.";
    return clean
      ? `This Google Sheet is not readable (HTTP ${response.status}: ${clean}). ${share}`
      : `This Google Sheet is not readable (HTTP ${response.status}). ${share}`;
  }
  if (response.status === 404) {
    return "This Google Sheet was not found. Check the link on Trucks.";
  }
  return clean
    ? `${fallback} (HTTP ${response.status}: ${clean}).`
    : `${fallback} (HTTP ${response.status}).`;
}

function valuesToGrid(values: unknown): SheetGrid {
  if (!Array.isArray(values)) return [];
  return values.map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : [],
  );
}

type TabGrids = {
  loadLedger: SheetGrid | null;
  mgmtExpenses: SheetGrid | null;
  weeklyExpenses: SheetGrid | null;
  fuelLog?: SheetGrid | null;
  note: string | null;
};

async function readWithToken(
  spreadsheetId: string,
  unitNumber: string,
  accessToken: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<TabGrids> {
  const metaUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
  metaUrl.searchParams.set("fields", "sheets.properties.title");
  if (!accessToken && apiKey) metaUrl.searchParams.set("key", apiKey);
  const metaResponse = await fetchImpl(metaUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!metaResponse.ok) {
    return {
      loadLedger: null,
      mgmtExpenses: null,
      weeklyExpenses: null,
      note: await googleErrorNote(metaResponse, "This Google Sheet is not readable"),
    };
  }
  const meta = (await metaResponse.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const titles = (meta.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter((title) => title.trim() !== "");
  const ledgerTitle = pickLoadLedgerTitle(titles, unitNumber);
  const expenseTitle = pickMgmtExpensesTitle(titles);
  const weeklyTitle = pickTitled(titles, /weekly expenses/i, unitNumber);
  const fuelTitle = pickTitled(titles, /fuel log/i, unitNumber);
  const wanted = [ledgerTitle, expenseTitle, weeklyTitle, fuelTitle].filter((title): title is string => Boolean(title));
  if (wanted.length === 0) {
    return {
      loadLedger: null,
      mgmtExpenses: null,
      weeklyExpenses: null,
      note: "The sheet has no Load Ledger tab and no Mgmt Expenses tab.",
    };
  }
  const batchUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet`,
  );
  for (const title of wanted) {
    batchUrl.searchParams.append("ranges", sheetRange(title));
  }
  batchUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  batchUrl.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  if (!accessToken && apiKey) batchUrl.searchParams.set("key", apiKey);
  const batchResponse = await fetchImpl(batchUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!batchResponse.ok) {
    return {
      loadLedger: null,
      mgmtExpenses: null,
      weeklyExpenses: null,
      note: await googleErrorNote(batchResponse, "This Google Sheet is not readable"),
    };
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
    weeklyExpenses: weeklyTitle ? (grids.get(weeklyTitle) ?? null) : null,
    fuelLog: fuelTitle ? (grids.get(fuelTitle) ?? null) : null,
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
  env: Record<string, string | undefined>,
): Promise<TabGrids> {
  let loadLedger: SheetGrid | null = null;
  for (const title of loadLedgerCandidates(unitNumber)) {
    const result = await readPublicCsv(spreadsheetId, title, fetchImpl);
    if (result.privateSheet) {
      return { loadLedger: null, mgmtExpenses: null, weeklyExpenses: null, note: privateSheetNote(env) };
    }
    if (result.grid && result.grid.some((row) => row.some((cell) => /delivery date/i.test(cell)))) {
      loadLedger = result.grid;
      break;
    }
  }
  const expenses = await readPublicCsv(spreadsheetId, "Mgmt Expenses", fetchImpl);
  if (expenses.privateSheet) {
    return { loadLedger: null, mgmtExpenses: null, weeklyExpenses: null, note: privateSheetNote(env) };
  }
  const mgmtExpenses =
    expenses.grid && expenses.grid.some((row) => row.some((cell) => cell.trim().toLowerCase() === "category"))
      ? expenses.grid
      : null;
  let weeklyExpenses: SheetGrid | null = null;
  for (const title of weeklyExpensesCandidates(unitNumber)) {
    const result = await readPublicCsv(spreadsheetId, title, fetchImpl);
    if (result.privateSheet) break;
    if (result.grid && result.grid.some((row) => row.some((cell) => /driver compensation/i.test(cell)))) {
      weeklyExpenses = result.grid;
      break;
    }
  }
  if (!loadLedger && !mgmtExpenses && !weeklyExpenses) {
    return {
      loadLedger: null,
      mgmtExpenses: null,
      weeklyExpenses: null,
      note: "The sheet has no Load Ledger tab and no Mgmt Expenses tab.",
    };
  }
  const notes: string[] = [];
  if (!loadLedger) notes.push("Load Ledger tab was not found.");
  if (!mgmtExpenses) notes.push("Mgmt Expenses tab was not found.");
  return { loadLedger, mgmtExpenses, weeklyExpenses, note: notes.length ? notes.join(" ") : null };
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
  const apiKey = readEnv("GOOGLE_SHEETS_API_KEY", env);
  let accessToken = "";
  let authFailure: { note: string; noteDetail: string } | null = null;
  try {
    const account = resolveServiceAccount(env);
    if (account) {
      accessToken = await serviceAccountToken(account.email, account.privateKey, fetchImpl);
    }
  } catch (err) {
    authFailure = authFailureFromError(err);
  }

  return Promise.all(
    trucks.map(async (truck) => {
      if (!truck.googleSheetUrl) {
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          truckClass: truck.truckClass,
          weekStart,
          weekEnd,
          loadLedger: null,
          mgmtExpenses: null,
          weeklyExpenses: null,
          note: "No Google Sheet link. Paste it on Trucks.",
        });
      }
      const spreadsheetId = spreadsheetIdFromUrl(truck.googleSheetUrl);
      if (!spreadsheetId) {
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          truckClass: truck.truckClass,
          weekStart,
          weekEnd,
          loadLedger: null,
          mgmtExpenses: null,
          weeklyExpenses: null,
          note: "Google Sheet link must be a docs.google.com spreadsheet URL.",
        });
      }
      if (authFailure) {
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          truckClass: truck.truckClass,
          weekStart,
          weekEnd,
          loadLedger: null,
          mgmtExpenses: null,
          weeklyExpenses: null,
          note: authFailure.note,
          noteDetail: authFailure.noteDetail,
        });
      }
      try {
        const tabs =
          accessToken || apiKey
            ? await readWithToken(spreadsheetId, truck.unitNumber, accessToken, apiKey, fetchImpl)
            : await readPublicTabs(spreadsheetId, truck.unitNumber, fetchImpl, env);
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          truckClass: truck.truckClass,
          weekStart,
          weekEnd,
          loadLedger: tabs.loadLedger,
          mgmtExpenses: tabs.mgmtExpenses,
          weeklyExpenses: tabs.weeklyExpenses,
          fuelLog: tabs.fuelLog ?? null,
          note: tabs.note,
        });
      } catch (err) {
        const failure = authFailureFromError(err);
        const decoder = failure.note !== failure.noteDetail;
        return buildTruckWeekInsOuts({
          unitNumber: truck.unitNumber,
          truckName: truck.truckName,
          truckClass: truck.truckClass,
          weekStart,
          weekEnd,
          loadLedger: null,
          mgmtExpenses: null,
          weeklyExpenses: null,
          note: decoder
            ? failure.note
            : "This Google Sheet is not readable. The read failed before a tab could be opened.",
          noteDetail: failure.noteDetail,
        });
      }
    }),
  );
}

export type TruckWorkbook = {
  loadLedger: SheetGrid | null;
  mgmtExpenses: SheetGrid | null;
  weeklyExpenses: SheetGrid | null;
  fuelLog: SheetGrid | null;
  fleetDirectory: SheetGrid | null;
  note: string | null;
};

function pickTitled(titles: string[], pattern: RegExp, unitNumber: string | null): string | null {
  const matches = titles.filter((title) => pattern.test(title));
  if (matches.length === 0) return null;
  if (!unitNumber) return matches[0] ?? null;
  const digits = unitNumber.replace(/\D/g, "");
  const bare = digits.replace(/^0+/, "") || digits || unitNumber.trim();
  const padded = bare.padStart(2, "0");
  const bits = [`#${padded}`, `#${bare}`, ` ${padded} `, ` ${bare} `].map((bit) => bit.toLowerCase());
  return (
    matches.find((title) => {
      const lower = ` ${title.toLowerCase()} `;
      return bits.some((bit) => lower.includes(bit));
    }) ??
    matches[0] ??
    null
  );
}

async function readWorkbookWithToken(
  spreadsheetId: string,
  unitNumber: string,
  accessToken: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<TruckWorkbook> {
  const metaUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
  metaUrl.searchParams.set("fields", "sheets.properties.title");
  if (!accessToken && apiKey) metaUrl.searchParams.set("key", apiKey);
  const metaResponse = await fetchImpl(metaUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!metaResponse.ok) {
    return emptyWorkbook(await googleErrorNote(metaResponse, "This Google Sheet is not readable"));
  }
  const meta = (await metaResponse.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const titles = (meta.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter((title) => title.trim() !== "");
  const named = {
    loadLedger: pickLoadLedgerTitle(titles, unitNumber),
    mgmtExpenses: pickMgmtExpensesTitle(titles),
    weeklyExpenses: pickTitled(titles, /weekly expenses/i, unitNumber),
    fuelLog: pickTitled(titles, /fuel log/i, unitNumber),
    fleetDirectory: pickTitled(titles, /fleet directory/i, null),
  };
  const wanted = [...new Set(Object.values(named).filter((title): title is string => Boolean(title)))];
  if (wanted.length === 0) {
    return emptyWorkbook("The sheet has no Load Ledger tab and no Mgmt Expenses tab.");
  }
  const batchUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet`,
  );
  for (const title of wanted) batchUrl.searchParams.append("ranges", sheetRange(title));
  batchUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  batchUrl.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  if (!accessToken && apiKey) batchUrl.searchParams.set("key", apiKey);
  const batchResponse = await fetchImpl(batchUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!batchResponse.ok) {
    return emptyWorkbook(await googleErrorNote(batchResponse, "This Google Sheet is not readable"));
  }
  const batch = (await batchResponse.json()) as { valueRanges?: Array<{ values?: unknown }> };
  const grids = new Map<string, SheetGrid>();
  wanted.forEach((title, index) => {
    grids.set(title, valuesToGrid(batch.valueRanges?.[index]?.values));
  });
  const notes: string[] = [];
  if (!named.loadLedger) notes.push("Load Ledger tab was not found.");
  if (!named.mgmtExpenses) notes.push("Mgmt Expenses tab was not found.");
  return {
    loadLedger: named.loadLedger ? (grids.get(named.loadLedger) ?? null) : null,
    mgmtExpenses: named.mgmtExpenses ? (grids.get(named.mgmtExpenses) ?? null) : null,
    weeklyExpenses: named.weeklyExpenses ? (grids.get(named.weeklyExpenses) ?? null) : null,
    fuelLog: named.fuelLog ? (grids.get(named.fuelLog) ?? null) : null,
    fleetDirectory: named.fleetDirectory ? (grids.get(named.fleetDirectory) ?? null) : null,
    note: notes.length ? notes.join(" ") : null,
  };
}

function emptyWorkbook(note: string): TruckWorkbook {
  return {
    loadLedger: null,
    mgmtExpenses: null,
    weeklyExpenses: null,
    fuelLog: null,
    fleetDirectory: null,
    note,
  };
}

async function readPublicWorkbook(
  spreadsheetId: string,
  unitNumber: string,
  fetchImpl: FetchLike,
  env: Record<string, string | undefined>,
): Promise<TruckWorkbook> {
  const ledgerTitles = loadLedgerCandidates(unitNumber);
  let loadLedger: SheetGrid | null = null;
  for (const title of ledgerTitles) {
    const result = await readPublicCsv(spreadsheetId, title, fetchImpl);
    if (result.privateSheet) return emptyWorkbook(privateSheetNote(env));
    if (result.grid && result.grid.some((row) => row.some((cell) => /delivery date/i.test(cell)))) {
      loadLedger = result.grid;
      break;
    }
  }
  async function one(title: string, marker: RegExp): Promise<SheetGrid | null> {
    const result = await readPublicCsv(spreadsheetId, title, fetchImpl);
    if (result.privateSheet) return null;
    if (result.grid && result.grid.some((row) => row.some((cell) => marker.test(cell)))) return result.grid;
    return null;
  }
  const digits = unitNumber.replace(/\D/g, "");
  const padded = (digits.replace(/^0+/, "") || digits || unitNumber).padStart(2, "0");
  const mgmtExpenses = await one("Mgmt Expenses", /^category$/i);
  const weeklyExpenses = await one(`Truck #${padded} Weekly Expenses`, /driver compensation/i);
  const fuelLog = await one(`Truck #${padded} Fuel Log`, /^gallons$/i);
  const fleetDirectory = await one("Fleet Directory", /^vin$/i);
  if (!loadLedger && !mgmtExpenses) {
    return emptyWorkbook("The sheet has no Load Ledger tab and no Mgmt Expenses tab.");
  }
  const notes: string[] = [];
  if (!loadLedger) notes.push("Load Ledger tab was not found.");
  if (!mgmtExpenses) notes.push("Mgmt Expenses tab was not found.");
  return {
    loadLedger,
    mgmtExpenses,
    weeklyExpenses,
    fuelLog,
    fleetDirectory,
    note: notes.length ? notes.join(" ") : null,
  };
}

export async function loadTruckWorkbook(
  truck: { unitNumber: string; googleSheetUrl: string | null },
  opts?: { fetchImpl?: FetchLike; env?: Record<string, string | undefined> },
): Promise<TruckWorkbook> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const env = opts?.env ?? process.env;
  if (!truck.googleSheetUrl) return emptyWorkbook("No Google Sheet link. Paste it on Trucks.");
  const spreadsheetId = spreadsheetIdFromUrl(truck.googleSheetUrl);
  if (!spreadsheetId) return emptyWorkbook("Google Sheet link must be a docs.google.com spreadsheet URL.");
  const apiKey = readEnv("GOOGLE_SHEETS_API_KEY", env);
  let accessToken = "";
  try {
    const account = resolveServiceAccount(env);
    if (account) {
      accessToken = await serviceAccountToken(account.email, account.privateKey, fetchImpl);
    }
  } catch (err) {
    const failure = authFailureFromError(err);
    const note =
      failure.noteDetail && failure.noteDetail !== failure.note
        ? `${failure.note} ${failure.noteDetail}`
        : failure.note;
    return emptyWorkbook(note);
  }
  if (accessToken || apiKey) {
    return readWorkbookWithToken(spreadsheetId, truck.unitNumber, accessToken, apiKey, fetchImpl);
  }
  return readPublicWorkbook(spreadsheetId, truck.unitNumber, fetchImpl, env);
}
