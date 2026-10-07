import type { FeeRuleKind, TruckClass } from "@/lib/fee-engine";
import { bpToPercentString } from "@/lib/fees/percent";
import { FEE_KIND_LABELS } from "@/lib/fees/kinds";
import { createClient } from "@/lib/supabase/server";

export type TruckRow = {
  id: string;
  unit_number: string;
  name: string;
  truck_class: TruckClass;
  owner_name: string | null;
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

export async function listTrucks(): Promise<TruckRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trucks")
    .select("id, unit_number, name, truck_class, owner_name, active, created_at")
    .order("unit_number", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTruck(id: string): Promise<TruckRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trucks")
    .select("id, unit_number, name, truck_class, owner_name, active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
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
