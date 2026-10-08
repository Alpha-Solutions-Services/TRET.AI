"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { weekBoundsForDate } from "@/lib/fee-engine/week";
import { contextForUnits, tollTargetsFromLedgerGrid } from "@/lib/fuel-tolls/file/context";
import { canonicalStoredLoadId, canonicalTripId } from "@/lib/fuel-tolls/file/link";
import { unitNumberFromRaw } from "@/lib/fuel-tolls/file/mappings";
import { prepareImport } from "@/lib/fuel-tolls/file/prepare";
import { gridFromUpload } from "@/lib/fuel-tolls/file/parse";
import { cellA1, fuelLogTab, ledgerTab, locateFuelLogColumns } from "@/lib/fuel-tolls/file/sheet-columns";
import type { FuelQueuePayload, ImportPreviewRow, TollQueuePayload } from "@/lib/fuel-tolls/file/types";
import { batchWriteRanges, spreadsheetIdFromUrl } from "@/lib/fuel-tolls/file/write-sheets";
import { centsToDollarString } from "@/lib/money/cents";
import { findHeaderRow, isEmptyCell, sheetAmountToCents } from "@/lib/sheets/cell";
import { loadTruckWorkbook } from "@/lib/sheets/read";
import type { Json } from "@/lib/supabase/database.types";
import { FILE_IMPORT_MIGRATION_MESSAGE } from "@/lib/fuel-tolls/file/messages";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 2_000_000;

type Upload = { csvText?: string; xlsxBase64?: string };

async function gate() {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false as const, error: "You must be signed in." };
  return { ok: true as const, supabase: await createClient() };
}

function decodeUpload(input: Upload): { ok: true; grid: string[][] } | { ok: false; error: string } {
  try {
    if (input.xlsxBase64) {
      if (input.xlsxBase64.length > MAX_BYTES * 2) return { ok: false, error: "That file is too large." };
      const bytes = Buffer.from(input.xlsxBase64, "base64");
      if (bytes.length > MAX_BYTES) return { ok: false, error: "That file is too large." };
      return { ok: true, grid: gridFromUpload({ xlsx: new Uint8Array(bytes) }) };
    }
    if (input.csvText != null) {
      if (input.csvText.length > MAX_BYTES) return { ok: false, error: "That file is too large." };
      return { ok: true, grid: gridFromUpload({ csvText: input.csvText }) };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That file could not be read." };
  }
  return { ok: false, error: "Choose a CSV or XLSX file." };
}

export async function previewFuelTollFileAction(input: Upload): Promise<
  | { ok: true; kind: string; message: string | null; aiNotice: string | null; rows: ImportPreviewRow[] }
  | { ok: false; error: string }
> {
  const auth = await gate();
  if (!auth.ok) return auth;
  const decoded = decodeUpload(input);
  if (!decoded.ok) return decoded;
  const { context, identities } = await contextForUnits(auth.supabase, []);
  const plan = await prepareImport(decoded.grid, context, identities);
  return { ok: true, kind: plan.kind, message: plan.message, aiNotice: plan.aiNotice, rows: plan.rows };
}

export async function approveFuelTollFileAction(input: Upload): Promise<
  | { ok: true; wrote: number; queued: number; duplicates: number; note: string | null }
  | { ok: false; error: string }
> {
  const auth = await gate();
  if (!auth.ok) return auth;
  const decoded = decodeUpload(input);
  if (!decoded.ok) return decoded;
  const { context, identities } = await contextForUnits(auth.supabase, []);
  const plan = await prepareImport(decoded.grid, context, identities);
  if (plan.kind === "unknown") {
    return { ok: false, error: plan.message ?? "This file is not a fuel card CSV or an E-ZPass workbook." };
  }

  const trucks = await auth.supabase.from("trucks").select("id, unit_number, google_sheet_url");
  const truckRows = trucks.data ?? [];
  const groups = new Map<string, { tab: string; a1: string; value: string }[]>();
  const writable: ImportPreviewRow[] = [];

  for (const row of plan.rows) {
    if (row.status !== "new" || row.aiSuggested || !row.unitNumber || !row.targetSheet || row.cells.length === 0) continue;
    const truck = truckRows.find((item) => unitNumberFromRaw(item.unit_number) === row.unitNumber);
    const spreadsheetId = spreadsheetIdFromUrl(truck?.google_sheet_url);
    if (!spreadsheetId) {
      row.status = "flagged";
      row.queue = true;
      row.reason = "This truck has no Google Sheet link, so the row was not written.";
      if (row.payload?.kind === "fuel") row.payload = { ...row.payload, written: false, sheetRow: null, reason: row.reason };
      if (row.payload?.kind === "toll") row.payload = { ...row.payload, written: false, reason: row.reason };
      continue;
    }
    const list = groups.get(spreadsheetId) ?? [];
    for (const cell of row.cells) list.push({ tab: row.targetSheet, a1: cell.a1, value: cell.value });
    groups.set(spreadsheetId, list);
    writable.push(row);
  }

  const failed = new Set<string>();
  for (const [spreadsheetId, data] of groups) {
    const wrote = await batchWriteRanges({ spreadsheetId, data });
    if (!wrote.ok) failed.add(spreadsheetId);
  }

  for (const row of writable) {
    const truck = truckRows.find((item) => unitNumberFromRaw(item.unit_number) === row.unitNumber);
    const spreadsheetId = spreadsheetIdFromUrl(truck?.google_sheet_url);
    if (!spreadsheetId || !failed.has(spreadsheetId)) continue;
    row.status = "flagged";
    row.queue = true;
    row.reason = "Google did not save those cells.";
    if (row.payload?.kind === "fuel") row.payload = { ...row.payload, written: false, sheetRow: null, reason: row.reason };
    if (row.payload?.kind === "toll") row.payload = { ...row.payload, written: false, reason: row.reason };
  }
  const saved = writable.filter((row) => row.status === "new");

  const fuelDb = saved.flatMap((row) => {
    if (row.payload?.kind !== "fuel") return [];
    const truck = truckRows.find((item) => unitNumberFromRaw(item.unit_number) === row.payload?.unitNumber);
    return [
      {
        vektor_transaction_id: `file-fuel:${row.payload.dedupeKey}`,
        truck_id: truck?.id ?? null,
        unit_number: row.payload.unitNumber,
        transacted_at: `${row.payload.isoDate} 00:00:00`,
        transacted_date: row.payload.isoDate,
        week_start: row.payload.weekStart,
        week_end: row.payload.weekEnd,
        product: row.payload.product,
        card: row.payload.card || null,
        gallons_milli: row.payload.gallonsMilli,
        amount_cents: row.payload.amountCents,
      },
    ];
  });
  const tollDb = saved.flatMap((row) => {
    if (row.payload?.kind !== "toll" || !row.payload.loadId || !row.payload.unitNumber) return [];
    const truck = truckRows.find((item) => unitNumberFromRaw(item.unit_number) === row.payload?.unitNumber);
    return [
      {
        vektor_transaction_id: `file-toll:${row.payload.transactionId}`,
        truck_id: truck?.id ?? null,
        unit_number: row.payload.unitNumber,
        transacted_at: row.payload.occurredAt.replace("T", " "),
        transacted_date: row.payload.isoDate,
        week_start: row.payload.weekStart,
        week_end: row.payload.weekEnd,
        amount_cents: row.payload.amountCents,
        location: row.payload.location || null,
      },
    ];
  });

  if (fuelDb.length > 0) {
    const inserted = await auth.supabase.from("fuel_transactions").upsert(fuelDb, {
      onConflict: "vektor_transaction_id",
      ignoreDuplicates: true,
    });
    if (inserted.error) return schemaOr(inserted.error);
  }
  if (tollDb.length > 0) {
    const inserted = await auth.supabase.from("toll_transactions").upsert(tollDb, {
      onConflict: "vektor_transaction_id",
      ignoreDuplicates: true,
    });
    if (inserted.error) return schemaOr(inserted.error);
  }

  const fuelLog = saved.flatMap((row) => {
    if (row.payload?.kind !== "fuel" || !row.payload.unitNumber) return [];
    const cell = row.cells.find((item) => item.header === "Date");
    return [
      {
        unit_number: row.payload.unitNumber,
        invoice: row.payload.invoice,
        item: row.payload.item,
        qty_milli: row.payload.gallonsMilli,
        amount_cents: row.payload.amountCents,
        transacted_date: row.payload.isoDate,
        location: row.payload.location,
        load_id: row.payload.loadId || null,
        trip_id: row.payload.tripId || null,
        sheet_tab: row.targetSheet,
        sheet_row: cell ? Number(cell.a1.replace(/\D/g, "")) : row.payload.sheetRow,
      },
    ];
  });
  const tollLog = saved.flatMap((row) => {
    if (row.payload?.kind !== "toll" || !row.payload.loadId || !row.payload.unitNumber) return [];
    return [
      {
        transaction_id: row.payload.transactionId,
        unit_number: row.payload.unitNumber,
        load_id: row.payload.loadId,
        amount_cents: row.payload.amountCents,
        transacted_at: row.payload.occurredAt.replace("T", " "),
        location: row.payload.location || null,
      },
    ];
  });
  if (fuelLog.length > 0) {
    const inserted = await auth.supabase.from("fuel_file_imports").upsert(fuelLog, {
      onConflict: "unit_number,invoice,item,qty_milli",
      ignoreDuplicates: true,
    });
    if (inserted.error) return schemaOr(inserted.error);
  }
  if (tollLog.length > 0) {
    const inserted = await auth.supabase.from("toll_file_imports").upsert(tollLog, {
      onConflict: "transaction_id",
      ignoreDuplicates: true,
    });
    if (inserted.error) return schemaOr(inserted.error);
  }

  const queued = await storeQueue(auth.supabase, plan.rows.filter((row) => row.queue && row.payload));
  if (!queued.ok) return queued;
  revalidatePath("/fuel");
  revalidatePath("/tolls");
  const duplicates = plan.rows.filter((row) => row.status === "duplicate").length;
  const note = failed.size > 0 ? "Some sheets were not saved. Those rows stayed in the review queue." : null;
  return { ok: true, wrote: saved.length, queued: queued.count, duplicates, note };
}

async function storeQueue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: ImportPreviewRow[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const items = rows.flatMap((row) => {
    if (!row.payload) return [];
    return [
      {
        dedupe_key: row.payload.dedupeKey,
        kind: row.payload.kind,
        reason: row.reason ?? "Needs review.",
        ai_suggested: row.aiSuggested || row.payload.aiSuggested,
        unit_number: row.payload.unitNumber,
        load_id: row.payload.kind === "fuel" ? row.payload.loadId || null : row.payload.loadId || null,
        trip_id: row.payload.kind === "fuel" ? row.payload.tripId || null : null,
        payload: JSON.parse(JSON.stringify(row.payload)) as Json,
      },
    ];
  });
  if (items.length === 0) return { ok: true, count: 0 };
  const existing = await supabase
    .from("file_import_queue")
    .select("id, dedupe_key, status")
    .in(
      "dedupe_key",
      items.map((item) => item.dedupe_key),
    );
  if (existing.error) return schemaOr(existing.error);
  const byKey = new Map((existing.data ?? []).map((row) => [row.dedupe_key, row]));
  let count = 0;
  for (const item of items) {
    const prior = byKey.get(item.dedupe_key);
    if (prior && prior.status !== "open") continue;
    if (prior) {
      const updated = await supabase
        .from("file_import_queue")
        .update({
          reason: item.reason,
          ai_suggested: item.ai_suggested,
          unit_number: item.unit_number,
          load_id: item.load_id,
          trip_id: item.trip_id,
          payload: item.payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prior.id);
      if (updated.error) return schemaOr(updated.error);
    } else {
      const inserted = await supabase.from("file_import_queue").insert({ ...item, status: "open" });
      if (inserted.error) return schemaOr(inserted.error);
    }
    count += 1;
  }
  return { ok: true, count };
}

function schemaOr(error: { code?: string; message: string }): { ok: false; error: string } {
  if (isMissingSchemaError(error)) return { ok: false, error: FILE_IMPORT_MIGRATION_MESSAGE };
  return { ok: false, error: error.message };
}

export async function approveQueuedImportAction(input: {
  id: string;
  unitNumber: string;
  loadId: string;
  tripId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await gate();
  if (!auth.ok) return auth;
  const loaded = await auth.supabase.from("file_import_queue").select("*").eq("id", input.id).maybeSingle();
  if (loaded.error) return schemaOr(loaded.error);
  if (!loaded.data || loaded.data.status !== "open") return { ok: false, error: "That queue row is no longer open." };
  const unit = unitNumberFromRaw(input.unitNumber) || unitNumberFromRaw(loaded.data.unit_number);
  const loadId = canonicalStoredLoadId(input.loadId || loaded.data.load_id || "");
  const tripId = canonicalTripId(input.tripId || loaded.data.trip_id || "");
  if (loaded.data.kind === "fuel") {
    const payload = asFuel(loaded.data.payload);
    if (!payload) return { ok: false, error: "This fuel row cannot be written. Dismiss it." };
    if (payload.amountCents < 0) return { ok: false, error: "A negative amount is not entered." };
    if (!unit) return { ok: false, error: "Pick a truck before approving this row." };
    const saved = await writeApprovedFuel(auth.supabase, payload, unit, loadId, tripId);
    if (!saved.ok) return saved;
  } else {
    const payload = asToll(loaded.data.payload);
    if (!payload) return { ok: false, error: "This toll row cannot be written. Dismiss it." };
    if (payload.amountCents < 0) return { ok: false, error: "A negative amount is not entered." };
    if (!unit) return { ok: false, error: "Pick a truck before approving this row." };
    if (!loadId) return { ok: false, error: "Pick a load before approving this toll." };
    const saved = await writeApprovedToll(auth.supabase, payload, unit, loadId);
    if (!saved.ok) return saved;
  }
  const closed = await auth.supabase
    .from("file_import_queue")
    .update({
      status: "approved",
      unit_number: unit,
      load_id: loadId || null,
      trip_id: tripId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (closed.error) return schemaOr(closed.error);
  revalidatePath("/fuel");
  revalidatePath("/tolls");
  return { ok: true };
}

export async function dismissQueuedImportAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await gate();
  if (!auth.ok) return auth;
  const updated = await auth.supabase
    .from("file_import_queue")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open");
  if (updated.error) return schemaOr(updated.error);
  revalidatePath("/fuel");
  revalidatePath("/tolls");
  return { ok: true };
}

export async function saveTruckIdentityAction(input: {
  truckId: string;
  cards: string;
  plates: string;
  tags: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await gate();
  if (!auth.ok) return auth;
  const cards = uniqueLines(input.cards).map((line) => line.replace(/\s+/g, ""));
  if (cards.some((card) => !/^\d{2,20}$/.test(card))) {
    return { ok: false, error: "A card number is digits only." };
  }
  const plates = uniqueLines(input.plates).map(parsePlateLine);
  if (plates.some((plate) => !plate)) return { ok: false, error: "A plate is letters and digits, with an optional 2-letter state." };
  const tags = uniqueLines(input.tags).map((line) => line.toUpperCase().replace(/[^A-Z0-9-]/g, ""));
  if (tags.some((tag) => !tag)) return { ok: false, error: "A tag is letters, digits, or a hyphen." };

  const cleared = await auth.supabase.from("truck_fuel_cards").delete().eq("truck_id", input.truckId);
  if (cleared.error) return schemaOr(cleared.error);
  const clearedPlates = await auth.supabase.from("truck_plates").delete().eq("truck_id", input.truckId);
  if (clearedPlates.error) return schemaOr(clearedPlates.error);
  const clearedTags = await auth.supabase.from("truck_toll_tags").delete().eq("truck_id", input.truckId);
  if (clearedTags.error) return schemaOr(clearedTags.error);

  if (cards.length > 0) {
    const inserted = await auth.supabase
      .from("truck_fuel_cards")
      .insert(cards.map((card_number) => ({ truck_id: input.truckId, card_number })));
    if (inserted.error) return schemaOr(inserted.error);
  }
  const plateRows = plates.flatMap((plate) => (plate ? [plate] : []));
  if (plateRows.length > 0) {
    const inserted = await auth.supabase
      .from("truck_plates")
      .insert(plateRows.map((plate) => ({ truck_id: input.truckId, plate: plate.plate, plate_state: plate.state })));
    if (inserted.error) return schemaOr(inserted.error);
  }
  if (tags.length > 0) {
    const inserted = await auth.supabase
      .from("truck_toll_tags")
      .insert(tags.map((tag_number) => ({ truck_id: input.truckId, tag_number })));
    if (inserted.error) return schemaOr(inserted.error);
  }
  revalidatePath(`/trucks/${input.truckId}`);
  return { ok: true };
}

function uniqueLines(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = trimmed.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function parsePlateLine(line: string): { plate: string; state: string | null } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length > 2) return null;
  const plate = (parts[0] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!plate) return null;
  const state = (parts[1] ?? "").toUpperCase();
  if (state && !/^[A-Z]{2}$/.test(state)) return null;
  return { plate, state: state || null };
}

function asFuel(value: Json): FuelQueuePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, Json | undefined>;
  if (row.kind !== "fuel") return null;
  if (typeof row.isoDate !== "string" || typeof row.dateDisplay !== "string" || typeof row.gallonsText !== "string") return null;
  if (typeof row.invoice !== "string" || typeof row.item !== "string" || typeof row.location !== "string") return null;
  if (typeof row.gallonsMilli !== "number" || typeof row.amountCents !== "number") return null;
  if (!Number.isInteger(row.gallonsMilli) || !Number.isInteger(row.amountCents)) return null;
  if (row.product !== "diesel" && row.product !== "def") return null;
  return row as unknown as FuelQueuePayload;
}

function asToll(value: Json): TollQueuePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, Json | undefined>;
  if (row.kind !== "toll") return null;
  if (typeof row.transactionId !== "string" || typeof row.occurredAt !== "string" || typeof row.isoDate !== "string") return null;
  if (typeof row.amountCents !== "number" || !Number.isInteger(row.amountCents)) return null;
  return row as unknown as TollQueuePayload;
}

async function writeApprovedFuel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: FuelQueuePayload,
  unit: string,
  loadId: string,
  tripId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const truck = await truckByUnit(supabase, unit);
  if (!truck) return { ok: false, error: "That truck was not found." };
  const spreadsheetId = spreadsheetIdFromUrl(truck.google_sheet_url);
  if (!spreadsheetId) return { ok: false, error: "This truck has no Google Sheet link." };
  const book = await loadTruckWorkbook({ unitNumber: truck.unit_number, googleSheetUrl: truck.google_sheet_url });
  const grid = book.fuelLog;
  if (!grid) return { ok: false, error: "Fuel Log was not found on this truck's sheet." };
  const headerIndex = findHeaderRow(grid, [["date"], ["gallons"]]);
  if (headerIndex < 0) return { ok: false, error: "Fuel Log headers were not found." };
  const located = locateFuelLogColumns(grid[headerIndex] ?? []);
  if (!located.ok) return { ok: false, error: located.error };
  const tab = fuelLogTab(unit);
  const columns = located.columns;
  let rowNumber = payload.written && payload.sheetRow ? payload.sheetRow : 0;
  if (!rowNumber) {
    let last = headerIndex;
    for (let index = headerIndex + 1; index < grid.length; index++) {
      const line = grid[index] ?? [];
      if ((line[columns.date] ?? "").trim() || (line[columns.gallons] ?? "").trim()) last = index;
    }
    rowNumber = last + 2;
  }
  const data =
    payload.written && payload.sheetRow
      ? [
          { tab, a1: cellA1(columns.loadId, rowNumber), value: loadId },
          { tab, a1: cellA1(columns.trip, rowNumber), value: tripId },
        ]
      : [
          { tab, a1: cellA1(columns.date, rowNumber), value: payload.dateDisplay },
          { tab, a1: cellA1(columns.location, rowNumber), value: payload.location },
          { tab, a1: cellA1(columns.loadId, rowNumber), value: loadId },
          { tab, a1: cellA1(columns.trip, rowNumber), value: tripId },
          { tab, a1: cellA1(columns.gallons, rowNumber), value: payload.gallonsText },
          { tab, a1: cellA1(columns.totalCost, rowNumber), value: centsToDollarString(payload.amountCents) },
        ];
  const wrote = await batchWriteRanges({ spreadsheetId, data });
  if (!wrote.ok) return wrote;
  const week = weekBoundsForDate(payload.isoDate);
  const inserted = await supabase.from("fuel_transactions").upsert(
    {
      vektor_transaction_id: `file-fuel:${payload.dedupeKey}`,
      truck_id: truck.id,
      unit_number: unit,
      transacted_at: `${payload.isoDate} 00:00:00`,
      transacted_date: payload.isoDate,
      week_start: week.start,
      week_end: week.end,
      product: payload.product,
      card: payload.card || null,
      gallons_milli: payload.gallonsMilli,
      amount_cents: payload.amountCents,
    },
    { onConflict: "vektor_transaction_id", ignoreDuplicates: true },
  );
  if (inserted.error) return schemaOr(inserted.error);
  const logged = await supabase.from("fuel_file_imports").upsert(
    {
      unit_number: unit,
      invoice: payload.invoice,
      item: payload.item,
      qty_milli: payload.gallonsMilli,
      amount_cents: payload.amountCents,
      transacted_date: payload.isoDate,
      location: payload.location,
      load_id: loadId || null,
      trip_id: tripId || null,
      sheet_tab: tab,
      sheet_row: rowNumber,
    },
    { onConflict: "unit_number,invoice,item,qty_milli", ignoreDuplicates: true },
  );
  if (logged.error) return schemaOr(logged.error);
  return { ok: true };
}

async function writeApprovedToll(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: TollQueuePayload,
  unit: string,
  loadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const truck = await truckByUnit(supabase, unit);
  if (!truck) return { ok: false, error: "That truck was not found." };
  const spreadsheetId = spreadsheetIdFromUrl(truck.google_sheet_url);
  if (!spreadsheetId) return { ok: false, error: "This truck has no Google Sheet link." };
  const book = await loadTruckWorkbook({ unitNumber: truck.unit_number, googleSheetUrl: truck.google_sheet_url });
  if (!book.loadLedger) return { ok: false, error: "Load Ledger was not found on this truck's sheet." };
  const targets = tollTargetsFromLedgerGrid(book.loadLedger);
  const target = targets?.rows.find((row) => row.loadId === loadId);
  if (!targets || !target) return { ok: false, error: "Toll Expense cell for this load was not found." };
  const current = sheetAmountToCents(target.current);
  const blank = isEmptyCell(target.current);
  if (!blank && current == null) return { ok: false, error: "Toll Expense is not a dollar amount, so it was left unchanged." };
  const next = (blank ? 0 : current!) + payload.amountCents;
  if (next < 0) return { ok: false, error: "A negative amount is not entered." };
  const wrote = await batchWriteRanges({
    spreadsheetId,
    data: [{ tab: ledgerTab(unit), a1: cellA1(targets.column, target.rowNumber), value: centsToDollarString(next) }],
  });
  if (!wrote.ok) return wrote;
  const week = weekBoundsForDate(payload.isoDate);
  const inserted = await supabase.from("toll_transactions").upsert(
    {
      vektor_transaction_id: `file-toll:${payload.transactionId}`,
      truck_id: truck.id,
      unit_number: unit,
      transacted_at: payload.occurredAt.replace("T", " "),
      transacted_date: payload.isoDate,
      week_start: week.start,
      week_end: week.end,
      amount_cents: payload.amountCents,
      location: payload.location || null,
    },
    { onConflict: "vektor_transaction_id", ignoreDuplicates: true },
  );
  if (inserted.error) return schemaOr(inserted.error);
  const logged = await supabase.from("toll_file_imports").upsert(
    {
      transaction_id: payload.transactionId,
      unit_number: unit,
      load_id: loadId,
      amount_cents: payload.amountCents,
      transacted_at: payload.occurredAt.replace("T", " "),
      location: payload.location || null,
    },
    { onConflict: "transaction_id", ignoreDuplicates: true },
  );
  if (logged.error) return schemaOr(logged.error);
  return { ok: true };
}

async function truckByUnit(supabase: Awaited<ReturnType<typeof createClient>>, unit: string) {
  const trucks = await supabase.from("trucks").select("id, unit_number, google_sheet_url");
  return (trucks.data ?? []).find((truck) => unitNumberFromRaw(truck.unit_number) === unit) ?? null;
}
