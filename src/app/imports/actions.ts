"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import {
  resolveCrossSourceConflict,
  type ExistingLoadSnapshot,
} from "@/lib/vektor/adapters";
import { timestampToDate } from "@/lib/vektor/dates";
import { loadImportRegistry } from "@/lib/vektor/import-registry";
import { formatImportResultMessage } from "@/lib/vektor/mcp/window";
import { NeedsSignInError } from "@/lib/vektor/oauth/needs-sign-in";
import { runImportPipeline } from "@/lib/vektor/pipeline";
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

async function loadAdapterRegistry(supabase: Awaited<ReturnType<typeof createClient>>) {
  return loadImportRegistry(supabase, { withLiveFetch: true });
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

  const { adapter, selected } = await loadAdapterRegistry(supabase);
  if (selected === "mcp" && !adapter) {
    let { data: failedRun, error: failedErr } = await supabase
      .from("import_runs")
      .insert({
        status: "failed",
        range_from: range.from,
        range_to: range.to,
        source: "mcp",
        finished_at: new Date().toISOString(),
        error_summary: "Vektor connection needs sign-in",
      })
      .select("id")
      .single();
    if (failedErr && /source/i.test(failedErr.message)) {
      ({ data: failedRun, error: failedErr } = await supabase
        .from("import_runs")
        .insert({
          status: "failed",
          range_from: range.from,
          range_to: range.to,
          finished_at: new Date().toISOString(),
          error_summary: "Vektor connection needs sign-in",
        })
        .select("id")
        .single());
    }
    if (!failedErr && failedRun) {
      await supabase.from("issues").insert({
        severity: "Block",
        rule: "vektor_auth",
        message: "Vektor connection needs sign-in",
        status: "open",
        import_run_id: failedRun.id,
      });
    }
    revalidatePath("/imports");
    return { ok: false, error: "Vektor connection needs sign-in" };
  }
  if (!adapter || !selected) {
    return {
      ok: false,
      error:
        "No import source selected, or the selected source is not configured. Open Settings.",
    };
  }

  let { data: run, error: runErr } = await supabase
    .from("import_runs")
    .insert({
      status: "running",
      range_from: range.from,
      range_to: range.to,
      source: selected,
    })
    .select("id")
    .single();
  // Until additive migration is applied, source column may be missing.
  if (runErr && /source/i.test(runErr.message)) {
    ({ data: run, error: runErr } = await supabase
      .from("import_runs")
      .insert({
        status: "running",
        range_from: range.from,
        range_to: range.to,
      })
      .select("id")
      .single());
  }
  if (runErr || !run) {
    return { ok: false, error: runErr?.message ?? "Could not start import run." };
  }

  try {
    const fetched = await adapter.fetchManifests(range);
    const manifests = fetched.manifests;
    const fetchReport = fetched.report ?? null;

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

    const pipeline = runImportPipeline(manifests, {
      lookups: fetched.lookups,
      knownTruckUnits: knownUnits,
      rangeFrom: range.from,
      rangeTo: range.to,
      previousFetched: prevRun?.rows_fetched ?? null,
      settings: { rowCountDropBlockPct: dropSetting?.value_int ?? 50 },
    });

    if (pipeline.blocked && pipeline.blockIssue) {
      await supabase.from("issues").insert({
        severity: "Block",
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
          meta: {
            statusCounts: pipeline.statusCounts,
            fetchReport,
          } as unknown as Json,
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
          manifest_friendly_id: mapped.manifestFriendlyId,
          order_ids: mapped.orderIds,
          raw: manifests.find((m) => m.manifestId === mapped.manifestId) as unknown as Json,
          promote_status: promote ? "promoted" : "rejected",
          reject_reason: rejectReason,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "manifest_id" },
      );

      for (const issue of issues) {
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

      let existingSnap: ExistingLoadSnapshot | null = null;
      if (mapped.manifestFriendlyId) {
        const { data: existing } = await supabase
          .from("loads")
          .select(
            "manifest_id, load_id, delivery_date, rate_cents, loaded_distance_mi, deadhead_miles, origin_city, destination_city, import_run_id",
          )
          .eq("manifest_friendly_id", mapped.manifestFriendlyId)
          .maybeSingle();
        if (existing) {
          let source: string | null = null;
          if (existing.import_run_id) {
            const { data: er } = await supabase
              .from("import_runs")
              .select("source")
              .eq("id", existing.import_run_id)
              .maybeSingle();
            source = er?.source ?? null;
          }
          existingSnap = {
            naturalKey: mapped.manifestFriendlyId,
            manifestId: existing.manifest_id,
            loadId: existing.load_id,
            deliveryDate: existing.delivery_date
              ? `${existing.delivery_date} 00:00:00`
              : null,
            rateCents: existing.rate_cents,
            loadedDistanceMi: existing.loaded_distance_mi,
            deadheadMiles: existing.deadhead_miles,
            originCity: existing.origin_city,
            destinationCity: existing.destination_city,
            source,
          };
        }
      }

      const conflict = resolveCrossSourceConflict(mapped, existingSnap, selected);
      if (conflict.issue) {
        await supabase.from("issues").insert({
          severity: conflict.issue.severity,
          rule: conflict.issue.rule,
          message: conflict.issue.message,
          ref: conflict.issue.ref ?? null,
          status: "open",
          import_run_id: run.id,
          manifest_id: mapped.manifestId,
        });
      }
      if (conflict.action === "skip_identical") {
        updated += 0;
        continue;
      }
      if (conflict.action === "warn_differ") {
        rejected += 1;
        continue;
      }

      const truckId = mapped.truckUnitNumber
        ? (unitToId.get(mapped.truckUnitNumber) ?? null)
        : null;

      const deliveryDay = timestampToDate(mapped.deliveryDate)!;
      const pickupDay = timestampToDate(mapped.pickupDate);

      const row = {
        manifest_id: mapped.manifestId,
        order_ids: mapped.orderIds,
        load_id: mapped.loadId,
        manifest_friendly_id: mapped.manifestFriendlyId,
        pickup_date: pickupDay,
        delivery_date: deliveryDay,
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

      const { data: existingByManifest } = await supabase
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
      if (existingByManifest) updated += 1;
      else promoted += 1;
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
        meta: {
          statusCounts: pipeline.statusCounts,
          fetchReport,
        } as unknown as Json,
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
      message: formatImportResultMessage({
        source: selected,
        fetched: manifests.length,
        promoted,
        updated,
        rejected,
        report: fetchReport,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const safe = message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    const needsSignIn =
      err instanceof NeedsSignInError ||
      /sign-in|unauthorized|unverified/i.test(safe) ||
      /connection needs/i.test(safe);

    await supabase.from("issues").insert({
      severity: "Block",
      rule: needsSignIn ? "vektor_auth" : "import_error",
      message: needsSignIn
        ? "Vektor connection needs sign-in"
        : safe,
      status: "open",
      import_run_id: run.id,
    });

    await supabase
      .from("import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_summary: needsSignIn
          ? "Vektor connection needs sign-in"
          : safe,
      })
      .eq("id", run.id);
    revalidatePath("/imports");
    return {
      ok: false,
      error: needsSignIn ? "Vektor connection needs sign-in" : safe,
    };
  }
}
