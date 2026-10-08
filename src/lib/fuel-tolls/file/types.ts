export type PreviewStatus = "new" | "duplicate" | "flagged";

export type PlannedCell = {
  header: string;
  a1: string;
  value: string;
};

export type LoadWindow = {
  loadId: string;
  tripId: string;
  pickupDate: string;
  deliveryDate: string;
};

export type TollTarget = {
  loadId: string;
  rowNumber: number;
  current: string;
};

/** What the planner already knows. Sheets and the import log are optional. */
export type ImportContext = {
  fuelLogs?: { unitNumber: string; grid: string[][] }[];
  ledgers?: { unitNumber: string; loads: LoadWindow[] }[];
  tollTargets?: { unitNumber: string; column: number; rows: TollTarget[] }[];
  importedFuelKeys?: string[];
  /** Sum of toll cents already stored for a load, plus the transaction ids. */
  importedTolls?: { transactionId: string; loadId: string; amountCents: number }[];
};

export type FuelQueuePayload = {
  kind: "fuel";
  unitNumber: string | null;
  isoDate: string;
  dateDisplay: string;
  location: string;
  loadId: string;
  tripId: string;
  gallonsText: string;
  gallonsMilli: number;
  amountCents: number;
  invoice: string;
  item: string;
  product: "diesel" | "def";
  card: string;
  weekStart: string;
  weekEnd: string;
  reason: string | null;
  aiSuggested: boolean;
  written: boolean;
  sheetRow: number | null;
  dedupeKey: string;
};

export type TollQueuePayload = {
  kind: "toll";
  unitNumber: string | null;
  loadId: string;
  amountCents: number;
  transactionId: string;
  occurredAt: string;
  isoDate: string;
  weekStart: string;
  weekEnd: string;
  location: string;
  reason: string | null;
  aiSuggested: boolean;
  written: boolean;
  dedupeKey: string;
};

export type QueuePayload = FuelQueuePayload | TollQueuePayload;

export type ImportPreviewRow = {
  kind: "fuel" | "toll";
  status: PreviewStatus;
  reason: string | null;
  aiSuggested: boolean;
  aiSuggestion: string | null;
  unitNumber: string | null;
  truck: string | null;
  weekLabel: string | null;
  link: string | null;
  targetSheet: string | null;
  cells: PlannedCell[];
  sourceRow: number;
  amountCents: number | null;
  queue: boolean;
  payload: QueuePayload | null;
};

export type PlanResult = {
  kind: "fuel" | "toll" | "unknown";
  rows: ImportPreviewRow[];
  message: string | null;
  headers: string[];
};
