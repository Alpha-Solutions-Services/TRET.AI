import { bpToPercentString, tryPercentStringToBp } from "@/lib/fees/percent";
import { seededFeeRates, type FeeRatePair } from "@/lib/fees/two-lines";

export const FEE_SETTINGS_MIGRATION =
  "Fee settings need migration 20261011230000_v34_fee_lines.sql. It has not been applied yet.";

export const FEE_CSV_HEADER = "unit,legacy_fee_pct,tolson_lease_fee_pct,effective_from";

export type FeeFormInput = {
  legacyFeePct: string;
  tolsonLeaseFeePct: string;
  effectiveFrom: string;
};

export type ParsedFeeSetting = FeeRatePair & {
  effectiveFrom: string | null;
};

export function parseFeeForm(input: FeeFormInput): { ok: true; value: ParsedFeeSetting } | { ok: false; error: string } {
  const legacy = tryPercentStringToBp(input.legacyFeePct.trim() === "" ? "0" : input.legacyFeePct);
  const tolson = tryPercentStringToBp(input.tolsonLeaseFeePct.trim() === "" ? "0" : input.tolsonLeaseFeePct);
  if (!legacy.ok) return { ok: false, error: "Enter the Legacy fee percent from 0 to 100." };
  if (!tolson.ok) return { ok: false, error: "Enter the Tolson lease fee percent from 0 to 100." };
  const dated = parseDate(input.effectiveFrom);
  if (!dated.ok) return dated;
  return {
    ok: true,
    value: { legacyFeeBp: legacy.bp, tolsonLeaseFeeBp: tolson.bp, effectiveFrom: dated.value },
  };
}

export function feeTotalLabel(legacyPct: string, tolsonPct: string): string {
  const legacy = tryPercentStringToBp(legacyPct.trim() === "" ? "0" : legacyPct);
  const tolson = tryPercentStringToBp(tolsonPct.trim() === "" ? "0" : tolsonPct);
  if (!legacy.ok || !tolson.ok) return "";
  return bpToPercentString(legacy.bp + tolson.bp);
}

export type FeeSettingView = FeeFormInput & {
  truckId: string;
  unitNumber: string;
  feeReady: boolean;
};

export function blankFeeForm(): FeeFormInput {
  return {
    legacyFeePct: bpToPercentString(seededFeeRates("11").legacyFeeBp),
    tolsonLeaseFeePct: bpToPercentString(seededFeeRates("11").tolsonLeaseFeeBp),
    effectiveFrom: "2026-10-05",
  };
}

export function viewFromStored(row: {
  id: string;
  unit_number: string;
  legacy_fee_bp?: number | null;
  tolson_lease_fee_bp?: number | null;
  fee_lines_effective_from?: string | null;
}): FeeSettingView {
  const seed = seededFeeRates(row.unit_number);
  const legacy = row.legacy_fee_bp ?? seed.legacyFeeBp;
  const tolson = row.tolson_lease_fee_bp ?? seed.tolsonLeaseFeeBp;
  return {
    truckId: row.id,
    unitNumber: row.unit_number,
    feeReady: true,
    legacyFeePct: bpToPercentString(legacy),
    tolsonLeaseFeePct: bpToPercentString(tolson),
    effectiveFrom: row.fee_lines_effective_from ?? "2026-10-05",
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
    const [unit = "", legacy = "", tolson = "", effective = ""] = cells;
    const truck = trucks.find((row) => row.unitNumber === unit.trim());
    const form: FeeFormInput = {
      legacyFeePct: legacy,
      tolsonLeaseFeePct: tolson,
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

function parseDate(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, error: "Effective from must be YYYY-MM-DD." };
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    return { ok: false, error: "Effective from is not a real date." };
  }
  return { ok: true, value: text };
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
