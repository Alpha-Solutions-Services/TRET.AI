import { createSign } from "node:crypto";
import { loadMatchKey } from "@/lib/loads/load-id";
import { centsToDollarString } from "@/lib/money/cents";
import { milesLabel } from "@/lib/sheets/align";
import { columnIndex, findHeaderRow } from "@/lib/sheets/cell";
import { loadLedgerCandidates } from "@/lib/sheets/ins-outs";
import { resolveServiceAccount, serviceAccountSigningKey } from "@/lib/sheets/private-key";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const WRITE_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly";

export type SheetWriteField =
  | "rate"
  | "delivery_date"
  | "pickup_date"
  | "loaded_miles"
  | "deadhead"
  | "driver";

const FIELD_HEADERS: Record<SheetWriteField, readonly string[]> = {
  rate: ["rate", "gross"],
  delivery_date: ["delivery date", "order date delivered"],
  pickup_date: ["pick up date", "pickup date", "origin datetime"],
  loaded_miles: ["loaded miles"],
  deadhead: ["deadhead miles", "empty miles"],
  driver: ["driver", "drivers"],
};

const LOAD_HEADERS = ["load id", "order id", "order friendly id"] as const;

export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function locateLedgerCell(
  grid: string[][],
  loadId: string,
  field: SheetWriteField,
): { row: number; column: number; a1: string } | null {
  const headerIndex = findHeaderRow(grid, [LOAD_HEADERS, FIELD_HEADERS[field]]);
  if (headerIndex < 0) return null;
  const header = grid[headerIndex] ?? [];
  const idCol = columnIndex(header, LOAD_HEADERS);
  const fieldCol = columnIndex(header, FIELD_HEADERS[field]);
  if (idCol < 0 || fieldCol < 0) return null;
  const wanted = loadMatchKey(loadId);
  if (!wanted) return null;
  for (let row = headerIndex + 1; row < grid.length; row++) {
    if (loadMatchKey(grid[row]?.[idCol] ?? "") !== wanted) continue;
    return { row, column: fieldCol, a1: `${columnLetter(fieldCol)}${row + 1}` };
  }
  return null;
}

export function sheetCellValue(field: SheetWriteField, value: string): string {
  if (field === "rate") {
    const cents = Number(value);
    if (!Number.isInteger(cents)) return value;
    return centsToDollarString(Math.abs(cents));
  }
  if (field === "loaded_miles" || field === "deadhead") {
    if (value === "") return "";
    const hundredths = Number(value);
    if (!Number.isInteger(hundredths)) return value;
    return milesLabel(hundredths);
  }
  return value;
}

export function pickLedgerTitle(titles: string[], unitNumber: string): string | null {
  const wanted = new Set(titles);
  return loadLedgerCandidates(unitNumber).find((title) => wanted.has(title)) ?? null;
}

export function quoteSheetRange(title: string, a1: string): string {
  return `'${title.replace(/'/g, "''")}'!${a1}`;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export async function editorAccessToken(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const account = resolveServiceAccount(env);
  if (!account) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: account.email,
      scope: WRITE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  const assertion = `${header}.${claim}.${signer.sign(serviceAccountSigningKey(account.privateKey)).toString("base64url")}`;
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string };
  return body.access_token ?? null;
}

export async function spreadsheetCanEdit(
  spreadsheetId: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}`);
  url.searchParams.set("fields", "capabilities(canEdit)");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const body = (await response.json()) as { capabilities?: { canEdit?: boolean } };
  return body.capabilities?.canEdit === true;
}

async function listTitles(spreadsheetId: string, token: string, fetchImpl: typeof fetch): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return [];
  const body = (await response.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  return (body.sheets ?? []).map((sheet) => sheet.properties?.title ?? "").filter(Boolean);
}

async function readGrid(
  spreadsheetId: string,
  title: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<string[][]> {
  const range = quoteSheetRange(title, "A1:AZ");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return [];
  const body = (await response.json()) as { values?: string[][] };
  return body.values ?? [];
}

export async function writeOneSheetCell(input: {
  spreadsheetId: string;
  unitNumber: string;
  loadId: string;
  field: SheetWriteField;
  value: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; a1: string } | { ok: false; error: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const env = input.env ?? process.env;
  const token = await editorAccessToken(env, fetchImpl);
  if (!token) return { ok: false, error: "The Google service account is not set, so this cell cannot be written." };
  const canEdit = await spreadsheetCanEdit(input.spreadsheetId, token, fetchImpl);
  if (!canEdit) return { ok: false, error: "The Google account cannot edit this sheet." };
  const titles = await listTitles(input.spreadsheetId, token, fetchImpl);
  const title = pickLedgerTitle(titles, input.unitNumber);
  if (!title) return { ok: false, error: "Load Ledger tab was not found." };
  const grid = await readGrid(input.spreadsheetId, title, token, fetchImpl);
  const cell = locateLedgerCell(grid, input.loadId, input.field);
  if (!cell) return { ok: false, error: "That load cell was not found on the sheet." };
  const range = quoteSheetRange(title, cell.a1);
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  const response = await fetchImpl(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values: [[sheetCellValue(input.field, input.value)]] }),
  });
  if (!response.ok) return { ok: false, error: "Google did not save that cell." };
  return { ok: true, a1: cell.a1 };
}
