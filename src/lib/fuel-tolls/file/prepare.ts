import { geminiConfigured, suggestAssignment, suggestColumnMap } from "@/lib/llm-gateway/gemini";
import { SEEDED_IDENTITIES, truckLabel, type TruckIdentity } from "./mappings";
import { AI_BUSY_NOTE } from "./messages";
import { markAiMapped, planImport } from "./plan";
import { applyColumnMap, parseGrid } from "./parse";
import type { ImportContext, ImportPreviewRow, PlanResult } from "./types";

type Sleep = (ms: number) => Promise<void>;

export async function prepareImport(
  grid: string[][],
  context: ImportContext = {},
  identities: readonly TruckIdentity[] = SEEDED_IDENTITIES,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  sleep?: Sleep,
): Promise<PlanResult> {
  let working = grid;
  let aiMapped = false;
  let aiBusy = false;
  const first = parseGrid(grid);
  if (first.kind === "unknown" && geminiConfigured(env)) {
    const headers = first.header.map((header) => header.trim()).filter(Boolean);
    const mapped = await suggestColumnMap(headers, env, fetchImpl, sleep);
    if (mapped.busy) aiBusy = true;
    else if (mapped.map) {
      working = applyColumnMap(grid, mapped.map.kind, mapped.map.columns);
      aiMapped = parseGrid(working).kind === mapped.map.kind;
    }
  }
  const planned = planImport(working, context, identities);
  let rows = aiMapped ? markAiMapped(planned.rows) : planned.rows;
  if (geminiConfigured(env) && !aiBusy) {
    const suggested = await addSuggestions(rows, context, identities, env, fetchImpl, sleep);
    rows = suggested.rows;
    aiBusy = suggested.busy;
  }
  if (aiBusy) rows = rows.map(withBusyNote);
  return { ...planned, rows, aiNotice: aiBusy ? AI_BUSY_NOTE : null };
}

function withBusyNote(row: ImportPreviewRow): ImportPreviewRow {
  if (row.status !== "flagged" && !row.queue) return row;
  if (row.reason?.includes(AI_BUSY_NOTE)) return row;
  const reason = row.reason ? `${row.reason} ${AI_BUSY_NOTE}.` : AI_BUSY_NOTE;
  const payload = row.payload ? { ...row.payload, reason } : row.payload;
  return { ...row, reason, payload };
}

async function addSuggestions(
  rows: ImportPreviewRow[],
  context: ImportContext,
  identities: readonly TruckIdentity[],
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  sleep?: Sleep,
): Promise<{ rows: ImportPreviewRow[]; busy: boolean }> {
  const next = rows.slice();
  let calls = 0;
  for (let index = 0; index < next.length && calls < 8; index++) {
    const row = next[index]!;
    if (row.status !== "flagged" || row.aiSuggested) continue;
    const choices = choicesFor(row, context, identities);
    if (choices.length === 0) continue;
    calls += 1;
    const suggested = await suggestAssignment(
      {
        kind: row.kind,
        unit: row.unitNumber ?? "",
        card: row.payload?.kind === "fuel" ? row.payload.card : "",
        plate: "",
        tag: "",
        date: row.payload?.kind === "fuel" ? row.payload.isoDate : row.payload?.kind === "toll" ? row.payload.isoDate : "",
        location: row.payload?.kind === "fuel" ? row.payload.location : row.payload?.kind === "toll" ? row.payload.location : "",
        choices,
      },
      env,
      fetchImpl,
      sleep,
    );
    if (suggested.busy) return { rows: next, busy: true };
    if (!suggested.choice) continue;
    const label =
      row.kind === "fuel" && identities.some((item) => item.unitNumber === suggested.choice)
        ? truckLabel(suggested.choice)
        : suggested.choice;
    next[index] = {
      ...row,
      aiSuggested: true,
      aiSuggestion: label,
      reason: row.reason ? `${row.reason} AI suggested ${label}.` : `AI suggested ${label}.`,
    };
  }
  return { rows: next, busy: false };
}

function choicesFor(
  row: ImportPreviewRow,
  context: ImportContext,
  identities: readonly TruckIdentity[],
): string[] {
  if (!row.unitNumber) return identities.map((item) => item.unitNumber);
  const loads = context.ledgers?.find((ledger) => ledger.unitNumber === row.unitNumber)?.loads ?? [];
  return [...new Set(loads.flatMap((load) => [load.loadId, load.tripId].filter(Boolean)))];
}
