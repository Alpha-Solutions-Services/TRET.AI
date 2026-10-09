import { geminiConfigured, suggestAssignmentBatch, suggestColumnMap } from "@/lib/llm-gateway/gemini";
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
  return { ...planned, rows, aiNotice: aiBusy ? AI_BUSY_NOTE : null };
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
  const batch: { index: number; choices: string[] }[] = [];
  for (let index = 0; index < next.length; index += 1) {
    const row = next[index]!;
    if (row.status !== "flagged" || row.aiSuggested) continue;
    const choices = choicesFor(row, context, identities);
    if (choices.length === 0) continue;
    batch.push({ index, choices });
  }
  if (batch.length === 0) return { rows: next, busy: false };
  const suggested = await suggestAssignmentBatch(
    batch.map(({ index, choices }) => {
      const row = next[index]!;
      return {
        kind: row.kind,
        unit: row.unitNumber ?? "",
        card: row.payload?.kind === "fuel" ? row.payload.card : "",
        plate: "",
        tag: "",
        date: row.payload?.kind === "fuel" ? row.payload.isoDate : row.payload?.kind === "toll" ? row.payload.isoDate : "",
        location: row.payload?.kind === "fuel" ? row.payload.location : row.payload?.kind === "toll" ? row.payload.location : "",
        choices,
      };
    }),
    env,
    fetchImpl,
    sleep,
  );
  if (suggested.busy) return { rows: next, busy: true };
  suggested.choices.forEach((choice, batchIndex) => {
    const slot = batch[batchIndex];
    if (!slot || !choice) return;
    const row = next[slot.index]!;
    const label =
      row.kind === "fuel" && identities.some((item) => item.unitNumber === choice) ? truckLabel(choice) : choice;
    next[slot.index] = {
      ...row,
      aiSuggested: true,
      aiSuggestion: label,
      reason: row.reason ? `${row.reason} AI suggested ${label}.` : `AI suggested ${label}.`,
    };
  });
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
