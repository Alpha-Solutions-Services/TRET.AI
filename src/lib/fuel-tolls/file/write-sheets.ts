import { editorAccessToken, quoteSheetRange, spreadsheetCanEdit } from "@/lib/sheets/write-cell";

export function spreadsheetIdFromUrl(url: string | null | undefined): string | null {
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec((url ?? "").trim());
  return match?.[1] ?? null;
}

export async function batchWriteRanges(input: {
  spreadsheetId: string;
  data: { tab: string; a1: string; value: string }[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.data.length === 0) return { ok: true };
  const fetchImpl = input.fetchImpl ?? fetch;
  const env = input.env ?? process.env;
  const token = await editorAccessToken(env, fetchImpl);
  if (!token) return { ok: false, error: "The Google service account is not set, so these cells cannot be written." };
  const canEdit = await spreadsheetCanEdit(input.spreadsheetId, token, fetchImpl);
  if (!canEdit) return { ok: false, error: "The Google account cannot edit this sheet." };
  const unique = new Map<string, string>();
  for (const item of input.data) unique.set(quoteSheetRange(item.tab, item.a1), item.value);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values:batchUpdate`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [...unique.entries()].map(([range, value]) => ({
        range,
        majorDimension: "ROWS",
        values: [[value]],
      })),
    }),
  });
  if (!response.ok) return { ok: false, error: "Google did not save those cells." };
  return { ok: true };
}
