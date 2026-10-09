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

const LOAD_FIELDS = [
  "load_id",
  "rate",
  "unit",
  "driver",
  "loaded_miles",
  "deadhead_miles",
  "pickup_date",
  "delivery_date",
  "broker",
  "status",
] as const;

export type LoadColumnMapResult = { map: Record<string, string> | null; busy: boolean };

/** Header names only. Used when a loads file is not the Vektor orders export. */
export async function suggestLoadColumnMap(
  headers: string[],
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  sleep?: Sleep,
): Promise<LoadColumnMapResult> {
  if (!geminiConfigured(env)) return { map: null, busy: false };
  const prompt = [
    "Map these spreadsheet headers to load fields. Return JSON only.",
    `Fields: ${LOAD_FIELDS.join(", ")}.`,
    "Use a header only if it appears in the list below. Do not invent headers.",
    `Headers: ${JSON.stringify(headers)}`,
    'Return {"columns":{"field":"Header text"}}.',
  ].join("\n");
  const parsed = await geminiJson(prompt, env, fetchImpl, sleep);
  if (!parsed.ok) return { map: null, busy: parsed.busy };
  if (!parsed.value || typeof parsed.value !== "object") return { map: null, busy: false };
  const columns = (parsed.value as { columns?: unknown }).columns;
  if (!columns || typeof columns !== "object") return { map: null, busy: false };
  const allowed = new Set<string>(LOAD_FIELDS);
  const known = new Set(headers.map((header) => header.trim()));
  const map: Record<string, string> = {};
  for (const [field, header] of Object.entries(columns as Record<string, unknown>)) {
    if (!allowed.has(field)) continue;
    if (typeof header !== "string" || !known.has(header.trim())) continue;
    map[field] = header.trim();
  }
  if (["load_id", "rate", "unit", "delivery_date"].some((field) => !map[field])) return { map: null, busy: false };
  return { map, busy: false };
}

export const AI_STATUS_OK = "OK";
export const AI_STATUS_BUSY = "Busy";
export const AI_STATUS_NOT_SET = "Not set";

export type AiStatus = typeof AI_STATUS_OK | typeof AI_STATUS_BUSY | typeof AI_STATUS_NOT_SET;

/** One tiny call. The key is never included in the result. */
export async function readAiStatus(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  sleep?: Sleep,
): Promise<AiStatus> {
  if (!geminiConfigured(env)) return AI_STATUS_NOT_SET;
  const parsed = await geminiJson('Return {"ok":true} as JSON.', env, fetchImpl, sleep);
  if (parsed.ok) return AI_STATUS_OK;
  if (parsed.busy) return AI_STATUS_BUSY;
  return AI_STATUS_NOT_SET;
}

export type AssignmentHint = {
  kind: "fuel" | "toll" | "load";
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

/** One call for every flagged row in a file. Rules still decide when this is busy. */
export async function suggestAssignmentBatch(
  hints: AssignmentHint[],
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  sleep?: Sleep,
): Promise<{ choices: Array<string | null>; busy: boolean }> {
  const usable = hints.map((hint) => (hint.choices.length > 0 ? hint : null));
  if (!geminiConfigured(env) || usable.every((hint) => hint == null)) {
    return { choices: hints.map(() => null), busy: false };
  }
  const prompt = [
    "Pick one choice for each row. Return JSON only.",
    "Use a choice only if it is in that row's list. Use an empty string when none fit.",
    `Rows: ${JSON.stringify(
      usable.map((hint, index) =>
        hint
          ? {
              index,
              kind: hint.kind,
              unit: hint.unit,
              card: hint.card,
              plate: hint.plate,
              tag: hint.tag,
              date: hint.date,
              location: hint.location,
              choices: hint.choices,
            }
          : { index, skip: true },
      ),
    )}`,
    'Return {"choices":["choice for row 0","choice for row 1"]}.',
  ].join("\n");
  const parsed = await geminiJson(prompt, env, fetchImpl, sleep);
  if (!parsed.ok) return { choices: hints.map(() => null), busy: parsed.busy };
  const list = (parsed.value as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(list)) return { choices: hints.map(() => null), busy: false };
  return {
    choices: hints.map((hint, index) => {
      const choice = list[index];
      if (typeof choice !== "string") return null;
      const trimmed = choice.trim();
      return hint.choices.includes(trimmed) ? trimmed : null;
    }),
    busy: false,
  };
}
