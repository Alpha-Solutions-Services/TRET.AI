import type { FleetStatement, UnitStatement } from "@/lib/statements/types";

export type ReportLoadRow = {
  truckId: string;
  loadNumber: string | null;
  deliveryDate: string;
  brokerName: string | null;
  origin: string | null;
  destination: string | null;
  loadedMilesHundredths: number;
  deadheadMilesHundredths: number;
  rateCents: number;
  /** Ledger column M for the load table. Totals still use the statement miles. */
  tableLoadedMilesHundredths?: number;
  /** Trip group or manifest, when the sheet has one. */
  tripKey?: string | null;
};

export type ReportFuelRow = {
  unitNumber: string | null;
  amountCents: number;
  gallonsMilli: number;
  product: "diesel" | "def" | "other";
};

export type ReportTollRow = {
  unitNumber: string | null;
  amountCents: number;
};

export type ReportTruckHeader = {
  id: string;
  name: string;
  ownerName: string | null;
};

export type WeeklyReportSource = {
  weekStart: string;
  weekEnd: string;
  locked: boolean;
  closedAt: string | null;
  units: UnitStatement[];
  fleet: FleetStatement;
  trucks: ReportTruckHeader[];
  loads: ReportLoadRow[];
  fuel: ReportFuelRow[];
  tolls: ReportTollRow[];
  /** Sheet MPG for trucks whose Week Report was read. A blank cell stays blank. */
  sheetUnits?: ReadonlyArray<{
    unitNumber: string;
    mpg: string | null;
    mpgKnown: boolean;
  }>;
};

export type PreparedPair = {
  label: string;
  value: string;
};

export type PreparedLoad = {
  loadNumber: string;
  deliveryDate: string;
  broker: string;
  origin: string;
  destination: string;
  loaded: string;
  deadhead: string;
  rate: string;
};

export type PreparedChart = {
  summary: string;
  earnedCents: number;
  spentCents: number;
  keepsCents: number;
  expenses: Array<{ label: string; cents: number }>;
  loads: Array<{ label: string; cents: number }>;
  loadedHundredths: number;
  deadheadHundredths: number;
  mpg: string | null;
  rpmCents: number | null;
};

export type PreparedUnit = {
  unitNumber: string;
  truckClassLabel: string;
  assetPartner: string;
  truckLabel: string;
  trailer: string;
  vin: string;
  dispatcher: string;
  loads: PreparedLoad[];
  loadTotals: { loaded: string; deadhead: string; rate: string } | null;
  loadNote: string | null;
  performance: PreparedPair[];
  earnings: PreparedPair[];
  net: PreparedPair;
  fuelSummary: PreparedPair[];
  fixedManagement: PreparedPair[];
  compliance: string;
  operationsNote: string;
  chart: PreparedChart;
};

export type PreparedReport = {
  weekStart: string;
  weekEnd: string;
  statusLabel: string;
  units: PreparedUnit[];
  fleetRows: PreparedPair[];
  fleetNote: string;
  deliveryLabel: string;
  fleetChart: PreparedChart;
};
