/**
 * The only module that calls a language model.
 * Used for an unknown file layout and for suggestions on flagged rows.
 * A missing GEMINI_API_KEY skips the call. Nothing here writes a sheet.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";

export function geminiConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}

export async function geminiJson(
  prompt: string,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

const FUEL_FIELDS = ["card", "tranDate", "invoice", "unit", "city", "state", "item", "qty", "amt"] as const;
const TOLL_FIELDS = [
  "transactionId",
  "plate",
  "plateState",
  "tag",
  "unit",
  "entryDate",
  "entryTime",
  "entryPlaza",
  "entryPlazaName",
  "exitDate",
  "exitTime",
  "exitPlazaName",
  "amount",
] as const;

export type ColumnMap = { kind: "fuel" | "toll"; columns: Record<string, string> };

/** Headers only. Row values are not included. */
export async function suggestColumnMap(
  headers: string[],
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<ColumnMap | null> {
  if (!geminiConfigured(env)) return null;
  const prompt = [
    "Map these spreadsheet headers to fields. Return JSON only.",
    `Fuel fields: ${FUEL_FIELDS.join(", ")}.`,
    `Toll fields: ${TOLL_FIELDS.join(", ")}.`,
    "Use a header only if it appears in the list below. Do not invent headers.",
    `Headers: ${JSON.stringify(headers)}`,
    'Return {"kind":"fuel"|"toll"|"unknown","columns":{"field":"Header text"}}.',
  ].join("\n");
  const parsed = await geminiJson(prompt, env, fetchImpl);
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { kind?: unknown; columns?: unknown };
  if (record.kind !== "fuel" && record.kind !== "toll") return null;
  if (!record.columns || typeof record.columns !== "object") return null;
  const allowed = new Set(record.kind === "fuel" ? FUEL_FIELDS : TOLL_FIELDS);
  const known = new Set(headers.map((header) => header.trim()));
  const columns: Record<string, string> = {};
  for (const [field, header] of Object.entries(record.columns as Record<string, unknown>)) {
    if (!allowed.has(field as never)) continue;
    if (typeof header !== "string" || !known.has(header.trim())) continue;
    columns[field] = header.trim();
  }
  const required = record.kind === "fuel" ? ["tranDate", "unit", "item", "qty", "amt"] : ["transactionId", "amount"];
  if (required.some((field) => !columns[field])) return null;
  return { kind: record.kind, columns };
}

export type AssignmentHint = {
  kind: "fuel" | "toll";
  unit: string;
  card: string;
  plate: string;
  tag: string;
  date: string;
  location: string;
  choices: string[];
};

/** One flagged row, plus the choices the rules already have. No other rows. */
export async function suggestAssignment(
  hint: AssignmentHint,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!geminiConfigured(env) || hint.choices.length === 0) return null;
  const prompt = [
    "Pick one choice for this single row. Return JSON only.",
    `Kind: ${hint.kind}`,
    `Unit: ${hint.unit}`,
    `Card: ${hint.card}`,
    `Plate: ${hint.plate}`,
    `Tag: ${hint.tag}`,
    `Date: ${hint.date}`,
    `Location: ${hint.location}`,
    `Choices: ${JSON.stringify(hint.choices)}`,
    'Return {"choice":"one of the choices"} or {"choice":""} if none fit.',
  ].join("\n");
  const parsed = await geminiJson(prompt, env, fetchImpl);
  if (!parsed || typeof parsed !== "object") return null;
  const choice = (parsed as { choice?: unknown }).choice;
  if (typeof choice !== "string") return null;
  const trimmed = choice.trim();
  return hint.choices.includes(trimmed) ? trimmed : null;
}
