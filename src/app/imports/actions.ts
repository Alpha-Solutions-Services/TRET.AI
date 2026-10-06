"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getVektorEnvConfig, createVektorClient } from "@/lib/vektor/client";
import { runImportPipeline } from "@/lib/vektor/pipeline";
import type { VektorManifest } from "@/lib/vektor/types";
import type { Json } from "@/lib/supabase/database.types";

export type ImportActionResult =
  | {
      ok: true;
      runId: string;
      fetched: number;
      promoted: number;
      rejected: number;
      updated: number;
      blocked?: boolean;
      message: string;
    }
  | { ok: false; error: string };

function defaultRange(lookbackDays: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (lookbackDays - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export async function runVektorImportAction(input?: {
  from?: string;
  to?: string;
}): Promise<ImportActionResult> {
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

  const vektorConfig = getVektorEnvConfig();
  if (!vektorConfig) {
    return {
      ok: false,
      error:
        "Vektor is not configured. Set VEKTOR_API_BASE_URL and VEKTOR_API_TOKEN in the server env (never in the browser).",
    };
  }

  const { data: run, error: runErr } = await supabase
    .from("import_runs")
    .insert({
      status: "running",
      range_from: range.from,
      range_to: range.to,
    })
    .select("id")
    .single();
  if (runErr || !run) {
    return { ok: false, error: runErr?.message ?? "Could not start import run." };
  }

  try {
    const client = createVektorClient(vektorConfig);
    // OPEN: exact REST list shape. Until confirmed, expect { items: VektorManifest[] } or array.
    const raw = await client.listDeliveredManifests({
      from: range.from,
      to: range.to,
      perPage: 25,
    });
    const manifests = normalizeManifestList(raw);

    const { data: dropSetting } = await supabase
      .from("import_settings")
      .select("value_int")
      .eq("key", "row_count_drop_block_pct")
      .maybeSingle();

    const { data: prevRun } = await supabase
      .from("import_runs")
      .select("rows_fetched")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: trucks } = await supabase
      .from("trucks")
      .select("id, unit_number")
      .eq("active", true);
    const unitToId = new Map((trucks ?? []).map((t) => [t.unit_number, t.id]));
    const knownUnits = new Set(unitToId.keys());

    // Resolve driver/broker names from staging raw if present; live client lookups OPEN.
    const lookups = { drivers: {} as Record<string, string>, brokers: {} as Record<string, string> };

    const pipeline = runImportPipeline(manifests, {
      lookups,
      knownTruckUnits: knownUnits,
      rangeFrom: range.from,
      rangeTo: range.to,
      previousFetched: prevRun?.rows_fetched ?? null,
      settings: { rowCountDropBlockPct: dropSetting?.value_int ?? 50 },
    });

    if (pipeline.blocked && pipeline.blockIssue) {
      await supabase.from("issues").insert({
        severity: pipeline.blockIssue.severity,
        rule: pipeline.blockIssue.rule,
        message: pipeline.blockIssue.message,
        ref: pipeline.blockIssue.ref ?? null,
        status: "open",
        import_run_id: run.id,
        manifest_id: pipeline.blockIssue.manifestId ?? null,
      });
      await supabase
        .from("import_runs")
        .update({
          status: "blocked",
          finished_at: new Date().toISOString(),
          rows_fetched: manifests.length,
          error_summary: pipeline.blockIssue.message,
          meta: { statusCounts: pipeline.statusCounts } as unknown as Json,
        })
        .eq("id", run.id);
      revalidatePath("/imports");
      return {
        ok: true,
        runId: run.id,
        fetched: manifests.length,
        promoted: 0,
        rejected: 0,
        updated: 0,
        blocked: true,
        message: pipeline.blockIssue.message,
      };
    }

    let promoted = 0;
    let rejected = 0;
    let updated = 0;

    for (const decision of pipeline.decisions) {
      const { mapped, issues, promote, rejectReason } = decision;

      await supabase.from("vektor_loads_staging").upsert(
        {
          import_run_id: run.id,
          manifest_id: mapped.manifestId,
          order_ids: mapped.orderIds,
          raw: manifests.find((m) => m.manifestId === mapped.manifestId) as unknown as Json,
          promote_status: promote ? "promoted" : "rejected",
          reject_reason: rejectReason,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "manifest_id" },
      );

      for (const issue of [...issues, ...pipeline.duplicateIssues.filter((i) => i.manifestId === mapped.manifestId || !i.manifestId)]) {
        if (issue.manifestId && issue.manifestId !== mapped.manifestId) continue;
        await supabase.from("issues").insert({
          severity: issue.severity,
          rule: issue.rule,
          message: issue.message,
          ref: issue.ref ?? null,
          status: "open",
          import_run_id: run.id,
          manifest_id: issue.manifestId ?? mapped.manifestId,
        });
      }

      if (!promote) {
        rejected += 1;
        continue;
      }

      const truckId = mapped.truckUnitNumber
        ? (unitToId.get(mapped.truckUnitNumber) ?? null)
        : null;

      const row = {
        manifest_id: mapped.manifestId,
        order_ids: mapped.orderIds,
        load_id: mapped.loadId,
        manifest_friendly_id: mapped.manifestFriendlyId,
        pickup_date: mapped.pickupDate,
        delivery_date: mapped.deliveryDate!,
        week_start: mapped.weekStart!,
        week_end: mapped.weekEnd!,
        month_key: mapped.monthKey!,
        driver_id: mapped.driverId,
        driver_name: mapped.driverName,
        broker_id: mapped.brokerId,
        broker_name: mapped.brokerName,
        customer_id: mapped.customerId,
        customer_name: mapped.customerName,
        origin_city: mapped.originCity,
        origin_state: mapped.originState,
        destination_city: mapped.destinationCity,
        destination_state: mapped.destinationState,
        loaded_distance_mi: mapped.loadedDistanceMi,
        empty_distance_mi: mapped.emptyDistanceMi,
        auto_loaded_distance_mi: mapped.autoLoadedDistanceMi,
        auto_empty_distance_mi: mapped.autoEmptyDistanceMi,
        deadhead_miles: mapped.deadheadMiles,
        rate_cents: mapped.rateCents,
        truck_unit_number: mapped.truckUnitNumber,
        truck_id: truckId,
        vektor_status: mapped.vektorStatus,
        lineage_root_manifest_id: mapped.lineageRootManifestId,
        lineage_parent_manifest_id: mapped.lineageParentManifestId,
        lineage_related_manifest_id: mapped.lineageRelatedManifestId,
        lineage_relation: mapped.lineageRelation,
        trip_group_id: null,
        primary_load: null,
        import_run_id: run.id,
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("loads")
        .select("id")
        .eq("manifest_id", mapped.manifestId)
        .maybeSingle();

      const { error: upErr } = await supabase
        .from("loads")
        .upsert(row, { onConflict: "manifest_id" });
      if (upErr) {
        rejected += 1;
        await supabase.from("issues").insert({
          severity: "Block",
          rule: "promote_failed",
          message: upErr.message,
          ref: mapped.manifestFriendlyId,
          status: "open",
          import_run_id: run.id,
          manifest_id: mapped.manifestId,
        });
        continue;
      }
      if (existing) updated += 1;
      else promoted += 1;
    }

    // Duplicate issues without per-manifest id
    for (const issue of pipeline.duplicateIssues.filter((i) => !i.manifestId)) {
      await supabase.from("issues").insert({
        severity: issue.severity,
        rule: issue.rule,
        message: issue.message,
        ref: issue.ref ?? null,
        status: "open",
        import_run_id: run.id,
      });
    }

    await supabase
      .from("import_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_fetched: manifests.length,
        rows_promoted: promoted,
        rows_rejected: rejected,
        rows_updated: updated,
        meta: { statusCounts: pipeline.statusCounts } as unknown as Json,
      })
      .eq("id", run.id);

    revalidatePath("/imports");
    revalidatePath("/loads");
    return {
      ok: true,
      runId: run.id,
      fetched: manifests.length,
      promoted,
      rejected,
      updated,
      message: `Fetched ${manifests.length}. Promoted ${promoted}, updated ${updated}, rejected ${rejected}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Never include token in error text
    const safe = message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    await supabase
      .from("import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_summary: safe,
      })
      .eq("id", run.id);
    revalidatePath("/imports");
    return { ok: false, error: safe };
  }
}

function normalizeManifestList(raw: unknown): VektorManifest[] {
  if (Array.isArray(raw)) return raw as VektorManifest[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as VektorManifest[];
    if (Array.isArray(obj.manifests)) return obj.manifests as VektorManifest[];
    if (Array.isArray(obj.data)) return obj.data as VektorManifest[];
  }
  throw new Error(
    "Unexpected Vektor list response shape (OPEN: confirm API list path and JSON). Expected an array or { items: [] }.",
  );
}
