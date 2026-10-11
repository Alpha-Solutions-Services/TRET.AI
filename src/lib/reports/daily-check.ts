export type DailyCheckSummary = {
  loadsNew: number;
  loadsChanged: number;
  loadsCancelled: number;
  fuelAdded: number;
  fuelDuplicates: number;
  fuelUnlinked: number;
  tollsAdded: number;
  receiptsFound: number;
  truckMismatches: string[];
};

export type DailyCheckInput = {
  loads: readonly { change: "new" | "changed" | "cancelled" }[];
  fuel: readonly { status: "added" | "duplicate" | "unlinked" }[];
  tollsAdded: number;
  receiptsFound: number;
  truckMismatches: readonly string[];
};

export type SheetTruckCheck = {
  unitNumber: string;
  loads: readonly { loadId: string; grossCents: number }[];
  grossCents: number;
  fuelCents: number;
  tollCents: number;
};

export type ImportedLoadCheck = {
  unitNumber: string | null;
  loadId: string | null;
  grossCents: number;
  cancelled: boolean;
};

export type ImportedMoneyCheck = {
  unitNumber: string | null;
  amountCents: number;
  duplicate?: boolean;
  linked?: boolean;
};

/**
 * Compare the sheet week to the rows already imported.
 * A truck is listed when load count, gross, fuel, or tolls disagree.
 */
export function compareDailyCheck(input: {
  sheet: readonly SheetTruckCheck[];
  loads: readonly ImportedLoadCheck[];
  fuel: readonly ImportedMoneyCheck[];
  tolls: readonly ImportedMoneyCheck[];
  receiptsFound?: number;
}): DailyCheckSummary {
  const loadKey = (unit: string | null, loadId: string | null) =>
    `${(unit ?? "").replace(/\D/g, "").replace(/^0+/, "")}:${(loadId ?? "").replace(/\s+/g, "").toUpperCase()}`;
  const imported = new Map<string, ImportedLoadCheck>();
  for (const load of input.loads) {
    if (!load.loadId) continue;
    imported.set(loadKey(load.unitNumber, load.loadId), load);
  }
  let loadsNew = 0;
  let loadsChanged = 0;
  const mismatches: string[] = [];
  const unitOf = (value: string | null | undefined) =>
    (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  for (const truck of input.sheet) {
    const unit = unitOf(truck.unitNumber) || truck.unitNumber;
    const truckLoads = input.loads.filter((load) => unitOf(load.unitNumber) === unit && !load.cancelled);
    let importedGross = 0;
    for (const load of truckLoads) importedGross += load.grossCents;
    const importedFuel = input.fuel
      .filter((row) => unitOf(row.unitNumber) === unit)
      .reduce((sum, row) => sum + row.amountCents, 0);
    const importedTolls = input.tolls
      .filter((row) => unitOf(row.unitNumber) === unit)
      .reduce((sum, row) => sum + row.amountCents, 0);
    if (truck.loads.length !== truckLoads.length || truck.grossCents !== importedGross) {
      mismatches.push(
        `Truck ${unit} loads: sheet ${truck.loads.length} at ${money(truck.grossCents)}, imported ${truckLoads.length} at ${money(importedGross)}.`,
      );
    }
    if (truck.fuelCents !== importedFuel) {
      mismatches.push(`Truck ${unit} fuel: sheet ${money(truck.fuelCents)}, imported ${money(importedFuel)}.`);
    }
    if (truck.tollCents !== importedTolls) {
      mismatches.push(`Truck ${unit} tolls: sheet ${money(truck.tollCents)}, imported ${money(importedTolls)}.`);
    }
    for (const sheetLoad of truck.loads) {
      const found = imported.get(loadKey(unit, sheetLoad.loadId));
      if (!found) loadsNew += 1;
      else if (found.grossCents !== sheetLoad.grossCents) loadsChanged += 1;
    }
  }
  return {
    loadsNew,
    loadsChanged,
    loadsCancelled: input.loads.filter((load) => load.cancelled).length,
    fuelAdded: input.fuel.filter((row) => !row.duplicate).length,
    fuelDuplicates: input.fuel.filter((row) => row.duplicate).length,
    fuelUnlinked: input.fuel.filter((row) => row.linked === false).length,
    tollsAdded: input.tolls.length,
    receiptsFound: input.receiptsFound ?? 0,
    truckMismatches: mismatches,
  };
}

function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** One view of what each file brought in for the selected week. */
export function summarizeDailyCheck(input: DailyCheckInput): DailyCheckSummary {
  return {
    loadsNew: input.loads.filter((row) => row.change === "new").length,
    loadsChanged: input.loads.filter((row) => row.change === "changed").length,
    loadsCancelled: input.loads.filter((row) => row.change === "cancelled").length,
    fuelAdded: input.fuel.filter((row) => row.status === "added").length,
    fuelDuplicates: input.fuel.filter((row) => row.status === "duplicate").length,
    fuelUnlinked: input.fuel.filter((row) => row.status === "unlinked").length,
    tollsAdded: input.tollsAdded,
    receiptsFound: input.receiptsFound,
    truckMismatches: [...input.truckMismatches],
  };
}
