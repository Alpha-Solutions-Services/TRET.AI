"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { canonicalLegacyCategory } from "@/lib/legacy/expenses";
import { loadManagementCardSummary } from "@/lib/legacy/queries";
import { loadOverview } from "@/lib/overview/queries";
import { isAdminRole } from "@/lib/quickbooks/admin";
import { buildFilePreview, parseQuickbooksExpenseCsv, type FileCategoryMap, type FilePreviewRow } from "@/lib/quickbooks/file-import";
import { buildJournalCsv, fileAccountsComplete, type FileAccountNames } from "@/lib/quickbooks/file-journal";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string };

async function adminClient() {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false as const, error: "You must be signed in." };
  if (!isAdminRole(access.role)) {
    return { ok: false as const, error: "Only an admin can export or import QuickBooks files." };
  }
  return { ok: true as const, supabase: await createClient() };
}

export async function saveQuickbooksFileAccountsAction(
  accounts: FileAccountNames,
): Promise<{ ok: true; message: string } | Fail> {
  const gate = await adminClient();
  if (!gate.ok) return gate;
  if (!fileAccountsComplete(accounts)) return { ok: false, error: "Enter all four account names." };
  const { error } = await gate.supabase.from("import_settings").upsert({
    key: "qbo_file_accounts",
    value_text: JSON.stringify({
      feeDebitName: accounts.feeDebitName.trim(),
      feeCreditName: accounts.feeCreditName.trim(),
      tolsonDebitName: accounts.tolsonDebitName.trim(),
      tolsonCreditName: accounts.tolsonCreditName.trim(),
    }),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/integrations");
  return { ok: true, message: "Account names saved." };
}

export async function exportQuickbooksJournalAction(
  week: string,
): Promise<{ ok: true; filename: string; csv: string } | Fail> {
  const gate = await adminClient();
  if (!gate.ok) return gate;
  let weekStart = "";
  try {
    weekStart = weekBoundsForDate(week).start;
  } catch {
    return { ok: false, error: "Choose a week." };
  }
  const stored = await gate.supabase
    .from("import_settings")
    .select("value_text")
    .eq("key", "qbo_file_accounts")
    .maybeSingle();
  let accounts: FileAccountNames | null = null;
  if (stored.data?.value_text) {
    try {
      accounts = JSON.parse(stored.data.value_text) as FileAccountNames;
    } catch {
      accounts = null;
    }
  }
  if (!accounts || !fileAccountsComplete(accounts)) {
    return { ok: false, error: "Save the four QuickBooks account names first." };
  }
  const overview = await loadOverview(weekStart);
  const cards = await loadManagementCardSummary(weekStart, overview.insOuts, overview.operatingExpenses);
  if (overview.error) return { ok: false, error: overview.error };
  let csv: string | null = null;
  try {
    csv = buildJournalCsv({
      weekStart,
      incomeCents: cards.incomeCents,
      tolsonCents: cards.tolsonPayableCents,
      accounts,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the journal file." };
  }
  if (!csv) return { ok: false, error: "Nothing to export for this week. Income and Tolson payable are both $0.00." };
  return { ok: true, filename: `tret-journal-${weekStart}.csv`, csv };
}

async function readMaps(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<FileCategoryMap[]> {
  const stored = await supabase
    .from("import_settings")
    .select("value_text")
    .eq("key", "qbo_file_category_map")
    .maybeSingle();
  if (!stored.data?.value_text) return [];
  try {
    const parsed = JSON.parse(stored.data.value_text) as FileCategoryMap[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function previewQuickbooksFileAction(input: {
  csvText: string;
}): Promise<{ ok: true; rows: FilePreviewRow[] } | Fail> {
  const gate = await adminClient();
  if (!gate.ok) return gate;
  let drafts;
  try {
    drafts = parseQuickbooksExpenseCsv(input.csvText);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not read that CSV." };
  }
  const maps = await readMaps(gate.supabase);
  const hashes = drafts.map((row) => row.hash);
  const existing = new Set<string>();
  if (hashes.length > 0) {
    const saved = await gate.supabase.from("mgmt_operating_expenses").select("qbo_source_id").in("qbo_source_id", hashes);
    if (!saved.error) {
      for (const row of saved.data ?? []) {
        if (row.qbo_source_id) existing.add(row.qbo_source_id);
      }
    }
  }
  return { ok: true, rows: buildFilePreview(drafts, maps, existing) };
}

export async function confirmQuickbooksFileAction(input: {
  csvText: string;
  selections: Array<{ hash: string; category: string; remember: "vendor" | "account" | "none" }>;
}): Promise<{ ok: true; message: string } | Fail> {
  const gate = await adminClient();
  if (!gate.ok) return gate;
  if (input.selections.length === 0) return { ok: false, error: "Choose at least one row." };
  let drafts;
  try {
    drafts = parseQuickbooksExpenseCsv(input.csvText);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not read that CSV." };
  }
  const byHash = new Map(drafts.map((row) => [row.hash, row]));
  const maps = await readMaps(gate.supabase);
  let saved = 0;
  let skipped = 0;
  for (const selection of input.selections) {
    const row = byHash.get(selection.hash);
    const category = canonicalLegacyCategory(selection.category);
    if (!row || row.skipReason || !category || row.amountCents <= 0) {
      skipped += 1;
      continue;
    }
    const note = [row.vendorName, row.accountName, row.memo].filter(Boolean).join(". ").slice(0, 240);
    const result = await gate.supabase.rpc("import_quickbooks_file_expense", {
      p_expense_date: row.date,
      p_category: category,
      p_amount_cents: row.amountCents,
      p_note: note || null,
      p_qbo_source_id: row.hash,
    });
    if (result.error) {
      if (isMissingSchemaError(result.error)) {
        return { ok: false, error: "Apply the v0.0.0.26 migration before saving QuickBooks file rows." };
      }
      return { ok: false, error: result.error.message };
    }
    const payload = result.data as { inserted?: boolean } | null;
    if (payload?.inserted) saved += 1;
    else skipped += 1;
    if (selection.remember === "vendor" && row.vendorName) {
      remember(maps, "vendor", row.vendorName, category);
    }
    if (selection.remember === "account" && row.accountName) {
      remember(maps, "account", row.accountName, category);
    }
  }
  await gate.supabase.from("import_settings").upsert({
    key: "qbo_file_category_map",
    value_text: JSON.stringify(maps),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/integrations");
  revalidatePath("/operating-expenses");
  revalidatePath("/management");
  revalidatePath("/");
  return {
    ok: true,
    message: `Saved ${saved} expense${saved === 1 ? "" : "s"}. Skipped ${skipped}.`,
  };
}

function remember(maps: FileCategoryMap[], kind: "vendor" | "account", name: string, category: string) {
  const key = name.trim().toLowerCase();
  const index = maps.findIndex((row) => row.kind === kind && row.name.trim().toLowerCase() === key);
  if (index >= 0) maps[index] = { kind, name: name.trim(), category };
  else maps.push({ kind, name: name.trim(), category });
}
