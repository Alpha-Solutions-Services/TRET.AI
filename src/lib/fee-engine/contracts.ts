import type { FeeContractRecord } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string, label: string): void {
  if (!DATE_RE.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD (got ${value})`);
  }
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`${label} is not a valid calendar date (got ${value})`);
  }
}

function coversDate(contract: FeeContractRecord, date: string): boolean {
  if (contract.effectiveFrom > date) return false;
  if (contract.effectiveTo !== null && contract.effectiveTo < date) return false;
  return true;
}

/**
 * Returns exactly one contract covering the date (inclusive bounds).
 * Throws if none or more than one match.
 */
export function findContractForDate(
  contracts: FeeContractRecord[],
  date: string,
): FeeContractRecord {
  assertIsoDate(date, "date");
  for (const c of contracts) {
    assertIsoDate(c.effectiveFrom, `contract ${c.id} effectiveFrom`);
    if (c.effectiveTo !== null) {
      assertIsoDate(c.effectiveTo, `contract ${c.id} effectiveTo`);
    }
  }

  const matches = contracts.filter((c) => coversDate(c, date));
  if (matches.length === 0) {
    throw new Error(`No fee contract covers date ${date}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `More than one fee contract covers date ${date}: ${matches.map((m) => m.id).join(", ")}`,
    );
  }
  return matches[0]!;
}
