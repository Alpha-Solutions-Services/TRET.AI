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
};

export async function listOperatingExpenses(): Promise<OperatingExpenseList> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mgmt_operating_expenses")
    .select("id, expense_date, category, amount_cents, note")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchemaError(error)) {
      return { ready: false, rows: [], error: null };
    }
    return { ready: false, rows: [], error: error.message };
  }

  return { ready: true, rows: data ?? [], error: null };
}
