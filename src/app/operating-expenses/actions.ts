"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { assertIsoDate } from "@/lib/fee-engine";
import { canonicalLegacyCategory } from "@/lib/legacy/expenses";
import { centsInputError } from "@/lib/money/cents";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function requireAccess() {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false as const, error: "You must be signed in." };
  }
  return { ok: true as const, supabase: await createClient() };
}

export async function createOperatingExpenseAction(input: {
  expenseDate: string;
  category: string;
  amountCents: number;
  note: string;
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  try {
    assertIsoDate(input.expenseDate, "Date");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Date is required." };
  }

  const category = canonicalLegacyCategory(input.category);
  if (!category) return { ok: false, error: "Choose a category from the list." };

  const centsError = centsInputError(input.amountCents);
  if (centsError) return { ok: false, error: centsError };

  const { data, error } = await gate.supabase.rpc("create_mgmt_operating_expense", {
    p_expense_date: input.expenseDate,
    p_category: category,
    p_amount_cents: input.amountCents,
    p_note: input.note.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/operating-expenses");
  revalidatePath("/");
  return { ok: true, id: data };
}

export async function updateOperatingExpenseAction(input: {
  id: string;
  expenseDate: string;
  category: string;
  amountCents: number;
  note: string;
}): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;
  if (!input.id) return { ok: false, error: "Expense is required." };

  try {
    assertIsoDate(input.expenseDate, "Date");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Date is required." };
  }

  const category = canonicalLegacyCategory(input.category);
  if (!category) return { ok: false, error: "Choose a category from the list." };

  const centsError = centsInputError(input.amountCents);
  if (centsError) return { ok: false, error: centsError };

  const { error } = await gate.supabase.rpc("update_mgmt_operating_expense", {
    p_id: input.id,
    p_expense_date: input.expenseDate,
    p_category: category,
    p_amount_cents: input.amountCents,
    p_note: input.note.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/operating-expenses");
  revalidatePath("/");
  return { ok: true, id: input.id };
}

export async function deleteOperatingExpenseAction(id: string): Promise<ActionResult> {
  const gate = await requireAccess();
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.rpc("delete_mgmt_operating_expense", { p_id: id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/operating-expenses");
  revalidatePath("/");
  return { ok: true };
}
