import { weekBoundsForDate } from "@/lib/fee-engine/week";
import { gallonsStringToMilli } from "@/lib/fuel-tolls/quantity";
import { centsToDollarString } from "@/lib/money/cents";
import { findHeaderRow, isEmptyCell, sheetAmountToCents, sheetDay } from "@/lib/sheets/cell";
import {
  SEEDED_IDENTITIES,
  findByCard,
  findByPlate,
  findByTag,
  findByUnit,
  plateKey,
  truckLabel,
  type TruckIdentity,
} from "./mappings";
import { cellA1, fuelLogTab, ledgerTab, locateFuelLogColumns, locateTollExpenseColumn } from "./sheet-columns";
import { columnLetter } from "@/lib/sheets/write-cell";
import { isoToUs, linkFuelDate, linkTollTime } from "./link";
import { parseGrid, type RawFuel, type RawToll } from "./parse";
import type {
  FuelQueuePayload,
  ImportContext,
  ImportPreviewRow,
  LoadWindow,
  PlanResult,
  PlannedCell,
  PreviewStatus,
  TollQueuePayload,
  TollTarget,
} from "./types";

export const STANDARD_FUEL_HEADER = [
  "Date",
  "Week",
  "Month",
  "Truck ID",
  "Driver",
  "Location",
  "Load ID",
  "Trip Group ID",
  "Gallons",
  "Total Cost",
  "Cost/Gal",
  "Miles",
  "MPG",
  "Link Status",
];

type FuelLogReady = {
  located: Extract<ReturnType<typeof locateFuelLogColumns>, { ok: true }>;
  headerIndex: number;
  nextRow: number;
  existing: { date: string; location: string; gallonsMilli: number; amountCents: number }[];
};

export function planImport(
  grid: string[][],
  context: ImportContext = {},
  identities: readonly TruckIdentity[] = SEEDED_IDENTITIES,
): PlanResult {
  const parsed = parseGrid(grid);
  if (parsed.kind === "unknown") {
    return {
      kind: "unknown",
      rows: [],
      headers: parsed.header,
      message: "This file is not a fuel card CSV or an E-ZPass workbook.",
      aiNotice: null,
    };
  }
  if (parsed.kind === "fuel") {
    return {
      kind: "fuel",
      rows: planFuel(parsed.rows, context, identities),
      headers: parsed.header,
      message: null,
      aiNotice: null,
    };
  }
  return {
    kind: "toll",
    rows: planToll(parsed.rows, context, identities),
    headers: parsed.header,
    message: null,
    aiNotice: null,
  };
}

function productOf(item: string): "diesel" | "def" | null {
  const key = item.trim().toUpperCase();
  if (key === "ULSD" || key === "ULSR") return "diesel";
  if (key === "DEFD" || key === "DEF") return "def";
  return null;
}

function locationOf(city: string, state: string): string {
  return `${city} ${state}`.replace(/\s+/g, " ").trim().toUpperCase();
}

function fuelKey(unit: string, invoice: string, item: string, qtyMilli: number): string {
  return `${unit}|${invoice.trim()}|${item.trim().toUpperCase()}|${qtyMilli}`;
}

function planFuel(
  rows: RawFuel[],
  context: ImportContext,
  identities: readonly TruckIdentity[],
): ImportPreviewRow[] {
  const logs = new Map<string, FuelLogReady | { error: string }>();
  const used = new Map<string, number>();
  const seenFile = new Set<string>();
  const seenKeys = new Set(context.importedFuelKeys ?? []);
  const out: ImportPreviewRow[] = [];

  for (const raw of rows) {
    const reasons: string[] = [];
    const iso = sheetDay(raw.tranDate);
    const cents = sheetAmountToCents(raw.amt);
    let gallonsMilli: number | null = null;
    try {
      if (raw.qty.trim()) gallonsMilli = gallonsStringToMilli(raw.qty.trim());
    } catch {
      gallonsMilli = null;
      reasons.push("Gallons are not a number with up to 3 decimal places.");
    }
    const product = productOf(raw.item);
    if (!product) reasons.push(`Item ${raw.item || "(blank)"} is not fuel or DEF.`);
    if (!iso) reasons.push("Tran Date is missing or not a date.");
    if (cents == null) reasons.push("Amount is blank or not a dollar amount.");
    else if (cents < 0) reasons.push("Amount is negative, so this looks like a refund or credit.");

    const byUnit = findByUnit(identities, raw.unit);
    const byCard = findByCard(identities, raw.card);
    let unitNumber: string | null = null;
    if (raw.unit.trim() && !byUnit) reasons.push(`Unit ${raw.unit.trim()} is not a known truck.`);
    else if (!raw.unit.trim() && !byCard) reasons.push("Unit is blank.");
    if (byUnit && byCard && byUnit.unitNumber !== byCard.unitNumber) {
      reasons.push(
        `Card ${raw.card.trim()} belongs to ${truckLabel(byCard.unitNumber)}, but the row says unit ${raw.unit.trim()}. Fuel bought for another truck is not entered.`,
      );
    } else if (byUnit) {
      unitNumber = byUnit.unitNumber;
    } else if (!raw.unit.trim() && byCard) {
      unitNumber = byCard.unitNumber;
    }

    const location = locationOf(raw.city, raw.state);
    if (!location) reasons.push("City and state are blank.");

    if (reasons.length > 0 || !unitNumber || !iso || cents == null || cents < 0 || gallonsMilli == null || !product) {
      const week = iso ? weekBoundsForDate(iso) : null;
      const payload: FuelQueuePayload | null =
        iso && week && cents != null && cents >= 0 && gallonsMilli != null && product
          ? {
              kind: "fuel",
              unitNumber,
              isoDate: iso,
              dateDisplay: isoToUs(iso),
              location,
              loadId: "",
              tripId: "",
              gallonsText: raw.qty.trim(),
              gallonsMilli,
              amountCents: cents,
              invoice: raw.invoice.trim(),
              item: raw.item.trim().toUpperCase(),
              product,
              card: raw.card.trim(),
              weekStart: week.start,
              weekEnd: week.end,
              reason: reasons.join(" ") || "This fuel row was not entered.",
              aiSuggested: false,
              written: false,
              sheetRow: null,
              dedupeKey: fuelKey(unitNumber ?? (raw.unit.trim() || "unknown"), raw.invoice, raw.item, gallonsMilli),
            }
          : null;
      out.push({
        kind: "fuel",
        status: "flagged",
        reason: reasons.join(" ") || "This fuel row was not entered.",
        aiSuggested: false,
        aiSuggestion: null,
        unitNumber,
        truck: unitNumber ? truckLabel(unitNumber) : null,
        weekLabel: week ? `${week.start} to ${week.end}` : null,
        link: null,
        targetSheet: unitNumber ? fuelLogTab(unitNumber) : null,
        cells: [],
        sourceRow: raw.sourceRow,
        amountCents: cents,
        queue: true,
        payload,
      });
      continue;
    }

    const loads = loadsFor(context, unitNumber);
    const linked = linkFuelDate(iso, loads);
    let loadId = "";
    let tripId = "";
    let status: PreviewStatus = "new";
    let reason: string | null = null;
    let queue = false;
    if (!linked.ok) {
      status = "flagged";
      reason = linked.reason;
      queue = true;
    } else {
      loadId = linked.loadId;
      tripId = linked.tripId;
      if (linked.unlinked) {
        queue = true;
        reason = `No load covers ${isoToUs(iso)}. The row is written with Load ID and Trip Group ID blank.`;
      }
    }

    const fileDup = `${unitNumber}|${iso}|${location}|${raw.item.trim().toUpperCase()}|${gallonsMilli}|${cents}`;
    const importKey = fuelKey(unitNumber, raw.invoice, raw.item, gallonsMilli);
    if (status !== "flagged") {
      if (seenFile.has(fileDup) || seenKeys.has(importKey)) {
        status = "duplicate";
        reason = "This invoice, item, and quantity were already imported.";
        queue = false;
      } else if (sheetHasFuel(logFor(logs, context, unitNumber), iso, location, gallonsMilli, cents)) {
        status = "duplicate";
        reason = "The Fuel Log already has this date, location, gallons, and total cost.";
        queue = false;
      }
    }
    seenFile.add(fileDup);

    const week = weekBoundsForDate(iso);
    const ready = logFor(logs, context, unitNumber);
    let cells: PlannedCell[] = [];
    let sheetRow: number | null = null;
    if (status === "new") {
      if (!ready || "error" in ready) {
        status = "flagged";
        queue = true;
        const detail = ready && "error" in ready ? ready.error : "missing";
        reason =
          detail === "missing" || detail === "header"
            ? `Fuel Log headers were not found for ${truckLabel(unitNumber)}, so this row was not written.`
            : detail;
      } else {
        const offset = used.get(unitNumber) ?? 0;
        sheetRow = ready.nextRow + offset;
        used.set(unitNumber, offset + 1);
        cells = fuelCells(ready, sheetRow, {
          date: isoToUs(iso),
          location,
          loadId,
          tripId,
          gallons: raw.qty.trim(),
          totalCost: centsToDollarString(cents),
        });
        seenKeys.add(importKey);
      }
    }

    const payload: FuelQueuePayload | null =
      status === "duplicate"
        ? null
        : {
            kind: "fuel",
            unitNumber,
            isoDate: iso,
            dateDisplay: isoToUs(iso),
            location,
            loadId,
            tripId,
            gallonsText: raw.qty.trim(),
            gallonsMilli,
            amountCents: cents,
            invoice: raw.invoice.trim(),
            item: raw.item.trim().toUpperCase(),
            product,
            card: raw.card.trim(),
            weekStart: week.start,
            weekEnd: week.end,
            reason,
            aiSuggested: false,
            written: status === "new",
            sheetRow,
            dedupeKey: importKey,
          };

    out.push({
      kind: "fuel",
      status,
      reason,
      aiSuggested: false,
      aiSuggestion: null,
      unitNumber,
      truck: truckLabel(unitNumber),
      weekLabel: `${week.start} to ${week.end}`,
      link: tripId || loadId || null,
      targetSheet: fuelLogTab(unitNumber),
      cells,
      sourceRow: raw.sourceRow,
      amountCents: cents,
      queue,
      payload,
    });
  }
  return out;
}

function fuelCells(
  ready: FuelLogReady,
  rowNumber: number,
  values: { date: string; location: string; loadId: string; tripId: string; gallons: string; totalCost: string },
): PlannedCell[] {
  const columns = ready.located.columns;
  const specs: [string, number, string][] = [
    ["Date", columns.date, values.date],
    ["Location", columns.location, values.location],
    ["Load ID", columns.loadId, values.loadId],
    ["Trip Group ID", columns.trip, values.tripId],
    ["Gallons", columns.gallons, values.gallons],
    ["Total Cost", columns.totalCost, values.totalCost],
  ];
  return specs.map(([header, column, value]) => ({ header, a1: cellA1(column, rowNumber), value }));
}

function logFor(
  cache: Map<string, FuelLogReady | { error: string }>,
  context: ImportContext,
  unitNumber: string,
): FuelLogReady | { error: string } | undefined {
  const cached = cache.get(unitNumber);
  if (cached) return cached;
  const grid = context.fuelLogs?.find((log) => log.unitNumber === unitNumber)?.grid;
  if (!grid) {
    const missing = { error: "missing" };
    cache.set(unitNumber, missing);
    return missing;
  }
  const headerIndex = findHeaderRow(grid, [["date"], ["gallons"]]);
  if (headerIndex < 0) {
    const missing = { error: "header" };
    cache.set(unitNumber, missing);
    return missing;
  }
  const located = locateFuelLogColumns(grid[headerIndex] ?? []);
  if (!located.ok) {
    const missing = { error: located.error };
    cache.set(unitNumber, missing);
    return missing;
  }
  const existing: FuelLogReady["existing"] = [];
  let last = headerIndex;
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const row = grid[index] ?? [];
    const date = sheetDay(row[located.columns.date] ?? "");
    const location = (row[located.columns.location] ?? "").trim();
    const gallons = (row[located.columns.gallons] ?? "").trim();
    const cost = row[located.columns.totalCost] ?? "";
    if (!date && !location && !gallons && isEmptyCell(cost)) continue;
    last = index;
    if (!date) continue;
    let gallonsMilli: number | null = null;
    try {
      if (gallons) gallonsMilli = gallonsStringToMilli(gallons);
    } catch {
      gallonsMilli = null;
    }
    const amountCents = sheetAmountToCents(cost);
    if (gallonsMilli == null || amountCents == null) continue;
    existing.push({
      date,
      location: location.replace(/\s+/g, " ").toUpperCase(),
      gallonsMilli,
      amountCents,
    });
  }
  const ready: FuelLogReady = {
    located,
    headerIndex,
    nextRow: last + 2,
    existing,
  };
  cache.set(unitNumber, ready);
  return ready;
}

function sheetHasFuel(
  ready: FuelLogReady | { error: string } | undefined,
  iso: string,
  location: string,
  gallonsMilli: number,
  amountCents: number,
): boolean {
  if (!ready || "error" in ready) return false;
  return ready.existing.some(
    (row) =>
      row.date === iso &&
      row.location === location &&
      row.gallonsMilli === gallonsMilli &&
      row.amountCents === amountCents,
  );
}

function loadsFor(context: ImportContext, unitNumber: string): LoadWindow[] {
  return context.ledgers?.find((ledger) => ledger.unitNumber === unitNumber)?.loads ?? [];
}

function weekLabel(iso: string): string {
  const week = weekBoundsForDate(iso);
  return `${week.start} to ${week.end}`;
}

function blankPlaza(value: string): boolean {
  const text = value.trim();
  return text === "" || text === "-" || /^none$/i.test(text);
}

/** Exit time for a closed road and for a single-point toll that has an exit. Never Post Date. */
export function tollWhen(raw: {
  entryDate: string;
  entryTime: string;
  entryPlaza: string;
  entryPlazaName: string;
  exitDate: string;
  exitTime: string;
}): { isoDate: string; occurredAt: string; display: string } | null {
  const exitDate = sheetDay(raw.exitDate);
  const entryDate = sheetDay(raw.entryDate);
  const chosen = exitDate
    ? { dateRaw: raw.exitDate, timeRaw: raw.exitTime, iso: exitDate }
    : entryDate
      ? { dateRaw: raw.entryDate, timeRaw: raw.entryTime, iso: entryDate }
      : null;
  if (!chosen) return null;
  const time = clock(chosen.timeRaw) ?? "00:00:00";
  return {
    isoDate: chosen.iso,
    occurredAt: `${chosen.iso}T${time}`,
    display: `${isoToUs(chosen.iso)} ${time}`,
  };
}

function clock(raw: string): string | null {
  const text = raw.trim();
  if (!text || blankPlaza(text)) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function planToll(rows: RawToll[], context: ImportContext, identities: readonly TruckIdentity[]): ImportPreviewRow[] {
  const knownIds = new Set((context.importedTolls ?? []).map((row) => row.transactionId));
  const seen = new Set<string>();
  const staged: ImportPreviewRow[] = [];

  for (const raw of rows) {
    const reasons: string[] = [];
    const when = tollWhen(raw);
    if (!when) reasons.push("Toll time is missing. Post Date is not used.");
    const cents = sheetAmountToCents(raw.amount);
    if (cents == null) reasons.push("Amount is blank or not a dollar amount.");
    else if (cents < 0) reasons.push("Amount is negative, so this looks like a refund or credit.");
    if (!raw.transactionId.trim()) reasons.push("Transaction Id is blank.");

    const resolved = resolveTollTruck(raw, identities);
    if ("reason" in resolved) reasons.push(resolved.reason);
    const unitNumber = "truck" in resolved ? resolved.truck.unitNumber : null;

    if (reasons.length > 0 || !unitNumber || !when || cents == null || cents < 0 || !raw.transactionId.trim()) {
      staged.push({
        kind: "toll",
        status: "flagged",
        reason: reasons.join(" "),
        aiSuggested: false,
        aiSuggestion: null,
        unitNumber,
        truck: unitNumber ? truckLabel(unitNumber) : null,
        weekLabel: when ? weekLabel(when.isoDate) : null,
        link: null,
        targetSheet: unitNumber ? ledgerTab(unitNumber) : null,
        cells: [],
        sourceRow: raw.sourceRow,
        amountCents: cents,
        queue: true,
        payload: null,
      });
      continue;
    }

    const tx = raw.transactionId.trim();
    if (seen.has(tx) || knownIds.has(tx)) {
      staged.push({
        kind: "toll",
        status: "duplicate",
        reason: "This Transaction Id was already imported.",
        aiSuggested: false,
        aiSuggestion: null,
        unitNumber,
        truck: truckLabel(unitNumber),
        weekLabel: weekLabel(when.isoDate),
        link: null,
        targetSheet: ledgerTab(unitNumber),
        cells: [],
        sourceRow: raw.sourceRow,
        amountCents: cents,
        queue: false,
        payload: null,
      });
      continue;
    }
    seen.add(tx);

    const link = linkTollTime(when.occurredAt, loadsFor(context, unitNumber));
    const week = weekBoundsForDate(when.isoDate);
    const location = raw.exitPlazaName.trim() || raw.entryPlazaName.trim();
    if (!link.ok) {
      staged.push({
        kind: "toll",
        status: "flagged",
        reason: link.reason,
        aiSuggested: false,
        aiSuggestion: null,
        unitNumber,
        truck: truckLabel(unitNumber),
        weekLabel: `${week.start} to ${week.end}`,
        link: null,
        targetSheet: ledgerTab(unitNumber),
        cells: [],
        sourceRow: raw.sourceRow,
        amountCents: cents,
        queue: true,
        payload: tollPayload({
          unitNumber,
          loadId: "",
          cents,
          tx,
          when,
          week,
          location,
          reason: link.reason,
          written: false,
        }),
      });
      continue;
    }

    staged.push({
      kind: "toll",
      status: "new",
      reason: link.how === "next" ? "Empty miles after a delivery were added to the next load." : null,
      aiSuggested: false,
      aiSuggestion: null,
      unitNumber,
      truck: truckLabel(unitNumber),
      weekLabel: `${week.start} to ${week.end}`,
      link: link.loadId,
      targetSheet: ledgerTab(unitNumber),
      cells: [],
      sourceRow: raw.sourceRow,
      amountCents: cents,
      queue: false,
      payload: tollPayload({
        unitNumber,
        loadId: link.loadId,
        cents,
        tx,
        when,
        week,
        location,
        reason: link.how === "next" ? "Empty miles after a delivery were added to the next load." : null,
        written: true,
      }),
    });
  }

  return applyTollCells(staged, context);
}

function tollPayload(input: {
  unitNumber: string;
  loadId: string;
  cents: number;
  tx: string;
  when: { isoDate: string; occurredAt: string };
  week: { start: string; end: string };
  location: string;
  reason: string | null;
  written: boolean;
}): TollQueuePayload {
  return {
    kind: "toll",
    unitNumber: input.unitNumber,
    loadId: input.loadId,
    amountCents: input.cents,
    transactionId: input.tx,
    occurredAt: input.when.occurredAt,
    isoDate: input.when.isoDate,
    weekStart: input.week.start,
    weekEnd: input.week.end,
    location: input.location,
    reason: input.reason,
    aiSuggested: false,
    written: input.written,
    dedupeKey: `toll:${input.tx}`,
  };
}

function applyTollCells(rows: ImportPreviewRow[], context: ImportContext): ImportPreviewRow[] {
  const groups = new Map<string, ImportPreviewRow[]>();
  for (const row of rows) {
    if (row.status !== "new" || row.payload?.kind !== "toll" || !row.payload.loadId || !row.unitNumber) continue;
    const key = `${row.unitNumber}|${row.payload.loadId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const [unitNumber, loadId] = key.split("|");
    const add = list.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
    const logged = (context.importedTolls ?? [])
      .filter((toll) => toll.loadId === loadId)
      .reduce((sum, toll) => sum + toll.amountCents, 0);
    const target = tollTarget(context, unitNumber!, loadId!);
    if (!target) {
      for (const row of list) flagToll(row, "Toll Expense cell for this load was not found, so the amount was not added.");
      continue;
    }
    const current = sheetAmountToCents(target.current);
    const blank = isEmptyCell(target.current);
    const owned = !blank && current === logged;
    if (!blank && !owned) {
      for (const row of list) {
        flagToll(
          row,
          "Toll Expense already has a value that this import did not write. It was left unchanged for your approval.",
        );
      }
      continue;
    }
    const after = logged + add;
    const value = centsToDollarString(after);
    const header = "Toll Expense";
    const a1 = `${columnLetter(target.column)}${target.rowNumber}`;
    for (const row of list) {
      row.cells = [{ header, a1, value }];
    }
  }
  return rows;
}

function flagToll(row: ImportPreviewRow, reason: string): void {
  row.status = "flagged";
  row.reason = reason;
  row.queue = true;
  row.cells = [];
  if (row.payload?.kind === "toll") {
    row.payload = { ...row.payload, written: false, reason };
  }
}

function tollTarget(
  context: ImportContext,
  unitNumber: string,
  loadId: string,
): (TollTarget & { column: number }) | null {
  const pack = context.tollTargets?.find((item) => item.unitNumber === unitNumber);
  if (!pack) return null;
  const column = pack.column;
  if (column == null || column < 0) return null;
  const row = pack.rows.find((item) => item.loadId === loadId);
  if (!row) return null;
  return { ...row, column };
}

function resolveTollTruck(
  raw: RawToll,
  identities: readonly TruckIdentity[],
): { truck: TruckIdentity } | { reason: string } {
  const signals: { source: string; raw: string; truck: TruckIdentity | null }[] = [];
  if (raw.unit.trim()) signals.push({ source: "Unit", raw: raw.unit.trim(), truck: findByUnit(identities, raw.unit) });
  if (raw.plate.trim() && plateKey(raw.plate) !== "NONE") {
    signals.push({ source: "Plate", raw: raw.plate.trim(), truck: findByPlate(identities, raw.plate) });
  }
  if (raw.tag.trim()) signals.push({ source: "Tag", raw: raw.tag.trim(), truck: findByTag(identities, raw.tag) });
  if (signals.length === 0) return { reason: "This toll has no unit, plate, or tag." };
  const unknown = signals.filter((signal) => !signal.truck);
  const known = signals.filter((signal) => signal.truck);
  if (known.length === 0) {
    return { reason: `${unknown.map((signal) => `${signal.source} ${signal.raw} is not on file`).join(". ")}.` };
  }
  const byUnit = known.find((signal) => signal.source === "Unit")?.truck ?? null;
  const units = new Set(known.map((signal) => signal.truck!.unitNumber));
  if (!byUnit && units.size > 1) {
    return {
      reason: `Plate and tag do not agree (${known
        .map((signal) => `${signal.source} ${signal.raw} is ${truckLabel(signal.truck!.unitNumber)}`)
        .join("; ")}).`,
    };
  }
  if (byUnit && [...units].some((unit) => unit !== byUnit.unitNumber)) {
    return {
      reason: `Unit, plate, and tag do not agree (${known
        .map((signal) => `${signal.source} ${signal.raw} is ${truckLabel(signal.truck!.unitNumber)}`)
        .join("; ")}).`,
    };
  }
  const truck = byUnit ?? known[0]!.truck!;
  const plate = truck.plates.find((item) => plateKey(item.plate) === plateKey(raw.plate));
  if (
    !byUnit &&
    plate?.state &&
    raw.plateState.trim() &&
    plate.state.toUpperCase() !== raw.plateState.trim().toUpperCase()
  ) {
    return {
      reason: `Plate ${raw.plate.trim()} is ${plate.state} on file, but the file says ${raw.plateState.trim()}.`,
    };
  }
  return { truck };
}

export function tollColumnFromHeader(header: string[]): number {
  return locateTollExpenseColumn(header);
}

export function markAiMapped(rows: ImportPreviewRow[]): ImportPreviewRow[] {
  const reason = "AI suggested the column map. Nothing is written until you approve this row in the queue.";
  return rows.map((row) => {
    if (row.status !== "new") {
      return {
        ...row,
        aiSuggested: true,
        reason: row.reason ? `${row.reason} AI suggested.` : "AI suggested.",
      };
    }
    const payload = row.payload
      ? row.payload.kind === "fuel"
        ? { ...row.payload, aiSuggested: true, written: false, sheetRow: null, reason }
        : { ...row.payload, aiSuggested: true, written: false, reason }
      : null;
    return { ...row, status: "flagged" as const, queue: true, aiSuggested: true, reason, payload };
  });
}
