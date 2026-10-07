"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { milesToHundredths } from "@/lib/fuel-tolls/quantity";
import { fuelTollSettingsFromRows } from "@/lib/fuel-tolls/settings";
import { mapFuelCsv, mapTollCsv } from "@/lib/fuel-tolls/csv";
import { fetchFuelAndTollsLive } from "@/lib/fuel-tolls/live";
import { runFuelPipeline, runTollPipeline } from "@/lib/fuel-tolls/pipeline";
import type { DuplicateKey, FuelDraft, LoadSpan, TollDraft, WeekMiles } from "@/lib/fuel-tolls/types";
import type { Json } from "@/lib/supabase/database.types";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";
import { loadImportRegistry } from "@/lib/vektor/import-registry";
import { normalizeTimestamp } from "@/lib/vektor/dates";
import { NeedsSignInError } from "@/lib/vektor/oauth/needs-sign-in";

const MIGRATION =
  "Apply the v0.0.0.7 fuel and tolls migration before importing fuel or tolls.";

const SETTING_KEYS = [
  "fuel_ppg_min_tenth_cents",
  "fuel_ppg_max_tenth_cents",
  "fuel_tank_gallons_milli",
  "def_tank_gallons_milli",
  "mpg_min_milli",
  "mpg_max_milli",
  "fuel_row_count_drop_block_pct",
  "toll_row_count_drop_block_pct",
  "fuel_csv_column_mapping",
  "toll_csv_column_mapping",
];

export type FuelTollImportResult =
  | { ok: false; error: string }
  | { ok: true; blocked: boolean; message: string };

function defaultRange(lookbackDays: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (lookbackDays - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

function safeMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function parseMapping(raw: string | null | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

export async function runFuelAndTollsImportAction(input?: {
  from?: string;
  to?: string;
  fuelCsvText?: string | null;
  tollCsvText?: string | null;
}): Promise<FuelTollImportResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false, error: "You must be signed in." };
  }

  const supabase = await createClient();
  const { data: lookbackRow } = await supabase
    .from("import_settings")
    .select("value_int")
    .eq("key", "default_import_lookback_days")
    .maybeSingle();
  const lookback = lookbackRow?.value_int ?? 14;
  const range = {
    from: input?.from || defaultRange(lookback).from,
    to: input?.to || defaultRange(lookback).to,
  };

  const registry = await loadImportRegistry(supabase);
  if (!registry.selected) {
    return {
      ok: false,
      error: "No import source selected. Open Settings and choose Vektor MCP or CSV.",
    };
  }
  if (registry.selected === "api") {
    return { ok: false, error: "The API adapter does not import fuel or tolls." };
  }

  const { data: settingRows, error: settingErr } = await supabase
    .from("import_settings")
    .select("key, value_int, value_text")
    .in("key", SETTING_KEYS);
  if (settingErr && isMissingSchemaError(settingErr)) {
    return { ok: false, error: MIGRATION };
  }
  const settingsList = settingRows ?? [];
  const textSettings = new Map(settingsList.map((row) => [row.key, row.value_text]));

  let fuelRows: FuelDraft[] = [];
  let tollRows: TollDraft[] = [];
  let notes: string[] = [];

  try {
    if (registry.selected === "mcp") {
      if (!registry.adapter) {
        return await failAuth(supabase, range);
      }
      const fetched = await fetchFuelAndTollsLive(supabase, range);
      fuelRows = fetched.fuel;
      tollRows = fetched.tolls;
      notes = fetched.report.notes;
    } else {
      const fuelMap = parseMapping(textSettings.get("fuel_csv_column_mapping"));
      const tollMap = parseMapping(textSettings.get("toll_csv_column_mapping"));
      if (!fuelMap || !tollMap) {
        return {
          ok: false,
          error:
            "Fuel and toll CSV column mappings are not configured. MCP is the primary source.",
        };
      }
      if (!input?.fuelCsvText?.trim() || !input?.tollCsvText?.trim()) {
        return { ok: false, error: "Choose a fuel CSV and a tolls CSV." };
      }
      fuelRows = mapFuelCsv(input.fuelCsvText, fuelMap);
      tollRows = mapTollCsv(input.tollCsvText, tollMap);
    }
  } catch (err) {
    const needsSignIn = err instanceof NeedsSignInError || /sign-in|unauthorized/i.test(safeMessage(err));
    if (needsSignIn) return failAuth(supabase, range);
    return { ok: false, error: safeMessage(err) };
  }

  const context = await loadMatchContext(supabase, range);
  if (!context.ok) return context;

  const fuelSettings = fuelTollSettingsFromRows(settingsList, "fuel");
  const tollSettings = fuelTollSettingsFromRows(settingsList, "toll");

  const fuelOutcome = await persistFuel(supabase, {
    range,
    source: registry.selected,
    rows: fuelRows,
    settings: fuelSettings,
    context: context.context,
    notes,
  });
  if (!fuelOutcome.ok) return fuelOutcome;

  const tollOutcome = await persistTolls(supabase, {
    range,
    source: registry.selected,
    rows: tollRows,
    settings: tollSettings,
    context: context.context,
    notes,
  });
  if (!tollOutcome.ok) {
    revalidatePath("/imports");
    revalidatePath("/fuel");
    return { ok: false, error: `${fuelOutcome.message} ${tollOutcome.error}`.trim() };
  }

  revalidatePath("/imports");
  revalidatePath("/fuel");
  revalidatePath("/tolls");
  const blocked = fuelOutcome.blocked || tollOutcome.blocked;
  return {
    ok: true,
    blocked,
    message: `${fuelOutcome.message} ${tollOutcome.message}`.trim(),
  };
}

type MatchContext = {
  knownUnits: Set<string>;
  unitToId: Map<string, string>;
  loadSpans: LoadSpan[];
  weekMiles: WeekMiles[];
};

async function loadMatchContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  range: { from: string; to: string },
): Promise<{ ok: true; context: MatchContext } | { ok: false; error: string }> {
  const { data: trucks, error: truckErr } = await supabase
    .from("trucks")
    .select("id, unit_number")
    .eq("active", true);
  if (truckErr) return { ok: false, error: truckErr.message };

  const { data: loads, error: loadErr } = await supabase
    .from("loads")
    .select(
      "truck_unit_number, pickup_date, delivery_date, week_start, loaded_distance_mi, deadhead_miles",
    )
    .gte("delivery_date", addDays(range.from, -21))
    .lte("delivery_date", addDays(range.to, 14));
  if (loadErr && isMissingSchemaError(loadErr)) {
    return { ok: false, error: MIGRATION };
  }
  if (loadErr) return { ok: false, error: loadErr.message };

  const loadSpans: LoadSpan[] = [];
  const mileMap = new Map<string, number>();
  for (const load of loads ?? []) {
    if (!load.truck_unit_number || !load.delivery_date) continue;
    const end = load.delivery_date.slice(0, 10);
    const start = (load.pickup_date ?? load.delivery_date).slice(0, 10);
    loadSpans.push({
      unitNumber: load.truck_unit_number,
      startDate: start <= end ? start : end,
      endDate: end,
    });
    const key = `${load.truck_unit_number}\n${load.week_start}`;
    const miles =
      milesToHundredths(load.loaded_distance_mi) + milesToHundredths(load.deadhead_miles);
    mileMap.set(key, (mileMap.get(key) ?? 0) + miles);
  }
  const weekMiles: WeekMiles[] = [...mileMap.entries()].map(([key, milesHundredths]) => {
    const [unitNumber, weekStart] = key.split("\n");
    return { unitNumber: unitNumber ?? "", weekStart: weekStart ?? "", milesHundredths };
  });

  return {
    ok: true,
    context: {
      knownUnits: new Set((trucks ?? []).map((truck) => truck.unit_number)),
      unitToId: new Map((trucks ?? []).map((truck) => [truck.unit_number, truck.id])),
      loadSpans,
      weekMiles,
    },
  };
}

function addDays(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function previousFetched(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "fuel" | "tolls",
): Promise<number | null> {
  const { data, error } = await supabase
    .from("import_runs")
    .select("rows_fetched")
    .eq("kind", kind)
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error) || /kind/i.test(error.message)) {
      throw new Error(MIGRATION);
    }
    throw new Error(error.message);
  }
  return data?.rows_fetched ?? null;
}

async function startRun(
  supabase: Awaited<ReturnType<typeof createClient>>,
  range: { from: string; to: string },
  source: string,
  kind: "fuel" | "tolls",
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("import_runs")
    .insert({
      status: "running",
      range_from: range.from,
      range_to: range.to,
      source,
      kind,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingSchemaError(error) || /kind/i.test(error.message)) {
      return { ok: false, error: MIGRATION };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}

async function failAuth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  range: { from: string; to: string },
): Promise<FuelTollImportResult> {
  const started = await startRun(supabase, range, "mcp", "fuel");
  if (!started.ok) return started;
  await supabase.from("issues").insert({
    severity: "Block",
    rule: "vektor_auth",
    message: "Vektor connection needs sign-in",
    status: "open",
    import_run_id: started.id,
  });
  await supabase
    .from("import_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_summary: "Vektor connection needs sign-in",
    })
    .eq("id", started.id);
  revalidatePath("/imports");
  return { ok: false, error: "Vektor connection needs sign-in" };
}

async function persistFuel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    range: { from: string; to: string };
    source: string;
    rows: FuelDraft[];
    settings: ReturnType<typeof fuelTollSettingsFromRows>;
    context: MatchContext;
    notes: string[];
  },
): Promise<{ ok: true; blocked: boolean; message: string } | { ok: false; error: string }> {
  const started = await startRun(supabase, input.range, input.source, "fuel");
  if (!started.ok) return started;
  try {
    const { data: existing, error: existingErr } = await supabase
      .from("fuel_transactions")
      .select("vektor_transaction_id, card, transacted_at, amount_cents");
    if (existingErr) {
      if (isMissingSchemaError(existingErr)) throw new Error(MIGRATION);
      throw new Error(existingErr.message);
    }
    const existingDuplicates: DuplicateKey[] = (existing ?? []).map((row) => ({
      vektorTransactionId: row.vektor_transaction_id,
      card: row.card,
      transactedAt: normalizeTimestamp(row.transacted_at) ?? row.transacted_at,
      amountCents: row.amount_cents,
    }));
    const previous = await previousFetched(supabase, "fuel");
    const pipeline = runFuelPipeline(input.rows, {
      knownUnits: input.context.knownUnits,
      loadSpans: input.context.loadSpans,
      weekMiles: input.context.weekMiles,
      rangeFrom: input.range.from,
      rangeTo: input.range.to,
      previousFetched: previous,
      settings: input.settings,
      existingDuplicates,
    });
    if (pipeline.blocked && pipeline.blockIssue) {
      await supabase.from("issues").insert({
        severity: "Block",
        rule: pipeline.blockIssue.rule,
        message: pipeline.blockIssue.message,
        ref: pipeline.blockIssue.ref ?? null,
        status: "open",
        import_run_id: started.id,
      });
      await supabase
        .from("import_runs")
        .update({
          status: "blocked",
          finished_at: new Date().toISOString(),
          rows_fetched: input.rows.length,
          error_summary: pipeline.blockIssue.message,
        })
        .eq("id", started.id);
      return { ok: true, blocked: true, message: pipeline.blockIssue.message };
    }

    const existingIds = new Set((existing ?? []).map((row) => row.vektor_transaction_id));
    let promoted = 0;
    let rejected = 0;
    let updated = 0;
    for (const decision of pipeline.decisions) {
      const draft = decision.draft;
      if (draft.vektorTransactionId) {
        const { error: stageErr } = await supabase.from("vektor_fuel_staging").upsert(
          {
            import_run_id: started.id,
            vektor_transaction_id: draft.vektorTransactionId,
            raw: asJson(draft.source),
            promote_status: decision.promote ? "promoted" : "rejected",
            reject_reason: decision.rejectReason,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "vektor_transaction_id" },
        );
        if (stageErr) {
          if (isMissingSchemaError(stageErr)) throw new Error(MIGRATION);
          throw new Error(stageErr.message);
        }
      }
      for (const issue of decision.issues) {
        await supabase.from("issues").insert({
          severity: issue.severity,
          rule: issue.rule,
          message: issue.message,
          ref: issue.ref ?? null,
          status: "open",
          import_run_id: started.id,
        });
      }
      if (
        !decision.promote ||
        draft.gallonsMilli == null ||
        draft.amountCents == null ||
        !draft.transactedAt ||
        !draft.transactedDate ||
        !draft.weekStart ||
        !draft.weekEnd
      ) {
        rejected += 1;
        continue;
      }
      const { error: upErr } = await supabase.from("fuel_transactions").upsert(
        {
          vektor_transaction_id: draft.vektorTransactionId,
          truck_id: draft.unitNumber ? (input.context.unitToId.get(draft.unitNumber) ?? null) : null,
          unit_number: draft.unitNumber,
          transacted_at: draft.transactedAt,
          transacted_date: draft.transactedDate,
          week_start: draft.weekStart,
          week_end: draft.weekEnd,
          product: draft.product,
          card: draft.card,
          gallons_milli: draft.gallonsMilli,
          amount_cents: draft.amountCents,
          retail_amount_cents: draft.retailAmountCents,
          import_run_id: started.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vektor_transaction_id" },
      );
      if (upErr) {
        rejected += 1;
        await supabase.from("issues").insert({
          severity: "Block",
          rule: "promote_failed",
          message: upErr.message,
          ref: draft.vektorTransactionId,
          status: "open",
          import_run_id: started.id,
        });
        continue;
      }
      if (existingIds.has(draft.vektorTransactionId)) updated += 1;
      else promoted += 1;
    }
    for (const issue of pipeline.weekIssues) {
      await supabase.from("issues").insert({
        severity: issue.severity,
        rule: issue.rule,
        message: issue.message,
        ref: issue.ref ?? null,
        status: "open",
        import_run_id: started.id,
      });
    }
    const summary = `Fuel: fetched ${input.rows.length}, promoted ${promoted}, updated ${updated}, rejected ${rejected}.`;
    await supabase
      .from("import_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_fetched: input.rows.length,
        rows_promoted: promoted,
        rows_rejected: rejected,
        rows_updated: updated,
        error_summary: input.notes.length ? input.notes.join(" ") : null,
        meta: { notes: input.notes } as unknown as Json,
      })
      .eq("id", started.id);
    return { ok: true, blocked: false, message: summary };
  } catch (err) {
    const message = safeMessage(err);
    await supabase
      .from("import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_summary: message,
      })
      .eq("id", started.id);
    return { ok: false, error: message };
  }
}

async function persistTolls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    range: { from: string; to: string };
    source: string;
    rows: TollDraft[];
    settings: ReturnType<typeof fuelTollSettingsFromRows>;
    context: MatchContext;
    notes: string[];
  },
): Promise<{ ok: true; blocked: boolean; message: string } | { ok: false; error: string }> {
  const started = await startRun(supabase, input.range, input.source, "tolls");
  if (!started.ok) return started;
  try {
    const { data: existing, error: existingErr } = await supabase
      .from("toll_transactions")
      .select("vektor_transaction_id, card, vektor_truck_id, transacted_at, amount_cents");
    if (existingErr) {
      if (isMissingSchemaError(existingErr)) throw new Error(MIGRATION);
      throw new Error(existingErr.message);
    }
    const existingDuplicates: DuplicateKey[] = (existing ?? []).map((row) => ({
      vektorTransactionId: row.vektor_transaction_id,
      card: row.card ?? row.vektor_truck_id,
      transactedAt: normalizeTimestamp(row.transacted_at) ?? row.transacted_at,
      amountCents: row.amount_cents,
    }));
    const previous = await previousFetched(supabase, "tolls");
    const pipeline = runTollPipeline(input.rows, {
      knownUnits: input.context.knownUnits,
      loadSpans: input.context.loadSpans,
      rangeFrom: input.range.from,
      rangeTo: input.range.to,
      previousFetched: previous,
      settings: input.settings,
      existingDuplicates,
    });
    if (pipeline.blocked && pipeline.blockIssue) {
      await supabase.from("issues").insert({
        severity: "Block",
        rule: pipeline.blockIssue.rule,
        message: pipeline.blockIssue.message,
        ref: pipeline.blockIssue.ref ?? null,
        status: "open",
        import_run_id: started.id,
      });
      await supabase
        .from("import_runs")
        .update({
          status: "blocked",
          finished_at: new Date().toISOString(),
          rows_fetched: input.rows.length,
          error_summary: pipeline.blockIssue.message,
        })
        .eq("id", started.id);
      return { ok: true, blocked: true, message: pipeline.blockIssue.message };
    }

    const existingIds = new Set((existing ?? []).map((row) => row.vektor_transaction_id));
    let promoted = 0;
    let rejected = 0;
    let updated = 0;
    for (const decision of pipeline.decisions) {
      const draft = decision.draft;
      if (draft.vektorTransactionId) {
        const { error: stageErr } = await supabase.from("vektor_toll_staging").upsert(
          {
            import_run_id: started.id,
            vektor_transaction_id: draft.vektorTransactionId,
            raw: asJson(draft.source),
            promote_status: decision.promote ? "promoted" : "rejected",
            reject_reason: decision.rejectReason,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "vektor_transaction_id" },
        );
        if (stageErr) {
          if (isMissingSchemaError(stageErr)) throw new Error(MIGRATION);
          throw new Error(stageErr.message);
        }
      }
      for (const issue of decision.issues) {
        await supabase.from("issues").insert({
          severity: issue.severity,
          rule: issue.rule,
          message: issue.message,
          ref: issue.ref ?? null,
          status: "open",
          import_run_id: started.id,
        });
      }
      if (
        !decision.promote ||
        draft.amountCents == null ||
        !draft.transactedAt ||
        !draft.transactedDate ||
        !draft.weekStart ||
        !draft.weekEnd
      ) {
        rejected += 1;
        continue;
      }
      const { error: upErr } = await supabase.from("toll_transactions").upsert(
        {
          vektor_transaction_id: draft.vektorTransactionId,
          truck_id: draft.unitNumber ? (input.context.unitToId.get(draft.unitNumber) ?? null) : null,
          vektor_truck_id: draft.vektorTruckId,
          unit_number: draft.unitNumber,
          transacted_at: draft.transactedAt,
          transacted_date: draft.transactedDate,
          week_start: draft.weekStart,
          week_end: draft.weekEnd,
          amount_cents: draft.amountCents,
          card: draft.card,
          location: draft.location,
          import_run_id: started.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vektor_transaction_id" },
      );
      if (upErr) {
        rejected += 1;
        await supabase.from("issues").insert({
          severity: "Block",
          rule: "promote_failed",
          message: upErr.message,
          ref: draft.vektorTransactionId,
          status: "open",
          import_run_id: started.id,
        });
        continue;
      }
      if (existingIds.has(draft.vektorTransactionId)) updated += 1;
      else promoted += 1;
    }
    const summary = `Tolls: fetched ${input.rows.length}, promoted ${promoted}, updated ${updated}, rejected ${rejected}.`;
    await supabase
      .from("import_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_fetched: input.rows.length,
        rows_promoted: promoted,
        rows_rejected: rejected,
        rows_updated: updated,
        error_summary: input.notes.length ? input.notes.join(" ") : null,
      })
      .eq("id", started.id);
    return { ok: true, blocked: false, message: summary };
  } catch (err) {
    const message = safeMessage(err);
    await supabase
      .from("import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_summary: message,
      })
      .eq("id", started.id);
    return { ok: false, error: message };
  }
}
