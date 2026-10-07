import { expenseTotalCents, monthBounds } from "@/lib/legacy/expenses";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

export type OperatingExpenseRow = {
  id: string;
  expense_date: string;
  category: string;
  amount_cents: number;
  note: string | null;
};

export type OperatingExpenseList = {
  ready: boolean;
  rows: OperatingExpenseRow[];
  error: string | null;
  month: string | null;
  totalCents: number;
};

export async function listOperatingExpenses(month?: string): Promise<OperatingExpenseList> {
  const supabase = await createClient();
  let query = supabase
    .from("mgmt_operating_expenses")
    .select("id, expense_date, category, amount_cents, note")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (month) {
    const bounds = monthBounds(month);
    query = query.gte("expense_date", bounds.start).lt("expense_date", bounds.endExclusive);
  }
  const { data, error } = await query;

  if (error) {
    if (isMissingSchemaError(error)) {
      return { ready: false, rows: [], error: null, month: month ?? null, totalCents: 0 };
    }
    return { ready: false, rows: [], error: error.message, month: month ?? null, totalCents: 0 };
  }

  const rows = data ?? [];
  return {
    ready: true,
    rows,
    error: null,
    month: month ?? null,
    totalCents: expenseTotalCents(rows),
  };
}
