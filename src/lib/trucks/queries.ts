import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeeRuleKind, TruckClass } from "@/lib/fee-engine";
import { bpToPercentString } from "@/lib/fees/percent";
import { FEE_KIND_LABELS } from "@/lib/fees/kinds";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { isMissingGoogleSheetColumn, isMissingTolsonColumn } from "@/lib/trucks/fields";
import { isTolsonPayableType, type TolsonPayableType } from "@/lib/trucks/tolson";

const TRUCK_COLUMNS_FULL =
  "id, unit_number, name, truck_class, owner_name, active, google_sheet_url, tolson_payable_type, tolson_payable_value, created_at" as const;
const TRUCK_COLUMNS_NO_TOLSON =
  "id, unit_number, name, truck_class, owner_name, active, google_sheet_url, created_at" as const;
const TRUCK_COLUMNS_NO_SHEET =
  "id, unit_number, name, truck_class, owner_name, active, tolson_payable_type, tolson_payable_value, created_at" as const;
const TRUCK_COLUMNS_BASE =
  "id, unit_number, name, truck_class, owner_name, active, created_at" as const;

export type TruckRow = {
  id: string;
  unit_number: string;
  name: string;
  truck_class: TruckClass;
  owner_name: string | null;
  google_sheet_url: string | null;
  tolson_payable_type: TolsonPayableType | null;
  tolson_payable_value: number | null;
  active: boolean;
  created_at: string;
};

export type FeeRuleRow = {
  id: string;
  contract_id: string;
  kind: FeeRuleKind;
  rate_bp: number;
  base_pct_bp: number;
};

export type FeeContractWithRules = {
  id: string;
  truck_id: string;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
  fee_rules: FeeRuleRow[];
};

export function summarizeRules(rules: FeeRuleRow[]): string {
  if (rules.length === 0) return "No fee rules yet";
  return rules
    .map(
      (r) =>
        `${FEE_KIND_LABELS[r.kind]} ${bpToPercentString(r.rate_bp)}% on ${bpToPercentString(r.base_pct_bp)}%`,
    )
    .join("; ");
}

type TruckClient = SupabaseClient<Database>;

type TruckFlags = { googleSheetReady: boolean; tolsonReady: boolean };

type LooseTruck = {
  id: string;
  unit_number: string;
  name: string;
  truck_class: TruckClass;
  owner_name: string | null;
  active: boolean;
  created_at: string;
  google_sheet_url?: string | null;
  tolson_payable_type?: string | null;
  tolson_payable_value?: number | null;
};

function toTruckRow(row: LooseTruck, flags: TruckFlags): TruckRow {
  const type = flags.tolsonReady && isTolsonPayableType(row.tolson_payable_type) ? row.tolson_payable_type : null;
  const value =
    type != null && typeof row.tolson_payable_value === "number" ? row.tolson_payable_value : null;
  return {
    id: row.id,
    unit_number: row.unit_number,
    name: row.name,
    truck_class: row.truck_class,
    owner_name: row.owner_name,
    active: row.active,
    created_at: row.created_at,
    google_sheet_url: flags.googleSheetReady ? (row.google_sheet_url ?? null) : null,
    tolson_payable_type: type && value != null ? type : null,
    tolson_payable_value: type && value != null ? value : null,
  };
}

async function selectTruckRows(
  run: (columns: string) => PromiseLike<{ data: LooseTruck[] | null; error: { code?: string; message: string } | null }>,
): Promise<{ trucks: TruckRow[] } & TruckFlags> {
  const full = await run(TRUCK_COLUMNS_FULL);
  if (!full.error) {
    const flags = { googleSheetReady: true, tolsonReady: true };
    return { trucks: (full.data ?? []).map((row) => toTruckRow(row, flags)), ...flags };
  }

  const sheetMissing = isMissingGoogleSheetColumn(full.error);
  const tolsonMissing = isMissingTolsonColumn(full.error);
  if (!sheetMissing && !tolsonMissing) throw new Error(full.error.message);

  if (sheetMissing) {
    const noSheet = await run(TRUCK_COLUMNS_NO_SHEET);
    if (!noSheet.error) {
      const flags = { googleSheetReady: false, tolsonReady: true };
      return { trucks: (noSheet.data ?? []).map((row) => toTruckRow(row, flags)), ...flags };
    }
    if (!isMissingTolsonColumn(noSheet.error)) throw new Error(noSheet.error.message);
  } else {
    const noTolson = await run(TRUCK_COLUMNS_NO_TOLSON);
    if (!noTolson.error) {
      const flags = { googleSheetReady: true, tolsonReady: false };
      return { trucks: (noTolson.data ?? []).map((row) => toTruckRow(row, flags)), ...flags };
    }
    if (!isMissingGoogleSheetColumn(noTolson.error)) throw new Error(noTolson.error.message);
  }

  const base = await run(TRUCK_COLUMNS_BASE);
  if (base.error) throw new Error(base.error.message);
  const flags = { googleSheetReady: false, tolsonReady: false };
  return { trucks: (base.data ?? []).map((row) => toTruckRow(row, flags)), ...flags };
}

export async function listTrucks(): Promise<{ trucks: TruckRow[] } & TruckFlags> {
  const supabase = await createClient();
  return selectTruckRows((columns) =>
    supabase
      .from("trucks")
      .select(columns)
      .order("unit_number", { ascending: true }) as PromiseLike<{
      data: LooseTruck[] | null;
      error: { code?: string; message: string } | null;
    }>,
  );
}

export async function getTruck(id: string): Promise<({ truck: TruckRow } & TruckFlags) | null> {
  const supabase = await createClient();
  return selectTruckById(supabase, id);
}

export async function selectTruckById(
  supabase: TruckClient,
  id: string,
): Promise<({ truck: TruckRow } & TruckFlags) | null> {
  const loaded = await selectTruckRows((columns) => {
    const query = supabase.from("trucks").select(columns).eq("id", id).maybeSingle();
    return query.then((result) => ({
      data: result.data ? [result.data as unknown as LooseTruck] : [],
      error: result.error,
    }));
  });
  const truck = loaded.trucks[0];
  if (!truck) return null;
  return { truck, googleSheetReady: loaded.googleSheetReady, tolsonReady: loaded.tolsonReady };
}

export async function listContractsForTruck(
  truckId: string,
): Promise<FeeContractWithRules[]> {
  const supabase = await createClient();
  const { data: contracts, error } = await supabase
    .from("fee_contracts")
    .select("id, truck_id, effective_from, effective_to, note")
    .eq("truck_id", truckId)
    .order("effective_from", { ascending: false });
  if (error) throw new Error(error.message);
  if (!contracts || contracts.length === 0) return [];

  const ids = contracts.map((c) => c.id);
  const { data: rules, error: rulesError } = await supabase
    .from("fee_rules")
    .select("id, contract_id, kind, rate_bp, base_pct_bp")
    .in("contract_id", ids);
  if (rulesError) throw new Error(rulesError.message);

  const byContract = new Map<string, FeeRuleRow[]>();
  for (const rule of rules ?? []) {
    const list = byContract.get(rule.contract_id) ?? [];
    list.push(rule);
    byContract.set(rule.contract_id, list);
  }

  return contracts.map((row) => ({
    ...row,
    fee_rules: byContract.get(row.id) ?? [],
  }));
}

export function currentContract(
  contracts: FeeContractWithRules[],
  today = new Date().toISOString().slice(0, 10),
): FeeContractWithRules | null {
  const matches = contracts.filter((c) => {
    if (c.effective_from > today) return false;
    if (c.effective_to !== null && c.effective_to < today) return false;
    return true;
  });
  return matches[0] ?? null;
}

export async function latestChangeForTruck(truckId: string): Promise<{
  created_at: string;
  actor_email: string;
  action: string;
} | null> {
  const supabase = await createClient();

  const [truckLogsResult, contractsResult, expenseResult, overrideResult] = await Promise.all([
    supabase
      .from("change_log")
      .select("created_at, actor_email, action")
      .eq("entity_type", "truck")
      .eq("entity_id", truckId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("fee_contracts").select("id").eq("truck_id", truckId),
    supabase.from("truck_fixed_expenses").select("id").eq("truck_id", truckId),
    supabase.from("truck_fixed_expense_overrides").select("id").eq("truck_id", truckId),
  ]);

  const truckLogs = truckLogsResult.data;
  const contracts = contractsResult.data;

  const contractIds = (contracts ?? []).map((c) => c.id);
  const expenseIds = (expenseResult.data ?? []).map((row) => row.id);
  const overrideIds = (overrideResult.data ?? []).map((row) => row.id);

  async function latestLog(entityType: string, ids: string[]) {
    if (ids.length === 0) return null;
    const { data: logs } = await supabase
      .from("change_log")
      .select("created_at, actor_email, action")
      .eq("entity_type", entityType)
      .in("entity_id", ids)
      .order("created_at", { ascending: false })
      .limit(1);
    return logs?.[0] ?? null;
  }

  const [contractLog, expenseLog, overrideLog] = await Promise.all([
    latestLog("fee_contract", contractIds),
    latestLog("truck_fixed_expense", expenseIds),
    latestLog("truck_fixed_expense_override", overrideIds),
  ]);

  const candidates = [
    ...(truckLogs ?? []),
    ...(contractLog ? [contractLog] : []),
    ...(expenseLog ? [expenseLog] : []),
    ...(overrideLog ? [overrideLog] : []),
  ];
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return candidates[0]!;
}
