import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { viewFromStored, type FeeSettingView } from "@/lib/fees/fee-settings";

const COLUMNS =
  "id, unit_number, truck_class, fee_model, management_fee_bp, management_fee_effective_from, tolson_payable_type, tolson_payable_value, tolson_payable_effective_from, legacy_retained_type, legacy_retained_value, legacy_retained_effective_from";

export async function loadFeeSettings(): Promise<{ ready: boolean; rows: FeeSettingView[]; error: string | null }> {
  const supabase = await createClient();
  const full = await supabase.from("trucks").select(COLUMNS).order("unit_number", { ascending: true });
  if (full.error) {
    const missing =
      isMissingSchemaError(full.error) ||
      /fee_model|management_fee_bp|legacy_retained|tolson_payable_effective/i.test(full.error.message);
    if (!missing) return { ready: false, rows: [], error: full.error.message };
    const base = await supabase
      .from("trucks")
      .select("id, unit_number, truck_class, tolson_payable_type, tolson_payable_value")
      .order("unit_number", { ascending: true });
    if (base.error) return { ready: false, rows: [], error: base.error.message };
    return {
      ready: false,
      error: null,
      rows: (base.data ?? []).map((row) => ({ ...viewFromStored(row), feeReady: false })),
    };
  }
  return { ready: true, error: null, rows: (full.data ?? []).map((row) => viewFromStored(row)) };
}
