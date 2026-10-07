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
  performance: PreparedPair[];
  earnings: PreparedPair[];
  net: PreparedPair;
  fuelSummary: PreparedPair[];
  fixedManagement: PreparedPair[];
  compliance: string;
  operationsNote: string;
};

export type PreparedReport = {
  weekStart: string;
  weekEnd: string;
  statusLabel: string;
  units: PreparedUnit[];
  fleetRows: PreparedPair[];
  fleetNote: string;
};
