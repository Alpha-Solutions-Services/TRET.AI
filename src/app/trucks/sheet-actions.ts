"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { normalizeEmail } from "@/lib/allowed-users";
import { mondayDateError } from "@/lib/fee-engine";
import { isFixedExpenseKind } from "@/lib/fixed-expenses/kinds";
import { centsToDollarString } from "@/lib/money/cents";
import { spreadsheetIdFromUrl, batchWriteRanges } from "@/lib/fuel-tolls/file/write-sheets";
import { loadTruckWorkbook } from "@/lib/sheets/read";
import { locateWeeklyExpenseCell, sheetExpenseLine, weeklyExpenseTab, type SheetExpenseKind } from "@/lib/sheets/fixed-expense-cells";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createFixedExpenseVersionAction } from "@/app/trucks/actions";

const MIGRATION = "Sheet writes need migration 20261009180000_v31_fee_sheets_tolson.sql. It has not been applied yet.";

async function gate() {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false as const, error: "You must be signed in." };
  return { ok: true as const, email: normalizeEmail(access.email), supabase: await createClient() };
}

export async function saveFixedExpenseAndQueueAction(input: {
  truckId: string;
  unitNumber: string;
  kind: SheetExpenseKind;
  effectiveFrom: string;
  weeklyAmountCents: number;
  chargedTo: "owner" | "management";
  sheetUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const monday = mondayDateError(input.effectiveFrom, "Effective from");
  if (monday) return { ok: false, error: monday };
  const line = sheetExpenseLine(input.kind);
  if (!line) return { ok: false, error: "Choose an expense." };

  if (isFixedExpenseKind(input.kind)) {
    const saved = await createFixedExpenseVersionAction({
      truckId: input.truckId,
      kind: input.kind,
      effectiveFrom: input.effectiveFrom,
      weeklyAmountCents: input.weeklyAmountCents,
      chargedTo: input.chargedTo,
      note: "",
    });
    if (!saved.ok) return saved;
  }

  const auth = await gate();
  if (!auth.ok) return auth;
  const bounds = weekBoundsForDate(input.effectiveFrom);
  let a1: string | null = null;
  if (input.sheetUrl) {
    const book = await loadTruckWorkbook({ unitNumber: input.unitNumber, googleSheetUrl: input.sheetUrl });
    const located = book.weeklyExpenses
      ? locateWeeklyExpenseCell(book.weeklyExpenses, bounds.start, bounds.end, line.names)
      : null;
    a1 = located?.a1 ?? null;
  }
  const queued = await auth.supabase.from("sheet_write_queue").insert({
    truck_id: input.truckId,
    unit_number: input.unitNumber,
    kind: input.kind,
    tab_title: weeklyExpenseTab(input.unitNumber),
    column_header: line.label,
    week_start: bounds.start,
    a1,
    new_value: centsToDollarString(input.weeklyAmountCents),
    status: "queued",
  });
  if (queued.error) {
    if (isMissingSchemaError(queued.error) || /sheet_write_queue/i.test(queued.error.message)) {
      return { ok: false, error: MIGRATION };
    }
    return { ok: false, error: queued.error.message };
  }
  revalidatePath(`/trucks/${input.truckId}`);
  return { ok: true };
}

export async function approveSheetWritesAction(input: {
  truckId: string;
  unitNumber: string;
  sheetUrl: string | null;
}): Promise<{ ok: true; wrote: number } | { ok: false; error: string }> {
  const auth = await gate();
  if (!auth.ok) return auth;
  const queued = await auth.supabase
    .from("sheet_write_queue")
    .select("id, tab_title, column_header, week_start, new_value, kind, a1")
    .eq("truck_id", input.truckId)
    .eq("status", "queued");
  if (queued.error) {
    if (isMissingSchemaError(queued.error)) return { ok: false, error: MIGRATION };
    return { ok: false, error: queued.error.message };
  }
  const rows = queued.data ?? [];
  if (rows.length === 0) return { ok: false, error: "Nothing is waiting to approve." };
  const spreadsheetId = spreadsheetIdFromUrl(input.sheetUrl);
  if (!spreadsheetId) return { ok: false, error: "Paste this truck's Google Sheet link before approving." };

  const book = await loadTruckWorkbook({ unitNumber: input.unitNumber, googleSheetUrl: input.sheetUrl });
  if (!book.weeklyExpenses) {
    return { ok: false, error: book.note ?? "Weekly Expenses was not found on this sheet." };
  }
  const writes: { id: string; tab: string; a1: string; value: string }[] = [];
  for (const row of rows) {
    const line = sheetExpenseLine(row.kind);
    const bounds = weekBoundsForDate(row.week_start);
    const located = line
      ? locateWeeklyExpenseCell(book.weeklyExpenses, bounds.start, bounds.end, line.names)
      : null;
    if (!located) {
      await auth.supabase
        .from("sheet_write_queue")
        .update({ status: "failed", error: "That week or column is not on the Weekly Expenses tab." })
        .eq("id", row.id);
      continue;
    }
    writes.push({ id: row.id, tab: row.tab_title, a1: located.a1, value: row.new_value });
  }
  if (writes.length === 0) return { ok: false, error: "None of the queued cells were found on the sheet." };
  const wrote = await batchWriteRanges({
    spreadsheetId,
    data: writes.map((row) => ({ tab: row.tab, a1: row.a1, value: row.value })),
  });
  if (!wrote.ok) return wrote;
  const ids = writes.map((row) => row.id);
  await auth.supabase
    .from("sheet_write_queue")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: auth.email, error: null })
    .in("id", ids);
  revalidatePath(`/trucks/${input.truckId}`);
  return { ok: true, wrote: writes.length };
}
