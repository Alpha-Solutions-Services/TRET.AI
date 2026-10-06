export type TruckClass = "legacy_owned" | "third_party";

export type FeeRuleKind =
  | "DRIVER_PAY"
  | "MANAGEMENT_FEE"
  | "DISPATCH_FEE"
  | "FACTORING_FEE"
  | "TOLSON_PAYABLE"
  | "LEGACY_RETAINED";

export type FeeRuleInput = {
  kind: FeeRuleKind;
  /** Basis points: 550 = 5.5% */
  rateBp: number;
  /** Basis points of gross: 10000 = 100%, 9500 = 95%. Required; no default. */
  basePctBp: number;
};

export type FeeLineResult = {
  kind: FeeRuleKind;
  amountCents: number;
  rateBp: number;
  basePctBp: number;
};

export type FeeContractRecord = {
  id: string;
  truckId: string;
  /** ISO date YYYY-MM-DD inclusive start */
  effectiveFrom: string;
  /** ISO date YYYY-MM-DD inclusive end; null = open-ended */
  effectiveTo: string | null;
};

export type WeekBounds = {
  /** Monday YYYY-MM-DD */
  start: string;
  /** Sunday YYYY-MM-DD */
  end: string;
};
