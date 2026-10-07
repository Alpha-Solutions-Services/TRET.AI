"use server";

import { revalidatePath } from "next/cache";
import { isAdminRole } from "@/lib/quickbooks/admin";
import { readQuickbooksConfig } from "@/lib/quickbooks/config";
import type { PostingAccounts } from "@/lib/quickbooks/journal";
import {
  confirmExpenseImport,
  confirmWeekPush,
  disconnectCompany,
  loadAccountChoices,
  plainError,
  previewWeekPush,
  pullExpensePreview,
  removeCategoryMapping,
  saveAccountChoices,
  type ImportSelection,
  type PushPreview,
} from "@/lib/quickbooks/live";
import type { PreviewRow } from "@/lib/quickbooks/map";
import type { QboAccount } from "@/lib/quickbooks/parse";
import { checkAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string };

async function adminGate(options?: { requireSetup?: boolean }) {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false as const, error: "You must be signed in." };
  if (!isAdminRole(access.role)) return { ok: false as const, error: "Only an admin can use QuickBooks." };
  const config = readQuickbooksConfig();
  if (options?.requireSetup !== false && !config) {
    return { ok: false as const, error: "QuickBooks not set up yet." };
  }
  const supabase = await createClient();
  return { ok: true as const, config, supabase, email: access.email };
}

function fail(err: unknown): Fail {
  return { ok: false, error: plainError(err) };
}

export async function previewQuickbooksImportAction(input: {
  from: string;
  to: string;
}): Promise<{ ok: true; rows: PreviewRow[]; truncated: boolean } | Fail> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  if (!gate.config) return { ok: false, error: "QuickBooks not set up yet." };
  try {
    const result = await pullExpensePreview(gate.supabase, gate.config, input.from, input.to);
    return { ok: true, rows: result.rows, truncated: result.truncated };
  } catch (err) {
    return fail(err);
  }
}

export async function confirmQuickbooksImportAction(input: {
  from: string;
  to: string;
  selections: ImportSelection[];
}): Promise<{ ok: true; message: string } | Fail> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  if (!gate.config) return { ok: false, error: "QuickBooks not set up yet." };
  if (input.selections.length === 0) return { ok: false, error: "Select at least one row." };
  try {
    const result = await confirmExpenseImport(
      gate.supabase,
      gate.config,
      input.from,
      input.to,
      input.selections,
    );
    revalidatePath("/integrations");
    revalidatePath("/operating-expenses");
    revalidatePath("/management");
    revalidatePath("/");
    return {
      ok: true,
      message: `Saved ${result.saved} expense${result.saved === 1 ? "" : "s"}. Skipped ${result.skipped}.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function loadQuickbooksAccountsAction(): Promise<{ ok: true; accounts: QboAccount[] } | Fail> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  if (!gate.config) return { ok: false, error: "QuickBooks not set up yet." };
  try {
    const accounts = await loadAccountChoices(gate.supabase, gate.config);
    return { ok: true, accounts };
  } catch (err) {
    return fail(err);
  }
}

export async function saveQuickbooksAccountsAction(
  accounts: PostingAccounts,
): Promise<{ ok: true; message: string } | Fail> {
  const gate = await adminGate({ requireSetup: false });
  if (!gate.ok) return gate;
  try {
    await saveAccountChoices(gate.supabase, accounts);
    revalidatePath("/integrations");
    return { ok: true, message: "Accounts saved. Nothing was posted." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteQuickbooksMappingAction(id: string): Promise<{ ok: true } | Fail> {
  const gate = await adminGate({ requireSetup: false });
  if (!gate.ok) return gate;
  try {
    await removeCategoryMapping(gate.supabase, id);
    revalidatePath("/integrations");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function previewQuickbooksPushAction(
  week: string,
): Promise<{ ok: true; preview: PushPreview } | Fail> {
  const gate = await adminGate({ requireSetup: false });
  if (!gate.ok) return gate;
  try {
    const preview = await previewWeekPush(gate.supabase, week);
    return { ok: true, preview };
  } catch (err) {
    return fail(err);
  }
}

export async function confirmQuickbooksPushAction(
  week: string,
): Promise<{ ok: true; message: string } | Fail> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  if (!gate.config) return { ok: false, error: "QuickBooks not set up yet." };
  try {
    const result = await confirmWeekPush(gate.supabase, gate.config, week, gate.email);
    revalidatePath("/integrations");
    if (!result.logged) {
      return {
        ok: true,
        message: `Posted journal entry ${result.qboId} for the week of ${result.weekStart}. The history row could not be saved. Keep this QuickBooks id.`,
      };
    }
    return {
      ok: true,
      message: `Posted journal entry ${result.qboId} for the week of ${result.weekStart}.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectQuickbooksAction(): Promise<{ ok: true; message: string } | Fail> {
  const gate = await adminGate({ requireSetup: false });
  if (!gate.ok) return gate;
  try {
    await disconnectCompany(gate.supabase);
    revalidatePath("/integrations");
    return { ok: true, message: "QuickBooks disconnected." };
  } catch (err) {
    return fail(err);
  }
}
