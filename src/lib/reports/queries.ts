import { canonicalLoadId } from "@/lib/loads/load-id";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";
import { assertMonday } from "@/lib/fee-engine";
import { milesValueToHundredths } from "@/lib/statements/miles";
import { loadStatements } from "@/lib/statements/queries";
import { weeklyStatementPdf } from "./build";
import { ReportBlockedError } from "./prepare";
import type { ReportFuelRow, ReportLoadRow, ReportTollRow, ReportTruckHeader } from "./types";

export async function buildWeeklyStatementPdf(weekStart: string): Promise<Uint8Array> {
  assertMonday(weekStart, "Week start");
  const page = await loadStatements(weekStart);
  if (page.error) throw new ReportBlockedError(page.error);
  if (!page.locked && page.blockers.length > 0) {
    const text = page.blockers.map((row) => row.message).join(" ");
    throw new ReportBlockedError(text || "This week cannot be exported.");
  }
  if (page.units.length === 0) {
    throw new ReportBlockedError("Nothing to show for this week.");
  }

  const needsLoads = page.units.some((unit) => unit.loadCount > 0 || unit.grossCents > 0);
  const needsFuel = page.units.some((unit) => unit.fuelCents > 0);
  const needsTolls = page.units.some((unit) => unit.tollsCents > 0);
  const details = await loadReportDetails(page.weekStart, page.weekEnd, {
    needsLoads,
    needsFuel,
    needsTolls,
  });

  return weeklyStatementPdf({
    weekStart: page.weekStart,
    weekEnd: page.weekEnd,
    locked: page.locked,
    closedAt: page.closedAt,
    units: page.units,
    fleet: page.fleet,
    ...details,
  });
}

async function loadReportDetails(
  weekStart: string,
  weekEnd: string,
  needs: { needsLoads: boolean; needsFuel: boolean; needsTolls: boolean },
): Promise<{
  trucks: ReportTruckHeader[];
  loads: ReportLoadRow[];
  fuel: ReportFuelRow[];
  tolls: ReportTollRow[];
}> {
  const supabase = await createClient();
  const [trucksRes, loadsRes, fuelRes, tollsRes] = await Promise.all([
    supabase.from("trucks").select("id, name, owner_name"),
    supabase
      .from("loads")
      .select(
        "id, truck_id, load_id, delivery_date, broker_name, origin_city, origin_state, destination_city, destination_state, loaded_distance_mi, deadhead_miles, rate_cents",
      )
      .gte("delivery_date", weekStart)
      .lte("delivery_date", weekEnd),
    supabase
      .from("fuel_transactions")
      .select("unit_number, amount_cents, gallons_milli, product")
      .eq("week_start", weekStart),
    supabase.from("toll_transactions").select("unit_number, amount_cents").eq("week_start", weekStart),
  ]);

  if (trucksRes.error) throw new ReportBlockedError(trucksRes.error.message);
  const loads = readLoads(loadsRes.error, loadsRes.data, needs.needsLoads);
  const fuel = readFuel(fuelRes.error, fuelRes.data, needs.needsFuel);
  const tolls = readTolls(tollsRes.error, tollsRes.data, needs.needsTolls);

  return {
    trucks: (trucksRes.data ?? []).map((truck) => ({
      id: truck.id,
      name: truck.name,
      ownerName: truck.owner_name,
    })),
    loads,
    fuel,
    tolls,
  };
}

function readLoads(
  error: { code?: string; message: string } | null,
  rows: Array<{
    id: string;
    truck_id: string | null;
    load_id: string | null;
    delivery_date: string;
    broker_name: string | null;
    origin_city: string | null;
    origin_state: string | null;
    destination_city: string | null;
    destination_state: string | null;
    loaded_distance_mi: number | null;
    deadhead_miles: number | null;
    rate_cents: number;
  }> | null,
  required: boolean,
): ReportLoadRow[] {
  if (error) {
    if (isMissingSchemaError(error) && !required) return [];
    if (isMissingSchemaError(error)) {
      throw new ReportBlockedError("Loads are not available until the v0.0.0.4 migration is applied.");
    }
    throw new ReportBlockedError(error.message);
  }
  return (rows ?? []).map((row) => {
    if (!row.truck_id) {
      throw new ReportBlockedError(`Load ${row.load_id ? canonicalLoadId(row.load_id) : row.id} has no truck.`);
    }
    try {
      return {
        truckId: row.truck_id,
        loadNumber: row.load_id ? canonicalLoadId(row.load_id) : null,
        deliveryDate: row.delivery_date,
        brokerName: row.broker_name,
        origin: place(row.origin_city, row.origin_state),
        destination: place(row.destination_city, row.destination_state),
        loadedMilesHundredths: milesValueToHundredths(row.loaded_distance_mi),
        deadheadMilesHundredths: milesValueToHundredths(row.deadhead_miles),
        rateCents: row.rate_cents,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "A load on this week could not be read.";
      throw new ReportBlockedError(message);
    }
  });
}

function readFuel(
  error: { code?: string; message: string } | null,
  rows: Array<{
    unit_number: string | null;
    amount_cents: number;
    gallons_milli: number;
    product: string;
  }> | null,
  required: boolean,
): ReportFuelRow[] {
  if (error) {
    if (isMissingSchemaError(error) && !required) return [];
    if (isMissingSchemaError(error)) {
      throw new ReportBlockedError("Fuel is not available until the v0.0.0.7 migration is applied.");
    }
    throw new ReportBlockedError(error.message);
  }
  return (rows ?? []).map((row) => ({
    unitNumber: row.unit_number,
    amountCents: row.amount_cents,
    gallonsMilli: row.gallons_milli,
    product: fuelProduct(row.product),
  }));
}

function readTolls(
  error: { code?: string; message: string } | null,
  rows: Array<{ unit_number: string | null; amount_cents: number }> | null,
  required: boolean,
): ReportTollRow[] {
  if (error) {
    if (isMissingSchemaError(error) && !required) return [];
    if (isMissingSchemaError(error)) {
      throw new ReportBlockedError("Tolls are not available until the v0.0.0.7 migration is applied.");
    }
    throw new ReportBlockedError(error.message);
  }
  return (rows ?? []).map((row) => ({
    unitNumber: row.unit_number,
    amountCents: row.amount_cents,
  }));
}

function fuelProduct(value: string): ReportFuelRow["product"] {
  if (value === "diesel" || value === "def" || value === "other") return value;
  throw new ReportBlockedError("A fuel row has a product that is not diesel, DEF, or other.");
}

function place(city: string | null, state: string | null): string | null {
  const cityText = city?.trim() ?? "";
  const stateText = state?.trim() ?? "";
  if (cityText && stateText) return `${cityText}, ${stateText}`;
  if (cityText) return cityText;
  if (stateText) return stateText;
  return null;
}
