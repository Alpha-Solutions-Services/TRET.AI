export type FuelProduct = "diesel" | "def" | "other";

export type IssueSeverity = "Block" | "Warn" | "Info";

export type FuelTollIssue = {
  severity: IssueSeverity;
  rule: string;
  message: string;
  ref?: string | null;
};

export type FuelDraft = {
  vektorTransactionId: string;
  unitNumber: string | null;
  transactedAt: string | null;
  transactedDate: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  product: FuelProduct;
  card: string | null;
  gallonsMilli: number | null;
  amountCents: number | null;
  retailAmountCents: number | null;
  invalidReason: string | null;
  source: unknown;
};

export type TollDraft = {
  vektorTransactionId: string;
  vektorTruckId: string | null;
  unitNumber: string | null;
  transactedAt: string | null;
  transactedDate: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  amountCents: number | null;
  /** Transponder or card when the source has one. Duplicate key uses this, else truck id. */
  card: string | null;
  location: string | null;
  invalidReason: string | null;
  source: unknown;
};

/** A promoted load covers every calendar day from pickup through delivery. */
export type LoadSpan = {
  unitNumber: string;
  startDate: string;
  endDate: string;
};

/** Miles on loads whose delivery week is this Monday, in hundredths of a mile. */
export type WeekMiles = {
  unitNumber: string;
  weekStart: string;
  milesHundredths: number;
};

export type DuplicateKey = {
  vektorTransactionId: string;
  card: string | null;
  transactedAt: string;
  amountCents: number;
};

export type FuelTollSettings = {
  priceMinTenthCents: number;
  priceMaxTenthCents: number;
  dieselTankGallonsMilli: number;
  defTankGallonsMilli: number;
  mpgMinMilli: number;
  mpgMaxMilli: number;
  rowCountDropBlockPct: number;
};

export type FuelDecision = {
  draft: FuelDraft;
  issues: FuelTollIssue[];
  promote: boolean;
  rejectReason: string | null;
};

export type TollDecision = {
  draft: TollDraft;
  issues: FuelTollIssue[];
  promote: boolean;
  rejectReason: string | null;
};
