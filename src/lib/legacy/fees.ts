import { roundHalfUpDivide } from "@/lib/fee-engine";
import { unitKey } from "@/lib/sheets/mismatch";

/** 10 percent. Org default until Settings saves another value. */
export const DEFAULT_MANAGEMENT_FEE_BP = 1000;

export type FeeSource = "saved_amount" | "saved_percent" | "truck_week" | "org";

export type StoredLoadFee = {
  unitKey: string;
  loadKey: string;
  feeCents: number | null;
  feeBp: number | null;
};

export type StoredTruckWeekFee = {
  unitKey: string;
  feeBp: number;
};

export type LegacyLoadLine = {
  unitNumber: string;
  unitKey: string;
  truckName: string;
  loadId: string;
  loadKey: string;
  rateCents: number;
  feeCents: number;
  feeBp: number | null;
  source: FeeSource;
};

export type LegacyTruckEarnings = {
  unitNumber: string;
  unitKey: string;
  truckName: string;
  insCents: number;
  feeCents: number;
  loads: LegacyLoadLine[];
};

export type LegacyEarnings = {
  trucks: LegacyTruckEarnings[];
  fleetInsCents: number;
  fleetFeeCents: number;
};

export function loadKey(loadId: string): string {
  return loadId.trim().toLowerCase();
}

/** Integer cents. Half-up. 275000 cents at 1000 bp is 27500 cents. */
export function feeCentsFromRate(rateCents: number, feeBp: number): number {
  if (!Number.isInteger(rateCents) || rateCents < 0) {
    throw new Error("Rate must be zero or more cents");
  }
  if (!Number.isInteger(feeBp) || feeBp < 0 || feeBp > 10000) {
    throw new Error("Management fee percent is out of range");
  }
  return roundHalfUpDivide(BigInt(rateCents) * BigInt(feeBp), BigInt(10000));
}

export function feeSourceLabel(source: FeeSource): string {
  if (source === "saved_amount") return "Saved amount";
  if (source === "saved_percent") return "Saved percent";
  if (source === "truck_week") return "This truck, this week";
  return "Default";
}

export function buildLegacyEarnings(input: {
  trucks: Array<{
    unitNumber: string;
    truckName: string;
    readable: boolean;
    ledgerLoads: Array<{ loadId: string; rateCents: number | null }>;
  }>;
  orgFeeBp: number;
  truckWeeks: StoredTruckWeekFee[];
  loadFees: StoredLoadFee[];
}): LegacyEarnings {
  const orgFeeBp = normalizeBp(input.orgFeeBp);
  const truckWeek = new Map(input.truckWeeks.map((row) => [row.unitKey, row.feeBp]));
  const storedLoads = new Map(input.loadFees.map((row) => [`${row.unitKey}\n${row.loadKey}`, row]));
  const trucks: LegacyTruckEarnings[] = [];
  let fleetInsCents = 0;
  let fleetFeeCents = 0;

  for (const truck of input.trucks) {
    if (!truck.readable) continue;
    const key = unitKey(truck.unitNumber);
    const lines: LegacyLoadLine[] = [];
    let insCents = 0;
    let feeCents = 0;
    for (const load of truck.ledgerLoads) {
      if (load.rateCents == null || !Number.isInteger(load.rateCents) || load.rateCents < 0) continue;
      if (!load.loadId.trim()) continue;
      const lk = loadKey(load.loadId);
      const resolved = resolveFee(
        load.rateCents,
        orgFeeBp,
        truckWeek.get(key),
        storedLoads.get(`${key}\n${lk}`),
      );
      insCents += load.rateCents;
      feeCents += resolved.feeCents;
      lines.push({
        unitNumber: truck.unitNumber,
        unitKey: key,
        truckName: truck.truckName,
        loadId: load.loadId,
        loadKey: lk,
        rateCents: load.rateCents,
        feeCents: resolved.feeCents,
        feeBp: resolved.feeBp,
        source: resolved.source,
      });
    }
    fleetInsCents += insCents;
    fleetFeeCents += feeCents;
    trucks.push({
      unitNumber: truck.unitNumber,
      unitKey: key,
      truckName: truck.truckName,
      insCents,
      feeCents,
      loads: lines,
    });
  }

  return { trucks, fleetInsCents, fleetFeeCents };
}

function normalizeBp(bp: number): number {
  if (!Number.isInteger(bp) || bp < 0 || bp > 10000) return DEFAULT_MANAGEMENT_FEE_BP;
  return bp;
}

function resolveFee(
  rateCents: number,
  orgFeeBp: number,
  truckBp: number | undefined,
  stored: StoredLoadFee | undefined,
): { feeCents: number; feeBp: number | null; source: FeeSource } {
  if (stored?.feeCents != null) {
    return { feeCents: stored.feeCents, feeBp: stored.feeBp, source: "saved_amount" };
  }
  if (stored?.feeBp != null) {
    return {
      feeCents: feeCentsFromRate(rateCents, stored.feeBp),
      feeBp: stored.feeBp,
      source: "saved_percent",
    };
  }
  if (truckBp != null && Number.isInteger(truckBp) && truckBp >= 0 && truckBp <= 10000) {
    return {
      feeCents: feeCentsFromRate(rateCents, truckBp),
      feeBp: truckBp,
      source: "truck_week",
    };
  }
  return {
    feeCents: feeCentsFromRate(rateCents, orgFeeBp),
    feeBp: orgFeeBp,
    source: "org",
  };
}
