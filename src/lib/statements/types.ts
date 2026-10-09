import type { TruckClass } from "@/lib/fee-engine";
import type { ChargedTo, FixedExpenseKind } from "@/lib/fixed-expenses/kinds";
import type { FeeRuleInput } from "@/lib/fee-engine";

export type FeeModel = "lease_to_tolson" | "owner_management";

export type StatementTruck = {
  id: string;
  unitNumber: string;
  truckClass: TruckClass;
  /** Blank follows the truck class. Lease is a 10 percent Tolson lease fee. Owner is a 10 percent management fee. */
  feeModel?: FeeModel | null;
  /** Basis points when Tolson is a percent. Null means not set. */
  tolsonRateBp?: number | null;
  /** Cents when Tolson is a fixed weekly amount. */
  tolsonFixedCents?: number | null;
  tolsonEffectiveFrom?: string | null;
  /** Basis points. Null means the 10 percent management fallback. */
  managementFeeBp?: number | null;
  managementEffectiveFrom?: string | null;
  legacyRateBp?: number | null;
  legacyFixedCents?: number | null;
  legacyEffectiveFrom?: string | null;
};

export type StatementContract = {
  id: string;
  truckId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  rules: FeeRuleInput[];
};

/** A promoted load. Week membership is the delivery date, not pickup. */
export type StatementLoad = {
  id: string;
  truckId: string | null;
  unitNumber: string | null;
  deliveryDate: string;
  /** Stored week, when the row has one. A mismatch with the delivery week is a blocker. */
  storedWeekStart: string | null;
  grossCents: number;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
};

export type StatementFuel = {
  unitNumber: string | null;
  weekStart: string | null;
  amountCents: number;
};

export type StatementToll = {
  unitNumber: string | null;
  weekStart: string | null;
  amountCents: number;
};

export type StatementFixedVersion = {
  id: string;
  truckId: string;
  kind: FixedExpenseKind;
  weeklyAmountCents: number;
  chargedTo: ChargedTo;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type StatementFixedOverride = {
  id: string;
  truckId: string;
  kind: FixedExpenseKind;
  weekStart: string;
  amountCents: number;
  chargedTo: ChargedTo;
};

export type CloseImportRun = {
  kind: "loads" | "fuel" | "tolls";
  status: "running" | "success" | "failed" | "blocked";
  rangeFrom: string;
  rangeTo: string;
  rowsFetched: number;
  finishedAt: string | null;
};

export type StatementBlocker = {
  rule: string;
  message: string;
  ref: string | null;
};

export type StatementLine = {
  lineCode: string;
  label: string;
  amountCents: number;
  rateBp: number | null;
  basePctBp: number | null;
  chargedTo: ChargedTo | null;
  /** False for the internal Tolson / Legacy split on a managed truck. */
  ownerVisible: boolean;
  sortOrder: number;
};

export type UnitStatement = {
  truckId: string;
  unitNumber: string;
  truckClass: TruckClass;
  contractId: string | null;
  grossCents: number;
  driverPayCents: number;
  managementFeeCents: number;
  tolsonPayableCents: number;
  legacyRetainedCents: number;
  dispatchFeeCents: number;
  factoringFeeCents: number;
  fuelCents: number;
  tollsCents: number;
  fixedOwnerCents: number;
  fixedManagementCents: number;
  netCents: number;
  loadCount: number;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
  lines: StatementLine[];
};

export type FleetStatement = {
  grossCents: number;
  driverPayCents: number;
  managementFeeCents: number;
  tolsonPayableCents: number;
  legacyRetainedCents: number;
  dispatchFeeCents: number;
  factoringFeeCents: number;
  fuelCents: number;
  tollsCents: number;
  fixedOwnerCents: number;
  fixedManagementCents: number;
  netCents: number;
  loadCount: number;
  unitCount: number;
};

export type WeekStatements = {
  weekStart: string;
  weekEnd: string;
  units: UnitStatement[];
  fleet: FleetStatement;
  blockers: StatementBlocker[];
  closeAllowed: boolean;
};

export type WeekStatementInput = {
  weekStart: string;
  trucks: StatementTruck[];
  contracts: StatementContract[];
  loads: StatementLoad[];
  fuel: StatementFuel[];
  tolls: StatementToll[];
  fixedVersions: StatementFixedVersion[];
  fixedOverrides: StatementFixedOverride[];
  importRuns: CloseImportRun[];
  /** From import_settings. Not hardcoded in the close check. */
  rowCountDropPct: {
    loads: number;
    fuel: number;
    tolls: number;
  };
};
