export type FuelTotal = {
  unitNumber: string;
  count: number;
  gallonsMilli: number;
  amountCents: number;
  retailAmountCents: number;
};

export type TollTotal = {
  unitNumber: string;
  count: number;
  amountCents: number;
};

export function fuelWeekTotals(
  rows: Array<{
    unitNumber: string | null;
    weekStart: string | null;
    gallonsMilli: number | null;
    amountCents: number | null;
    retailAmountCents: number | null;
  }>,
  weekStart: string,
): FuelTotal[] {
  const map = new Map<string, FuelTotal>();
  for (const row of rows) {
    if (row.weekStart !== weekStart || !row.unitNumber) continue;
    const current = map.get(row.unitNumber) ?? {
      unitNumber: row.unitNumber,
      count: 0,
      gallonsMilli: 0,
      amountCents: 0,
      retailAmountCents: 0,
    };
    current.count += 1;
    current.gallonsMilli += row.gallonsMilli ?? 0;
    current.amountCents += row.amountCents ?? 0;
    current.retailAmountCents += row.retailAmountCents ?? row.amountCents ?? 0;
    map.set(row.unitNumber, current);
  }
  return [...map.values()].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
}

export function tollWeekTotals(
  rows: Array<{
    unitNumber: string | null;
    weekStart: string | null;
    amountCents: number | null;
  }>,
  weekStart: string,
): TollTotal[] {
  const map = new Map<string, TollTotal>();
  for (const row of rows) {
    if (row.weekStart !== weekStart || !row.unitNumber) continue;
    const current = map.get(row.unitNumber) ?? {
      unitNumber: row.unitNumber,
      count: 0,
      amountCents: 0,
    };
    current.count += 1;
    current.amountCents += row.amountCents ?? 0;
    map.set(row.unitNumber, current);
  }
  return [...map.values()].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
}
