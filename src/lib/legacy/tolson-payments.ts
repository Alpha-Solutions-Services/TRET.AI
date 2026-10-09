import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { loadStatements } from "@/lib/statements/queries";

export type TolsonPaymentRow = {
  id: string;
  paid_on: string;
  week_start: string;
  amount_cents: number;
  note: string | null;
};

export type TolsonWeekBalance = {
  ready: boolean;
  error: string | null;
  weekStart: string;
  owedCents: number;
  paidCents: number;
  balanceCents: number;
  payments: TolsonPaymentRow[];
};

export async function loadTolsonWeek(weekStart: string): Promise<TolsonWeekBalance> {
  const supabase = await createClient();
  const payments = await supabase
    .from("tolson_payments")
    .select("id, paid_on, week_start, amount_cents, note")
    .eq("week_start", weekStart)
    .order("paid_on", { ascending: false });
  if (payments.error) {
    const missing = isMissingSchemaError(payments.error) || /tolson_payments/i.test(payments.error.message);
    return {
      ready: false,
      error: missing
        ? "Tolson payments need migration 20261009180000_v31_fee_sheets_tolson.sql. It has not been applied yet."
        : payments.error.message,
      weekStart,
      owedCents: 0,
      paidCents: 0,
      balanceCents: 0,
      payments: [],
    };
  }
  const rows = payments.data ?? [];
  const paidCents = rows.reduce((sum, row) => sum + row.amount_cents, 0);
  let owedCents = 0;
  try {
    const statements = await loadStatements(weekStart);
    owedCents = statements.units.reduce((sum, unit) => sum + unit.tolsonPayableCents, 0);
  } catch {
    owedCents = 0;
  }
  return {
    ready: true,
    error: null,
    weekStart,
    owedCents,
    paidCents,
    balanceCents: owedCents - paidCents,
    payments: rows,
  };
}
