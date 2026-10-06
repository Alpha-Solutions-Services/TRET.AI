"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { normalizeEmail } from "@/lib/allowed-users";
import type { TruckClass } from "@/lib/fee-engine";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

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
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  const unitNumber = input.unitNumber.trim();
  const name = input.name.trim();
  const ownerName = input.ownerName.trim();

  if (!unitNumber) return { ok: false, error: "Unit number is required." };
  if (!name) return { ok: false, error: "Name is required." };
  if (input.truckClass !== "legacy_owned" && input.truckClass !== "third_party") {
    return { ok: false, error: "Choose Legacy-owned or Third-party." };
  }

  const { data, error } = await gate.supabase
    .from("trucks")
    .insert({
      unit_number: unitNumber,
      name,
      truck_class: input.truckClass,
      owner_name: ownerName || null,
      active: true,
    })
    .select("id, unit_number, name, truck_class, owner_name, active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "That unit number is already in use." };
    }
    return { ok: false, error: error.message };
  }

  await gate.supabase.from("change_log").insert({
    entity_type: "truck",
    entity_id: data.id,
    action: "create_truck",
    actor_email: gate.email,
    before_data: null,
    after_data: data as unknown as Json,
  });

  revalidatePath("/trucks");
  return { ok: true, id: data.id };
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

  if (!input.effectiveFrom) {
    return { ok: false, error: "Effective-from date is required." };
  }
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
