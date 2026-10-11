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
