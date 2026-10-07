"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { assertMonday } from "@/lib/fee-engine";
import { loadKey } from "@/lib/legacy/fees";
import { centsInputError } from "@/lib/money/cents";
import { unitKey } from "@/lib/sheets/mismatch";
import { createClient } from "@/lib/supabase/server";

export type FeeActionResult = { ok: true } | { ok: false; error: string };

async function requireAccess() {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false as const, error: "You must be signed in." };
  }
  return { ok: true as const, supabase: await createClient() };
}

function weekError(weekStart: string): string | null {
  try {
    assertMonday(weekStart, "Week start");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Week start must be a Monday.";
  }
}

function feeBpError(feeBp: number): string | null {
  if (!Number.isInteger(feeBp) || feeBp < 0 || feeBp > 10000) {
    return "Management fee percent is out of range.";
  }
  return null;
}

export async function saveLegacyLoadFeeAction(input: {
  weekStart: string;
  unitNumber: string;
  loadId: string;
  mode: "percent" | "amount" | "clear";
  feeBp?: number | null;
  feeCents?: number | null;
}): Promise<FeeActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;
  const monday = weekError(input.weekStart);
  if (monday) return { ok: false, error: monday };

  const unitNumber = input.unitNumber.trim();
  const loadId = input.loadId.trim();
  if (!unitNumber) return { ok: false, error: "Unit is required." };
  if (!loadId) return { ok: false, error: "Load is required." };
  const unit = unitKey(unitNumber);
  const load = loadKey(loadId);

  if (input.mode === "clear") {
    const { error } = await gate.supabase.rpc("delete_legacy_load_fee", {
      p_unit_key: unit,
      p_load_key: load,
      p_week_start: input.weekStart,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/ins-outs");
    return { ok: true };
  }

  if (input.mode === "amount") {
    const centsError = centsInputError(input.feeCents ?? Number.NaN);
    if (centsError) return { ok: false, error: centsError };
    const { error } = await gate.supabase.rpc("upsert_legacy_load_fee", {
      p_unit_number: unitNumber,
      p_unit_key: unit,
      p_load_id: loadId,
      p_load_key: load,
      p_week_start: input.weekStart,
      p_fee_cents: input.feeCents ?? 0,
      p_fee_bp: null,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/ins-outs");
    return { ok: true };
  }

  const bpError = feeBpError(input.feeBp ?? Number.NaN);
  if (bpError) return { ok: false, error: bpError };
  const { error } = await gate.supabase.rpc("upsert_legacy_load_fee", {
    p_unit_number: unitNumber,
    p_unit_key: unit,
    p_load_id: loadId,
    p_load_key: load,
    p_week_start: input.weekStart,
    p_fee_cents: null,
    p_fee_bp: input.feeBp ?? 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ins-outs");
  return { ok: true };
}

export async function saveLegacyTruckWeekFeeAction(input: {
  weekStart: string;
  unitNumber: string;
  mode: "percent" | "clear";
  feeBp?: number;
}): Promise<FeeActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;
  const monday = weekError(input.weekStart);
  if (monday) return { ok: false, error: monday };
  const unitNumber = input.unitNumber.trim();
  if (!unitNumber) return { ok: false, error: "Unit is required." };
  const unit = unitKey(unitNumber);

  if (input.mode === "clear") {
    const { error } = await gate.supabase.rpc("delete_legacy_truck_week_fee", {
      p_unit_key: unit,
      p_week_start: input.weekStart,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/ins-outs");
    return { ok: true };
  }

  const bpError = feeBpError(input.feeBp ?? Number.NaN);
  if (bpError) return { ok: false, error: bpError };
  const { error } = await gate.supabase.rpc("upsert_legacy_truck_week_fee", {
    p_unit_number: unitNumber,
    p_unit_key: unit,
    p_week_start: input.weekStart,
    p_fee_bp: input.feeBp ?? 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ins-outs");
  return { ok: true };
}

export async function seedLegacyLoadFeesAction(input: {
  weekStart: string;
  rows: Array<{ unitNumber: string; loadId: string; feeBp: number }>;
}): Promise<FeeActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;
  const monday = weekError(input.weekStart);
  if (monday) return { ok: false, error: monday };
  if (input.rows.length === 0) return { ok: true };

  const rows = input.rows.map((row) => {
    const unitNumber = row.unitNumber.trim();
    const loadId = row.loadId.trim();
    return {
      unit_number: unitNumber,
      unit_key: unitKey(unitNumber),
      load_id: loadId,
      load_key: loadKey(loadId),
      fee_bp: row.feeBp,
    };
  });
  if (rows.some((row) => !row.unit_number || !row.load_id || feeBpError(row.fee_bp))) {
    return { ok: false, error: "Each default fee needs a unit, a load, and a percent." };
  }

  const { error } = await gate.supabase.rpc("seed_legacy_load_fees", {
    p_week_start: input.weekStart,
    p_rows: rows,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ins-outs");
  return { ok: true };
}
