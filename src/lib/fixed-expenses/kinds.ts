export const FIXED_EXPENSE_KINDS = [
  "MAINTENANCE_ESCROW_WEEKLY",
  "ELD_FEE",
  "YARD_FEE",
  "GPS_TRACKER",
  "INSURANCE",
  "TRUCK_PAYMENTS",
  "TRAILER_PAYMENTS",
  "TOLL_PASS",
  "PERMITS",
  "MISC",
] as const;

export type FixedExpenseKind = (typeof FIXED_EXPENSE_KINDS)[number];

export const FIXED_EXPENSE_LABELS: Record<FixedExpenseKind, string> = {
  MAINTENANCE_ESCROW_WEEKLY: "Maintenance Escrow Weekly",
  ELD_FEE: "ELD Fee",
  YARD_FEE: "Yard Fee",
  GPS_TRACKER: "GPS Tracker",
  INSURANCE: "Insurance",
  TRUCK_PAYMENTS: "Truck Payments",
  TRAILER_PAYMENTS: "Trailer Payments",
  TOLL_PASS: "Toll Pass",
  PERMITS: "Permits",
  MISC: "Misc",
};

export const CHARGED_TO_VALUES = ["owner", "management"] as const;

export type ChargedTo = (typeof CHARGED_TO_VALUES)[number];

export function isFixedExpenseKind(value: string): value is FixedExpenseKind {
  return (FIXED_EXPENSE_KINDS as readonly string[]).includes(value);
}

export function isChargedTo(value: string): value is ChargedTo {
  return value === "owner" || value === "management";
}

export function chargedToLabel(value: ChargedTo): string {
  return value === "owner" ? "Owner" : "Management";
}
