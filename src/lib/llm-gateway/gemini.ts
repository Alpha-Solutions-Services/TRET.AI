/**
 * The only module that calls a language model.
 * Used for an unknown file layout and for suggestions on flagged rows.
 * A missing or rejected key skips the call. Nothing here writes a sheet.
 */

export const GEMINI_DEFAULT_MODEL = "gemini-flash-latest";

/** Two retries after a 503, then the caller stays on the rules. */
export const GEMINI_BUSY_BACKOFF_MS = [500, 1000] as const;

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}

export type GeminiJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; busy: boolean };

type Sleep = (ms: number) => Promise<void>;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function geminiJson(
  prompt: string,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  sleep?: Sleep,
): Promise<GeminiJsonResult> {
  const pause = sleep ?? defaultSleep;
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, busy: false };
  const model = env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const attempts = GEMINI_BUSY_BACKOFF_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });
    } catch {
      return { ok: false, busy: false };
    }
    if (response.status === 503) {
      const wait = GEMINI_BUSY_BACKOFF_MS[attempt];
      if (wait == null) return { ok: false, busy: true };
      await pause(wait);
      continue;
    }
    if (!response.ok) return { ok: false, busy: false };
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, busy: false };
    try {
      return { ok: true, value: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, busy: false };
    }
  }
  return { ok: false, busy: true };
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

export type ColumnMapResult = { map: ColumnMap | null; busy: boolean };

/** Headers only. Row values are not included. */
export async function suggestColumnMap(
  headers: string[],
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  sleep?: Sleep,
): Promise<ColumnMapResult> {
  if (!geminiConfigured(env)) return { map: null, busy: false };
  const prompt = [
    "Map these spreadsheet headers to fields. Return JSON only.",
    `Fuel fields: ${FUEL_FIELDS.join(", ")}.`,
    `Toll fields: ${TOLL_FIELDS.join(", ")}.`,
    "Use a header only if it appears in the list below. Do not invent headers.",
    `Headers: ${JSON.stringify(headers)}`,
    'Return {"kind":"fuel"|"toll"|"unknown","columns":{"field":"Header text"}}.',
  ].join("\n");
  const parsed = await geminiJson(prompt, env, fetchImpl, sleep);
  if (!parsed.ok) return { map: null, busy: parsed.busy };
  if (!parsed.value || typeof parsed.value !== "object") return { map: null, busy: false };
  const record = parsed.value as { kind?: unknown; columns?: unknown };
  if (record.kind !== "fuel" && record.kind !== "toll") return { map: null, busy: false };
  if (!record.columns || typeof record.columns !== "object") return { map: null, busy: false };
  const allowed = new Set(record.kind === "fuel" ? FUEL_FIELDS : TOLL_FIELDS);
  const known = new Set(headers.map((header) => header.trim()));
  const columns: Record<string, string> = {};
  for (const [field, header] of Object.entries(record.columns as Record<string, unknown>)) {
    if (!allowed.has(field as never)) continue;
    if (typeof header !== "string" || !known.has(header.trim())) continue;
    columns[field] = header.trim();
  }
  const required = record.kind === "fuel" ? ["tranDate", "unit", "item", "qty", "amt"] : ["transactionId", "amount"];
  if (required.some((field) => !columns[field])) return { map: null, busy: false };
  return { map: { kind: record.kind, columns }, busy: false };
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

export type AssignmentResult = { choice: string | null; busy: boolean };

/** One flagged row, plus the choices the rules already have. No other rows. */
export async function suggestAssignment(
  hint: AssignmentHint,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  sleep?: Sleep,
): Promise<AssignmentResult> {
  if (!geminiConfigured(env) || hint.choices.length === 0) return { choice: null, busy: false };
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
  const parsed = await geminiJson(prompt, env, fetchImpl, sleep);
  if (!parsed.ok) return { choice: null, busy: parsed.busy };
  if (!parsed.value || typeof parsed.value !== "object") return { choice: null, busy: false };
  const choice = (parsed.value as { choice?: unknown }).choice;
  if (typeof choice !== "string") return { choice: null, busy: false };
  const trimmed = choice.trim();
  return { choice: hint.choices.includes(trimmed) ? trimmed : null, busy: false };
}
