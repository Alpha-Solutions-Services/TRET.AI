import { geminiConfigured, suggestAssignment, suggestColumnMap } from "@/lib/llm-gateway/gemini";
import { SEEDED_IDENTITIES, truckLabel, type TruckIdentity } from "./mappings";
import { markAiMapped, planImport } from "./plan";
import { applyColumnMap, parseGrid } from "./parse";
import type { ImportContext, ImportPreviewRow, PlanResult } from "./types";

export async function prepareImport(
  grid: string[][],
  context: ImportContext = {},
  identities: readonly TruckIdentity[] = SEEDED_IDENTITIES,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<PlanResult> {
  let working = grid;
  let aiMapped = false;
  const first = parseGrid(grid);
  if (first.kind === "unknown" && geminiConfigured(env)) {
    const headers = first.header.map((header) => header.trim()).filter(Boolean);
    const mapped = await suggestColumnMap(headers, env, fetchImpl);
    if (mapped) {
      working = applyColumnMap(grid, mapped.kind, mapped.columns);
      aiMapped = parseGrid(working).kind === mapped.kind;
    }
  }
  const planned = planImport(working, context, identities);
  let rows = aiMapped ? markAiMapped(planned.rows) : planned.rows;
  if (geminiConfigured(env)) rows = await addSuggestions(rows, context, identities, env, fetchImpl);
  return { ...planned, rows };
}

async function addSuggestions(
  rows: ImportPreviewRow[],
  context: ImportContext,
  identities: readonly TruckIdentity[],
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
): Promise<ImportPreviewRow[]> {
  const next = rows.slice();
  let calls = 0;
  for (let index = 0; index < next.length && calls < 8; index++) {
    const row = next[index]!;
    if (row.status !== "flagged" || row.aiSuggested) continue;
    const choices = choicesFor(row, context, identities);
    if (choices.length === 0) continue;
    calls += 1;
    const choice = await suggestAssignment(
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
    );
    if (!choice) continue;
    const label = row.kind === "fuel" && identities.some((item) => item.unitNumber === choice) ? truckLabel(choice) : choice;
    next[index] = {
      ...row,
      aiSuggested: true,
      aiSuggestion: label,
      reason: row.reason ? `${row.reason} AI suggested ${label}.` : `AI suggested ${label}.`,
    };
  }
  return next;
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
