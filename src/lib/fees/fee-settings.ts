import { tryPercentStringToBp, bpToPercentString } from "@/lib/fees/percent";
import { tryDollarStringToCents, centsToDollarString } from "@/lib/money/cents";
import { isTolsonPayableType, type TolsonPayableType } from "@/lib/trucks/tolson";

export const FEE_SETTINGS_MIGRATION =
  "Fee settings need migration 20261009180000_v31_fee_sheets_tolson.sql. It has not been applied yet.";

export const FEE_CSV_HEADER =
  "unit,fee_type,management_fee_pct,tolson_payable_pct,tolson_payable_fixed_weekly,legacy_retained_pct,legacy_retained_fixed_weekly,effective_from";

export type FeeModel = "lease_to_tolson" | "owner_management";

export type FeeFormInput = {
  feeModel: string;
  managementFeePct: string;
  tolsonPayablePct: string;
  tolsonFixedWeekly: string;
  legacyRetainedPct: string;
  legacyFixedWeekly: string;
  effectiveFrom: string;
};

export type ParsedFeeSetting = {
  feeModel: FeeModel;
  truckClass: "legacy_owned" | "third_party";
  managementFeeBp: number | null;
  managementEffectiveFrom: string | null;
  tolsonPayableType: TolsonPayableType | null;
  tolsonPayableValue: number | null;
  tolsonEffectiveFrom: string | null;
  legacyRetainedType: TolsonPayableType | null;
  legacyRetainedValue: number | null;
  legacyEffectiveFrom: string | null;
};

export function feeModelLabel(model: FeeModel): string {
  return model === "lease_to_tolson"
    ? "Legacy owned, lease fee to Tolson"
    : "Owner truck, management fee";
}

export function parseFeeModel(raw: string): FeeModel | null {
  const text = raw.trim().toLowerCase();
  if (text === "lease_to_tolson" || text === "lease" || text === "legacy owned, lease fee to tolson") {
    return "lease_to_tolson";
  }
  if (text === "owner_management" || text === "owner" || text === "owner truck, management fee") {
    return "owner_management";
  }
  return null;
}

function parseDate(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, error: "Effective from must be YYYY-MM-DD." };
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false, error: "Effective from is not a real date." };
  }
  return { ok: true, value: text };
}

export function parseFeeForm(input: FeeFormInput): { ok: true; value: ParsedFeeSetting } | { ok: false; error: string } {
  const model = parseFeeModel(input.feeModel);
  if (!model) return { ok: false, error: "Choose a fee type." };
  const dated = parseDate(input.effectiveFrom);
  if (!dated.ok) return dated;
  const feePct = input.managementFeePct.trim();
  let feeBp: number | null = null;
  if (feePct) {
    const parsed = tryPercentStringToBp(feePct);
    if (!parsed.ok) return { ok: false, error: "Enter the fee percent from 0 to 100." };
    feeBp = parsed.bp;
  }
  const assumedFee = feeBp ?? 1000;

  if (model === "lease_to_tolson") {
    if (input.legacyRetainedPct.trim() || input.legacyFixedWeekly.trim() || input.tolsonFixedWeekly.trim()) {
      return { ok: false, error: "The lease fee goes to Tolson. Leave the split and fixed amounts blank." };
    }
    let tolsonType: TolsonPayableType | null = null;
    let tolsonValue: number | null = null;
    const tolsonPct = input.tolsonPayablePct.trim() || feePct;
    if (tolsonPct) {
      const parsed = tryPercentStringToBp(tolsonPct);
      if (!parsed.ok) return { ok: false, error: "Enter the lease fee percent from 0 to 100." };
      tolsonType = "percent_of_gross";
      tolsonValue = parsed.bp;
    }
    return {
      ok: true,
      value: {
        feeModel: model,
        truckClass: "legacy_owned",
        managementFeeBp: null,
        managementEffectiveFrom: null,
        tolsonPayableType: tolsonType,
        tolsonPayableValue: tolsonValue,
        tolsonEffectiveFrom: dated.value,
        legacyRetainedType: null,
        legacyRetainedValue: null,
        legacyEffectiveFrom: null,
      },
    };
  }

  const legacyPct = input.legacyRetainedPct.trim();
  const tolsonPct = input.tolsonPayablePct.trim();
  const legacyFixed = input.legacyFixedWeekly.trim();
  const tolsonFixed = input.tolsonFixedWeekly.trim();
  if ((legacyPct && legacyFixed) || (tolsonPct && tolsonFixed)) {
    return { ok: false, error: "Use a percent or a fixed weekly amount, not both." };
  }
  if ((legacyPct && !tolsonPct) || (!legacyPct && tolsonPct)) {
    return { ok: false, error: "Legacy percent and Tolson percent must both be set, and they must add up to the fee." };
  }
  let legacyBp: number | null = null;
  let tolsonBp: number | null = null;
  if (legacyPct && tolsonPct) {
    const legacy = tryPercentStringToBp(legacyPct);
    const tolson = tryPercentStringToBp(tolsonPct);
    if (!legacy.ok || !tolson.ok) return { ok: false, error: "Enter split percents from 0 to 100." };
    if (legacy.bp + tolson.bp !== assumedFee) {
      return { ok: false, error: "Legacy percent and Tolson percent must add up to the fee." };
    }
    legacyBp = legacy.bp;
    tolsonBp = tolson.bp;
  }
  let legacyType: TolsonPayableType | null = legacyBp == null ? null : "percent_of_gross";
  let legacyValue: number | null = legacyBp;
  let tolsonType: TolsonPayableType | null = tolsonBp == null ? null : "percent_of_gross";
  let tolsonValue: number | null = tolsonBp;
  if (legacyFixed) {
    const parsed = tryDollarStringToCents(legacyFixed);
    if (!parsed.ok) return { ok: false, error: "Enter Legacy retained as a weekly dollar amount." };
    legacyType = "fixed_weekly";
    legacyValue = parsed.cents;
  }
  if (tolsonFixed) {
    const parsed = tryDollarStringToCents(tolsonFixed);
    if (!parsed.ok) return { ok: false, error: "Enter Tolson payable as a weekly dollar amount." };
    tolsonType = "fixed_weekly";
    tolsonValue = parsed.cents;
  }
  return {
    ok: true,
    value: {
      feeModel: model,
      truckClass: "third_party",
      managementFeeBp: feeBp,
      managementEffectiveFrom: dated.value,
      tolsonPayableType: tolsonType,
      tolsonPayableValue: tolsonValue,
      tolsonEffectiveFrom: dated.value,
      legacyRetainedType: legacyType,
      legacyRetainedValue: legacyValue,
      legacyEffectiveFrom: dated.value,
    },
  };
}

export type FeeSettingView = FeeFormInput & {
  truckId: string;
  unitNumber: string;
  feeReady: boolean;
};

export function blankFeeForm(model: FeeModel = "owner_management"): FeeFormInput {
  return {
    feeModel: model,
    managementFeePct: "",
    tolsonPayablePct: "",
    tolsonFixedWeekly: "",
    legacyRetainedPct: "",
    legacyFixedWeekly: "",
    effectiveFrom: "",
  };
}

export function viewFromStored(row: {
  id: string;
  unit_number: string;
  truck_class: string;
  fee_model?: string | null;
  management_fee_bp?: number | null;
  management_fee_effective_from?: string | null;
  tolson_payable_type?: string | null;
  tolson_payable_value?: number | null;
  tolson_payable_effective_from?: string | null;
  legacy_retained_type?: string | null;
  legacy_retained_value?: number | null;
  legacy_retained_effective_from?: string | null;
}): FeeSettingView {
  const model =
    parseFeeModel(row.fee_model ?? "") ??
    (row.truck_class === "legacy_owned" ? "lease_to_tolson" : "owner_management");
  const tolsonPct =
    row.tolson_payable_type === "percent_of_gross" && row.tolson_payable_value != null
      ? bpToPercentString(row.tolson_payable_value)
      : "";
  const tolsonFixed =
    row.tolson_payable_type === "fixed_weekly" && row.tolson_payable_value != null
      ? centsToDollarString(row.tolson_payable_value)
      : "";
  const legacyPct =
    isTolsonPayableType(row.legacy_retained_type) &&
    row.legacy_retained_type === "percent_of_gross" &&
    row.legacy_retained_value != null
      ? bpToPercentString(row.legacy_retained_value)
      : "";
  const legacyFixed =
    row.legacy_retained_type === "fixed_weekly" && row.legacy_retained_value != null
      ? centsToDollarString(row.legacy_retained_value)
      : "";
  const effective =
    row.management_fee_effective_from ||
    row.tolson_payable_effective_from ||
    row.legacy_retained_effective_from ||
    "";
  return {
    truckId: row.id,
    unitNumber: row.unit_number,
    feeReady: true,
    feeModel: model,
    managementFeePct: row.management_fee_bp != null ? bpToPercentString(row.management_fee_bp) : "",
    tolsonPayablePct: tolsonPct,
    tolsonFixedWeekly: tolsonFixed,
    legacyRetainedPct: legacyPct,
    legacyFixedWeekly: legacyFixed,
    effectiveFrom: effective ?? "",
  };
}

export type CsvFeeRow = {
  unit: string;
  truckId: string | null;
  form: FeeFormInput | null;
  error: string | null;
};

export function parseFeeCsv(text: string, trucks: Array<{ id: string; unitNumber: string }>): CsvFeeRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const header = lines[0]?.trim();
  if (header !== FEE_CSV_HEADER) {
    return [{ unit: "", truckId: null, form: null, error: `Use the template header: ${FEE_CSV_HEADER}` }];
  }
  return lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    const [unit = "", feeType = "", management = "", tolsonPct = "", tolsonFixed = "", legacyPct = "", legacyFixed = "", effective = ""] =
      cells;
    const truck = trucks.find((row) => row.unitNumber === unit.trim());
    const form: FeeFormInput = {
      feeModel: feeType,
      managementFeePct: management,
      tolsonPayablePct: tolsonPct,
      tolsonFixedWeekly: tolsonFixed,
      legacyRetainedPct: legacyPct,
      legacyFixedWeekly: legacyFixed,
      effectiveFrom: effective,
    };
    if (!truck) {
      return { unit: unit.trim(), truckId: null, form, error: `Unit ${unit.trim() || "(blank)"} is not in TRET.` };
    }
    const parsed = parseFeeForm(form);
    if (!parsed.ok) return { unit: truck.unitNumber, truckId: truck.id, form, error: parsed.error };
    return { unit: truck.unitNumber, truckId: truck.id, form, error: null };
  });
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
