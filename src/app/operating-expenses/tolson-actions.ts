"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { normalizeEmail } from "@/lib/allowed-users";
import { assertIsoDate, mondayDateError } from "@/lib/fee-engine";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";

const MIGRATION =
  "Tolson payments need migration 20261009180000_v31_fee_sheets_tolson.sql. It has not been applied yet.";

export async function saveTolsonPaymentAction(input: {
  paidOn: string;
  weekStart: string;
  amountCents: number;
  note: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false, error: "You must be signed in." };
  try {
    assertIsoDate(input.paidOn, "Date");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Date is required." };
  }
  const monday = mondayDateError(input.weekStart, "Week covered");
  if (monday) return monday ? { ok: false, error: monday } : { ok: false, error: "Week covered must be a Monday." };
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { ok: false, error: "Enter a dollar amount." };
  }
  const supabase = await createClient();
  const inserted = await supabase.from("tolson_payments").insert({
    paid_on: input.paidOn,
    week_start: input.weekStart,
    amount_cents: input.amountCents,
    note: input.note.trim() || null,
    actor_email: normalizeEmail(access.email),
  });
  if (inserted.error) {
    if (isMissingSchemaError(inserted.error) || /tolson_payments/i.test(inserted.error.message)) {
      return { ok: false, error: MIGRATION };
    }
    return { ok: false, error: inserted.error.message };
  }
  revalidatePath("/operating-expenses");
  return { ok: true };
}
