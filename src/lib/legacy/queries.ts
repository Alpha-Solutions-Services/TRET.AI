import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MANAGEMENT_FEE_BP } from "@/lib/legacy/fees";
import { expenseTotalCents, monthBounds } from "@/lib/legacy/expenses";

export type LegacyFeeState = {
  ready: boolean;
  orgFeeBp: number;
  truckWeeks: Array<{ unitKey: string; unitNumber: string; feeBp: number }>;
  loadFees: Array<{
    unitKey: string;
    loadKey: string;
    unitNumber: string;
    loadId: string;
    feeCents: number | null;
    feeBp: number | null;
  }>;
  error: string | null;
};

const EMPTY_FEES: LegacyFeeState = {
  ready: false,
  orgFeeBp: DEFAULT_MANAGEMENT_FEE_BP,
  truckWeeks: [],
  loadFees: [],
  error: null,
};

export async function loadLegacyOrgFee(): Promise<{
  ready: boolean;
  feeBp: number;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("legacy_org_settings")
    .select("management_fee_bp")
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) {
      return { ready: false, feeBp: DEFAULT_MANAGEMENT_FEE_BP, error: null };
    }
    return { ready: false, feeBp: DEFAULT_MANAGEMENT_FEE_BP, error: error.message };
  }
  return {
    ready: true,
    feeBp: asFeeBp(data?.management_fee_bp),
    error: null,
  };
}

export async function loadLegacyFeeState(weekStart: string): Promise<LegacyFeeState> {
  const supabase = await createClient();
  const [org, weeks, loads] = await Promise.all([
    supabase.from("legacy_org_settings").select("management_fee_bp").limit(1).maybeSingle(),
    supabase
      .from("legacy_truck_week_fees")
      .select("unit_key, unit_number, fee_bp")
      .eq("week_start", weekStart),
    supabase
      .from("legacy_load_fees")
      .select("unit_key, load_key, unit_number, load_id, fee_cents, fee_bp")
      .eq("week_start", weekStart),
  ]);

  const missing = [org.error, weeks.error, loads.error].find(
    (error) => error && isMissingSchemaError(error),
  );
  if (missing) return EMPTY_FEES;

  const failed = org.error ?? weeks.error ?? loads.error;
  if (failed) {
    return { ...EMPTY_FEES, error: failed.message };
  }

  return {
    ready: true,
    orgFeeBp: asFeeBp(org.data?.management_fee_bp),
    truckWeeks: (weeks.data ?? []).map((row) => ({
      unitKey: row.unit_key,
      unitNumber: row.unit_number,
      feeBp: row.fee_bp,
    })),
    loadFees: (loads.data ?? []).map((row) => ({
      unitKey: row.unit_key,
      loadKey: row.load_key,
      unitNumber: row.unit_number,
      loadId: row.load_id,
      feeCents: row.fee_cents,
      feeBp: row.fee_bp,
    })),
    error: null,
  };
}

export { expenseTotalCents, monthBounds };

function asFeeBp(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10000) {
    return value;
  }
  return DEFAULT_MANAGEMENT_FEE_BP;
}
