"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { normalizeEmail } from "@/lib/allowed-users";
import {
  FEE_SETTINGS_MIGRATION,
  parseFeeForm,
  type FeeFormInput,
} from "@/lib/fees/fee-settings";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";

export type FeeSaveRow = FeeFormInput & { truckId: string };

async function gate() {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false as const, error: "You must be signed in." };
  return { ok: true as const, email: normalizeEmail(access.email), supabase: await createClient() };
}

export async function saveFeeSettingsAction(rows: FeeSaveRow[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await gate();
  if (!auth.ok) return auth;
  if (rows.length === 0) return { ok: false, error: "Nothing to save." };

  for (const row of rows) {
    const parsed = parseFeeForm(row);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const value = parsed.value;
    const updated = await auth.supabase
      .from("trucks")
      .update({
        legacy_fee_bp: value.legacyFeeBp,
        tolson_lease_fee_bp: value.tolsonLeaseFeeBp,
        fee_lines_effective_from: value.effectiveFrom,
        management_fee_bp: value.legacyFeeBp + value.tolsonLeaseFeeBp,
        management_fee_effective_from: value.effectiveFrom,
        tolson_payable_type: "percent_of_gross",
        tolson_payable_value: value.tolsonLeaseFeeBp,
        tolson_payable_effective_from: value.effectiveFrom,
        legacy_retained_type: "percent_of_gross",
        legacy_retained_value: value.legacyFeeBp,
        legacy_retained_effective_from: value.effectiveFrom,
      })
      .eq("id", row.truckId);
    if (updated.error) {
      const missing =
        isMissingSchemaError(updated.error) ||
        /legacy_fee_bp|tolson_lease_fee_bp|fee_lines_effective_from|fee_model|management_fee_bp/i.test(updated.error.message);
      if (missing) return { ok: false, error: FEE_SETTINGS_MIGRATION };
      return { ok: false, error: updated.error.message };
    }
  }

  revalidatePath("/fee-settings");
  revalidatePath("/trucks");
  revalidatePath("/statements");
  return { ok: true };
}
