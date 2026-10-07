"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { normalizeEmail } from "@/lib/allowed-users";
import { mondayDateError, type TruckClass } from "@/lib/fee-engine";
import { isChargedTo, isFixedExpenseKind } from "@/lib/fixed-expenses/kinds";
import { centsInputError } from "@/lib/money/cents";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import {
  GOOGLE_SHEET_MIGRATION_MESSAGE,
  isMissingGoogleSheetColumn,
  parseTruckFields,
} from "@/lib/trucks/fields";
import { selectTruckById } from "@/lib/trucks/queries";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

async function requireAccess() {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false as const, error: "You must be signed in." };
  }
  return {
    ok: true as const,
    email: normalizeEmail(access.email),
    supabase: await createClient(),
  };
}

export async function createTruckAction(input: {
  unitNumber: string;
  name: string;
  truckClass: TruckClass;
  ownerName: string;
  googleSheetUrl: string;
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  const parsed = parseTruckFields(input);
  if (!parsed.ok) return parsed;
  const fields = parsed.value;

  const inserted = await gate.supabase
    .from("trucks")
    .insert({
      unit_number: fields.unitNumber,
      name: fields.name,
      truck_class: fields.truckClass,
      owner_name: fields.ownerName,
      active: true,
      ...(fields.googleSheetUrl ? { google_sheet_url: fields.googleSheetUrl } : {}),
    })
    .select("id")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return { ok: false, error: "That unit number is already in use." };
    }
    if (fields.googleSheetUrl && isMissingGoogleSheetColumn(inserted.error)) {
      return { ok: false, error: GOOGLE_SHEET_MIGRATION_MESSAGE };
    }
    return { ok: false, error: inserted.error.message };
  }

  const saved = await selectTruckById(gate.supabase, inserted.data.id);
  if (!saved) return { ok: false, error: "Truck was saved but could not be read back." };

  await gate.supabase.from("change_log").insert({
    entity_type: "truck",
    entity_id: saved.truck.id,
    action: "create_truck",
    actor_email: gate.email,
    before_data: null,
    after_data: saved.truck as unknown as Json,
  });

  revalidatePath("/trucks");
  return { ok: true, id: saved.truck.id };
}

export async function updateTruckAction(input: {
  truckId: string;
  unitNumber: string;
  name: string;
  truckClass: TruckClass;
  ownerName: string;
  googleSheetUrl: string;
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  const parsed = parseTruckFields(input);
  if (!parsed.ok) return parsed;
  const fields = parsed.value;

  const before = await selectTruckById(gate.supabase, input.truckId);
  if (!before) return { ok: false, error: "Truck not found." };

  const patch = {
    unit_number: fields.unitNumber,
    name: fields.name,
    truck_class: fields.truckClass,
    owner_name: fields.ownerName,
    google_sheet_url: fields.googleSheetUrl,
  };

  let updated = await gate.supabase
    .from("trucks")
    .update(patch)
    .eq("id", input.truckId)
    .select("id")
    .maybeSingle();

  if (updated.error && isMissingGoogleSheetColumn(updated.error)) {
    if (fields.googleSheetUrl) {
      return { ok: false, error: GOOGLE_SHEET_MIGRATION_MESSAGE };
    }
    updated = await gate.supabase
      .from("trucks")
      .update({
        unit_number: fields.unitNumber,
        name: fields.name,
        truck_class: fields.truckClass,
        owner_name: fields.ownerName,
      })
      .eq("id", input.truckId)
      .select("id")
      .maybeSingle();
  }

  if (updated.error) {
    if (updated.error.code === "23505") {
      return { ok: false, error: "That unit number is already in use." };
    }
    return { ok: false, error: updated.error.message };
  }
  if (!updated.data) return { ok: false, error: "Truck not found." };

  const after = await selectTruckById(gate.supabase, input.truckId);
  if (!after) return { ok: false, error: "Truck was saved but could not be read back." };

  await gate.supabase.from("change_log").insert({
    entity_type: "truck",
    entity_id: input.truckId,
    action: "update_truck",
    actor_email: gate.email,
    before_data: before.truck as unknown as Json,
    after_data: after.truck as unknown as Json,
  });

  revalidatePath("/trucks");
  revalidatePath(`/trucks/${input.truckId}`);
  return { ok: true, id: input.truckId };
}

export async function setTruckActiveAction(
  truckId: string,
  active: boolean,
): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  const { data: before } = await gate.supabase
    .from("trucks")
    .select("*")
    .eq("id", truckId)
    .maybeSingle();

  if (!before) return { ok: false, error: "Truck not found." };

  const { data, error } = await gate.supabase
    .from("trucks")
    .update({ active })
    .eq("id", truckId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  await gate.supabase.from("change_log").insert({
    entity_type: "truck",
    entity_id: truckId,
    action: active ? "activate_truck" : "deactivate_truck",
    actor_email: gate.email,
    before_data: before as unknown as Json,
    after_data: data as unknown as Json,
  });

  revalidatePath("/trucks");
  revalidatePath(`/trucks/${truckId}`);
  return { ok: true };
}

export async function createFeeRateVersionAction(input: {
  truckId: string;
  effectiveFrom: string;
  note: string;
  rules: Array<{ kind: string; rate_bp: number; base_pct_bp: number }>;
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  const mondayError = mondayDateError(input.effectiveFrom, "Effective from");
  if (mondayError) return { ok: false, error: mondayError };
  if (input.rules.length === 0) {
    return { ok: false, error: "Add at least the required fee rules for this truck class." };
  }

  const { data, error } = await gate.supabase.rpc("create_fee_rate_version", {
    p_truck_id: input.truckId,
    p_effective_from: input.effectiveFrom,
    p_note: input.note.trim() || null,
    p_rules: input.rules as unknown as Json,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trucks/${input.truckId}`);
  revalidatePath("/trucks");
  return { ok: true, id: data };
}

export async function createFixedExpenseVersionAction(input: {
  truckId: string;
  kind: string;
  effectiveFrom: string;
  weeklyAmountCents: number;
  chargedTo: string;
  note: string;
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  if (!isFixedExpenseKind(input.kind)) {
    return { ok: false, error: "Choose an expense kind." };
  }
  const mondayError = mondayDateError(input.effectiveFrom, "Effective from");
  if (mondayError) return { ok: false, error: mondayError };
  const centsError = centsInputError(input.weeklyAmountCents);
  if (centsError) return { ok: false, error: centsError };
  if (!isChargedTo(input.chargedTo)) {
    return { ok: false, error: "Charged to must be owner or management." };
  }

  const { data, error } = await gate.supabase.rpc("create_fixed_expense_version", {
    p_truck_id: input.truckId,
    p_kind: input.kind,
    p_effective_from: input.effectiveFrom,
    p_weekly_amount_cents: input.weeklyAmountCents,
    p_charged_to: input.chargedTo,
    p_note: input.note.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trucks/${input.truckId}`);
  return { ok: true, id: data };
}

export async function deleteLatestFixedExpenseVersionAction(
  truckId: string,
  kind: string,
): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;
  if (!isFixedExpenseKind(kind)) {
    return { ok: false, error: "Choose an expense kind." };
  }

  const { data: hasStatements, error: checkError } = await gate.supabase.rpc(
    "truck_has_weekly_statements",
    { p_truck_id: truckId },
  );
  if (checkError) return { ok: false, error: checkError.message };
  if (hasStatements) {
    return {
      ok: false,
      error: "Cannot delete an expense version after weekly statements exist.",
    };
  }

  const { error } = await gate.supabase.rpc("delete_latest_fixed_expense_version", {
    p_truck_id: truckId,
    p_kind: kind,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trucks/${truckId}`);
  return { ok: true };
}

export async function upsertFixedExpenseOverrideAction(input: {
  truckId: string;
  kind: string;
  weekStart: string;
  amountCents: number;
  chargedTo: string;
  note: string;
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  if (!isFixedExpenseKind(input.kind)) {
    return { ok: false, error: "Choose an expense kind." };
  }
  const mondayError = mondayDateError(input.weekStart, "Week start");
  if (mondayError) return { ok: false, error: mondayError };
  const centsError = centsInputError(input.amountCents);
  if (centsError) return { ok: false, error: centsError };
  if (!isChargedTo(input.chargedTo)) {
    return { ok: false, error: "Charged to must be owner or management." };
  }

  const { data, error } = await gate.supabase.rpc("upsert_fixed_expense_override", {
    p_truck_id: input.truckId,
    p_kind: input.kind,
    p_week_start: input.weekStart,
    p_amount_cents: input.amountCents,
    p_charged_to: input.chargedTo,
    p_note: input.note.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trucks/${input.truckId}`);
  return { ok: true, id: data };
}

export async function deleteFixedExpenseOverrideAction(input: {
  truckId: string;
  kind: string;
  weekStart: string;
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;
  if (!isFixedExpenseKind(input.kind)) {
    return { ok: false, error: "Choose an expense kind." };
  }

  const { error } = await gate.supabase.rpc("delete_fixed_expense_override", {
    p_truck_id: input.truckId,
    p_kind: input.kind,
    p_week_start: input.weekStart,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trucks/${input.truckId}`);
  return { ok: true };
}

export async function deleteLatestFeeRateVersionAction(
  truckId: string,
): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  const { data: hasStatements, error: checkError } = await gate.supabase.rpc(
    "truck_has_weekly_statements",
    { p_truck_id: truckId },
  );
  if (checkError) return { ok: false, error: checkError.message };
  if (hasStatements) {
    return {
      ok: false,
      error: "Cannot delete a rate version after weekly statements exist.",
    };
  }

  const { error } = await gate.supabase.rpc("delete_latest_fee_rate_version", {
    p_truck_id: truckId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trucks/${truckId}`);
  revalidatePath("/trucks");
  return { ok: true };
}
