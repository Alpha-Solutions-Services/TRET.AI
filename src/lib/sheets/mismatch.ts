import { canonicalLoadId, loadMatchKey } from "@/lib/loads/load-id";

export function sheetLedgerRefs(
  rows: Array<{
    unitNumber: string;
    readable: boolean;
    ledgerLoads: Array<{ loadId: string; rateCents: number | null }>;
  }>,
): { sheet: SheetLedgerRef[]; readableUnitKeys: string[] } {
  const sheet: SheetLedgerRef[] = [];
  const readableUnitKeys: string[] = [];
  for (const row of rows) {
    if (!row.readable) continue;
    readableUnitKeys.push(unitKey(row.unitNumber));
    for (const load of row.ledgerLoads) {
      sheet.push({ unitNumber: row.unitNumber, loadId: load.loadId, rateCents: load.rateCents });
    }
  }
  return { sheet, readableUnitKeys };
}

export type SheetLedgerRef = {
  unitNumber: string;
  loadId: string;
  rateCents: number | null;
};

export type VektorLedgerRef = {
  unitNumber: string;
  loadId: string;
  rateCents: number;
};

export type SheetMismatch = {
  rule: "sheet_load_missing" | "sheet_rate_diff";
  severity: "Warn";
  unitNumber: string;
  loadId: string;
  message: string;
  ref: string;
};

export function unitKey(unit: string): string {
  const digits = unit.replace(/\D/g, "").replace(/^0+/, "");
  return digits || unit.trim().toLowerCase();
}

function loadKey(loadId: string): string {
  return loadMatchKey(loadId);
}

function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole}.${frac}`;
}

/**
 * Sheet load ledger rows that are missing from `loads`, or whose rate differs.
 * A Vektor row with no matching sheet load is not an alert.
 */
export function compareSheetLoads(input: {
  weekStart: string;
  sheet: SheetLedgerRef[];
  vektor: VektorLedgerRef[];
}): SheetMismatch[] {
  const byUnit = new Map<string, Map<string, number[]>>();
  for (const row of input.vektor) {
    if (!row.loadId.trim()) continue;
    const unit = unitKey(row.unitNumber);
    const loads = byUnit.get(unit) ?? new Map<string, number[]>();
    const key = loadKey(row.loadId);
    const rates = loads.get(key) ?? [];
    rates.push(row.rateCents);
    loads.set(key, rates);
    byUnit.set(unit, loads);
  }

  const seen = new Set<string>();
  const mismatches: SheetMismatch[] = [];
  for (const row of input.sheet) {
    if (!row.loadId.trim()) continue;
    const key = `${unitKey(row.unitNumber)}|${loadKey(row.loadId)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rates = byUnit.get(unitKey(row.unitNumber))?.get(loadKey(row.loadId));
    if (!rates || rates.length === 0) {
      mismatches.push({
        rule: "sheet_load_missing",
        severity: "Warn",
        unitNumber: row.unitNumber,
        loadId: canonicalLoadId(row.loadId),
        ref: `sheet:${input.weekStart}:${unitKey(row.unitNumber)}:${loadKey(row.loadId)}`,
        message: `Unit ${row.unitNumber} sheet load ${canonicalLoadId(row.loadId)} (week ${input.weekStart}) is not in the Vektor loads ledger.`,
      });
      continue;
    }
    if (row.rateCents == null) continue;
    if (rates.some((rate) => rate === row.rateCents)) continue;
    const listed = rates.map((rate) => dollars(rate)).join(", ");
    mismatches.push({
      rule: "sheet_rate_diff",
      severity: "Warn",
      unitNumber: row.unitNumber,
      loadId: canonicalLoadId(row.loadId),
      ref: `sheet:${input.weekStart}:${unitKey(row.unitNumber)}:${loadKey(row.loadId)}:${row.rateCents}`,
      message: `Unit ${row.unitNumber} sheet load ${canonicalLoadId(row.loadId)} rate is ${dollars(row.rateCents)} and the Vektor loads ledger has ${listed}.`,
    });
  }
  return mismatches;
}
