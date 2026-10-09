import { canonicalStoredLoadId, canonicalTripId } from "@/lib/fuel-tolls/file/link";
import {
  mergeIdentities,
  SEEDED_IDENTITIES,
  unitNumberFromRaw,
  type TruckIdentity,
} from "@/lib/fuel-tolls/file/mappings";
import type { ImportContext, LoadWindow } from "@/lib/fuel-tolls/file/types";
import { columnIndex, findHeaderRow } from "@/lib/sheets/cell";
import { parseLoadLedger } from "@/lib/sheets/ledger";
import { loadTruckWorkbook } from "@/lib/sheets/read";
import { locateTollExpenseColumn } from "@/lib/fuel-tolls/file/sheet-columns";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export async function loadIdentities(supabase: Db): Promise<TruckIdentity[]> {
  const [trucks, cards, plates, tags] = await Promise.all([
    supabase.from("trucks").select("id, unit_number"),
    supabase.from("truck_fuel_cards").select("truck_id, card_number"),
    supabase.from("truck_plates").select("truck_id, plate, plate_state"),
    supabase.from("truck_toll_tags").select("truck_id, tag_number"),
  ]);
  if (cards.error && isMissingSchemaError(cards.error)) return SEEDED_IDENTITIES;
  if (cards.error || plates.error || tags.error || trucks.error) return SEEDED_IDENTITIES;
  if ((cards.data ?? []).length === 0 && (plates.data ?? []).length === 0 && (tags.data ?? []).length === 0) {
    return SEEDED_IDENTITIES;
  }
  const byTruck = new Map<string, TruckIdentity>();
  for (const truck of trucks.data ?? []) {
    const unit = unitNumberFromRaw(truck.unit_number);
    if (!unit) continue;
    byTruck.set(truck.id, { unitNumber: unit, cards: [], plates: [], tags: [] });
  }
  for (const card of cards.data ?? []) {
    byTruck.get(card.truck_id)?.cards.push(card.card_number);
  }
  for (const plate of plates.data ?? []) {
    byTruck.get(plate.truck_id)?.plates.push({ plate: plate.plate, state: plate.plate_state });
  }
  for (const tag of tags.data ?? []) {
    byTruck.get(tag.truck_id)?.tags.push(tag.tag_number);
  }
  const rows = [...byTruck.values()];
  return rows.length > 0 ? mergeIdentities(rows) : SEEDED_IDENTITIES;
}

export function loadsFromLedgerGrid(grid: string[][]): LoadWindow[] {
  return parseLoadLedger(grid).rows.flatMap((row) => {
    if (!row.pickupDay || !row.deliveryDay) return [];
    const loadId = canonicalStoredLoadId(row.loadId);
    if (!loadId) return [];
    return [
      {
        loadId,
        tripId: canonicalTripId(row.tripGroup),
        pickupDate: row.pickupDay,
        deliveryDate: row.deliveryDay,
      },
    ];
  });
}

export function tollTargetsFromLedgerGrid(grid: string[][]): { column: number; rows: { loadId: string; rowNumber: number; current: string }[] } | null {
  const headerIndex = findHeaderRow(grid, [["load id", "order id", "order friendly id"], ["toll expense"]]);
  if (headerIndex < 0) return null;
  const header = grid[headerIndex] ?? [];
  const idCol = columnIndex(header, ["load id", "order id", "order friendly id"]);
  const tollCol = locateTollExpenseColumn(header);
  if (idCol < 0 || tollCol < 0) return null;
  const rows: { loadId: string; rowNumber: number; current: string }[] = [];
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const loadId = canonicalStoredLoadId(grid[index]?.[idCol] ?? "");
    if (!loadId) continue;
    rows.push({ loadId, rowNumber: index + 1, current: grid[index]?.[tollCol] ?? "" });
  }
  return { column: tollCol, rows };
}

export async function contextForUnits(supabase: Db, unitNumbers: string[]): Promise<{ context: ImportContext; identities: TruckIdentity[] }> {
  const identities = await loadIdentities(supabase);
  const wanted = new Set(unitNumbers.map((unit) => unitNumberFromRaw(unit)).filter(Boolean));
  const trucks = await supabase.from("trucks").select("unit_number, google_sheet_url");
  const fuelLogs: NonNullable<ImportContext["fuelLogs"]> = [];
  const ledgers: NonNullable<ImportContext["ledgers"]> = [];
  const tollTargets: NonNullable<ImportContext["tollTargets"]> = [];
  for (const truck of trucks.data ?? []) {
    const unit = unitNumberFromRaw(truck.unit_number);
    if (!unit || (wanted.size > 0 && !wanted.has(unit))) continue;
    if (!truck.google_sheet_url) continue;
    const book = await loadTruckWorkbook({ unitNumber: truck.unit_number, googleSheetUrl: truck.google_sheet_url });
    if (book.fuelLog) fuelLogs.push({ unitNumber: unit, grid: book.fuelLog });
    if (book.loadLedger) {
      ledgers.push({ unitNumber: unit, loads: loadsFromLedgerGrid(book.loadLedger) });
      const targets = tollTargetsFromLedgerGrid(book.loadLedger);
      if (targets) tollTargets.push({ unitNumber: unit, column: targets.column, rows: targets.rows });
    }
  }
  const importedFuel = await supabase.from("fuel_file_imports").select("unit_number, invoice, item, qty_milli");
  const importedTolls = await supabase.from("toll_file_imports").select("transaction_id, load_id, amount_cents");
  return {
    identities,
    context: {
      fuelLogs,
      ledgers,
      tollTargets,
      importedFuelKeys: (importedFuel.data ?? []).map(
        (row) => `${unitNumberFromRaw(row.unit_number)}|${row.invoice}|${row.item}|${row.qty_milli}`,
      ),
      importedTolls: (importedTolls.data ?? []).map((row) => ({
        transactionId: row.transaction_id,
        loadId: row.load_id,
        amountCents: row.amount_cents,
      })),
    },
  };
}
