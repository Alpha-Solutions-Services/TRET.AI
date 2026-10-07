import type { ChargedTo, FixedExpenseKind } from "@/lib/fixed-expenses/kinds";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

export type FixedExpenseDbRow = {
  id: string;
  truck_id: string;
  kind: FixedExpenseKind;
  weekly_amount_cents: number;
  charged_to: ChargedTo;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
};

export type FixedExpenseOverrideDbRow = {
  id: string;
  truck_id: string;
  kind: FixedExpenseKind;
  week_start: string;
  amount_cents: number;
  charged_to: ChargedTo;
  note: string | null;
};

export type FixedExpenseBundle = {
  ready: boolean;
  expenses: FixedExpenseDbRow[];
  overrides: FixedExpenseOverrideDbRow[];
  error: string | null;
};

export async function listFixedExpensesForTruck(truckId: string): Promise<FixedExpenseBundle> {
  const supabase = await createClient();
  const [expensesResult, overridesResult] = await Promise.all([
    supabase
      .from("truck_fixed_expenses")
      .select(
        "id, truck_id, kind, weekly_amount_cents, charged_to, effective_from, effective_to, note",
      )
      .eq("truck_id", truckId)
      .order("effective_from", { ascending: false }),
    supabase
      .from("truck_fixed_expense_overrides")
      .select("id, truck_id, kind, week_start, amount_cents, charged_to, note")
      .eq("truck_id", truckId)
      .order("week_start", { ascending: false }),
  ]);

  if (expensesResult.error || overridesResult.error) {
    const error = expensesResult.error ?? overridesResult.error!;
    if (isMissingSchemaError(error)) {
      return {
        ready: false,
        expenses: [],
        overrides: [],
        error: null,
      };
    }
    return {
      ready: false,
      expenses: [],
      overrides: [],
      error: error.message,
    };
  }

  return {
    ready: true,
    expenses: expensesResult.data ?? [],
    overrides: overridesResult.data ?? [],
    error: null,
  };
}
