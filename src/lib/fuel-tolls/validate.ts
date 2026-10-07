import { matchTruckUnit } from "@/lib/vektor/validate";
import { mpgMilliFromHundredths, priceTenthCentsPerGallon } from "./quantity";
import type {
  DuplicateKey,
  FuelDecision,
  FuelDraft,
  FuelTollIssue,
  FuelTollSettings,
  LoadSpan,
  TollDecision,
  TollDraft,
  WeekMiles,
} from "./types";

export function duplicateIdentity(card: string | null, transactedAt: string, amountCents: number): string {
  return `${card ?? ""}\n${transactedAt}\n${amountCents}`;
}

export function dayCoveredByLoad(unitNumber: string, day: string, spans: LoadSpan[]): boolean {
  return spans.some(
    (span) =>
      span.unitNumber === unitNumber && span.startDate <= day && day <= span.endDate,
  );
}

function outsideRange(day: string, from: string, to: string): boolean {
  return day < from || day > to;
}

function rowCountBlock(
  fetched: number,
  previousFetched: number | null,
  settings: FuelTollSettings,
  label: string,
): FuelTollIssue | null {
  if (previousFetched == null || previousFetched <= 0) return null;
  const minAllowed = Math.ceil(
    (previousFetched * (100 - settings.rowCountDropBlockPct)) / 100,
  );
  if (fetched < minAllowed) {
    return {
      severity: "Block",
      rule: "row_count_drop",
      message: `Fetched ${fetched} ${label}; previous run had ${previousFetched}. Drop exceeds ${settings.rowCountDropBlockPct}% threshold.`,
    };
  }
  return null;
}

function hardReject(issues: FuelTollIssue[]): string | null {
  const blocking = issues.find((issue) => issue.severity === "Warn" || issue.severity === "Block");
  return blocking ? blocking.message : null;
}

export function decideFuelRow(
  draft: FuelDraft,
  opts: {
    knownUnits: Set<string>;
    loadSpans: LoadSpan[];
    rangeFrom: string;
    rangeTo: string;
    settings: FuelTollSettings;
    duplicate: boolean;
  },
): FuelDecision {
  const issues: FuelTollIssue[] = [];
  const ref = draft.vektorTransactionId || null;

  if (draft.invalidReason || !draft.vektorTransactionId) {
    issues.push({
      severity: "Warn",
      rule: "invalid_fuel_row",
      message: draft.invalidReason ?? "Transaction id is missing.",
      ref,
    });
    return { draft, issues, promote: false, rejectReason: issues[0]?.message ?? "invalid" };
  }

  if (
    draft.transactedDate &&
    outsideRange(draft.transactedDate, opts.rangeFrom, opts.rangeTo)
  ) {
    issues.push({
      severity: "Warn",
      rule: "date_outside_range",
      message: `Fuel date ${draft.transactedDate} is outside ${opts.rangeFrom}–${opts.rangeTo}.`,
      ref,
    });
  }

  const truck = matchTruckUnit(draft.unitNumber, opts.knownUnits);
  if (!truck.matched) {
    const shown = draft.unitNumber ?? "(blank)";
    issues.push({
      severity: "Warn",
      rule: "truck_unmatched",
      message: `No truck with unit_number "${shown}". Fuel stays in staging. Unit numbers match exactly (02 is not 2).`,
      ref,
    });
  }

  if (opts.duplicate) {
    issues.push({
      severity: "Warn",
      rule: "duplicate_transaction",
      message: "Another fuel transaction has the same card, time, and amount.",
      ref,
    });
  }

  const gallons = draft.gallonsMilli;
  const amount = draft.amountCents;
  if (gallons == null || gallons <= 0) {
    issues.push({
      severity: "Warn",
      rule: "gallons_missing",
      message: "Gallons are missing or zero, so price per gallon cannot be checked.",
      ref,
    });
  } else if (amount != null) {
    const price = priceTenthCentsPerGallon(amount, gallons);
    if (
      price == null ||
      price < opts.settings.priceMinTenthCents ||
      price > opts.settings.priceMaxTenthCents
    ) {
      issues.push({
        severity: "Warn",
        rule: "price_per_gallon_out_of_range",
        message: "Price per gallon is outside the range in settings.",
        ref,
      });
    }
    const tank =
      draft.product === "def"
        ? opts.settings.defTankGallonsMilli
        : opts.settings.dieselTankGallonsMilli;
    if (gallons > tank) {
      issues.push({
        severity: "Warn",
        rule: "gallons_above_tank",
        message: "Gallons are above the tank size in settings.",
        ref,
      });
    }
  }

  if (
    truck.matched &&
    draft.unitNumber &&
    draft.transactedDate &&
    !dayCoveredByLoad(draft.unitNumber, draft.transactedDate, opts.loadSpans)
  ) {
    issues.push({
      severity: "Warn",
      rule: "no_load_that_day",
      message: `Truck ${draft.unitNumber} has no load on ${draft.transactedDate}.`,
      ref,
    });
  }

  const rejectReason = hardReject(issues);
  return {
    draft,
    issues,
    promote: rejectReason == null,
    rejectReason,
  };
}

export function decideTollRow(
  draft: TollDraft,
  opts: {
    knownUnits: Set<string>;
    loadSpans: LoadSpan[];
    rangeFrom: string;
    rangeTo: string;
    duplicate: boolean;
  },
): TollDecision {
  const issues: FuelTollIssue[] = [];
  const ref = draft.vektorTransactionId || null;

  if (draft.invalidReason || !draft.vektorTransactionId) {
    issues.push({
      severity: "Warn",
      rule: "invalid_toll_row",
      message: draft.invalidReason ?? "Transaction id is missing.",
      ref,
    });
    return { draft, issues, promote: false, rejectReason: issues[0]?.message ?? "invalid" };
  }

  if (
    draft.transactedDate &&
    outsideRange(draft.transactedDate, opts.rangeFrom, opts.rangeTo)
  ) {
    issues.push({
      severity: "Warn",
      rule: "date_outside_range",
      message: `Toll date ${draft.transactedDate} is outside ${opts.rangeFrom}–${opts.rangeTo}.`,
      ref,
    });
  }

  const truck = matchTruckUnit(draft.unitNumber, opts.knownUnits);
  if (!truck.matched) {
    const truckId = draft.vektorTruckId ?? "(none)";
    const unit = draft.unitNumber ?? "(unresolved)";
    issues.push({
      severity: "Warn",
      rule: "truck_unmatched",
      message: `Toll truck id ${truckId} resolved to unit "${unit}", which is not an exact trucks.unit_number. Row stays in staging.`,
      ref,
    });
  }

  if (opts.duplicate) {
    issues.push({
      severity: "Warn",
      rule: "duplicate_transaction",
      message: "Another toll has the same card or truck, time, and amount.",
      ref,
    });
  }

  if (
    truck.matched &&
    draft.unitNumber &&
    draft.transactedDate &&
    !dayCoveredByLoad(draft.unitNumber, draft.transactedDate, opts.loadSpans)
  ) {
    issues.push({
      severity: "Warn",
      rule: "no_load_that_day",
      message: `Truck ${draft.unitNumber} has no load on ${draft.transactedDate}.`,
      ref,
    });
  }

  const rejectReason = hardReject(issues);
  return { draft, issues, promote: rejectReason == null, rejectReason };
}

function markDuplicates<T extends { vektorTransactionId: string }>(
  rows: T[],
  keyOf: (row: T) => string | null,
  existing: DuplicateKey[],
  existingKey: (row: DuplicateKey) => string,
): Set<string> {
  const losers = new Set<string>();
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row.vektorTransactionId);
    groups.set(key, list);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort();
    for (const id of sorted.slice(1)) losers.add(id);
  }
  const incomingIds = new Set(rows.map((row) => row.vektorTransactionId));
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const hit = existing.some(
      (prior) =>
        !incomingIds.has(prior.vektorTransactionId) &&
        prior.vektorTransactionId !== row.vektorTransactionId &&
        existingKey(prior) === key,
    );
    if (hit) losers.add(row.vektorTransactionId);
  }
  return losers;
}

export function fuelDuplicateLosers(rows: FuelDraft[], existing: DuplicateKey[]): Set<string> {
  return markDuplicates(
    rows.filter((row) => row.amountCents != null && row.transactedAt),
    (row) =>
      row.transactedAt && row.amountCents != null
        ? duplicateIdentity(row.card, row.transactedAt, row.amountCents)
        : null,
    existing,
    (row) => duplicateIdentity(row.card, row.transactedAt, row.amountCents),
  );
}

/** Toll duplicate key is card (or transponder, else Vektor truck id) + time + amount. */
export function tollDuplicateKey(row: {
  card: string | null;
  vektorTruckId: string | null;
  transactedAt: string;
  amountCents: number;
}): string {
  return duplicateIdentity(row.card ?? row.vektorTruckId, row.transactedAt, row.amountCents);
}

export function tollDuplicateLosers(rows: TollDraft[], existing: DuplicateKey[]): Set<string> {
  return markDuplicates(
    rows.filter((row) => row.amountCents != null && row.transactedAt),
    (row) =>
      row.transactedAt && row.amountCents != null
        ? tollDuplicateKey({
            card: row.card,
            vektorTruckId: row.vektorTruckId,
            transactedAt: row.transactedAt,
            amountCents: row.amountCents,
          })
        : null,
    existing,
    (row) => duplicateIdentity(row.card, row.transactedAt, row.amountCents),
  );
}

export function impossibleMpgIssues(
  decisions: FuelDecision[],
  weekMiles: WeekMiles[],
  settings: FuelTollSettings,
): FuelTollIssue[] {
  const gallons = new Map<string, number>();
  for (const decision of decisions) {
    if (!decision.promote || decision.draft.product === "def") continue;
    const unit = decision.draft.unitNumber;
    const week = decision.draft.weekStart;
    const qty = decision.draft.gallonsMilli;
    if (!unit || !week || qty == null) continue;
    const key = `${unit}\n${week}`;
    gallons.set(key, (gallons.get(key) ?? 0) + qty);
  }
  const issues: FuelTollIssue[] = [];
  for (const [key, qty] of gallons) {
    const [unit, week] = key.split("\n");
    const miles =
      weekMiles.find((row) => row.unitNumber === unit && row.weekStart === week)
        ?.milesHundredths ?? 0;
    const mpg = mpgMilliFromHundredths(miles, qty);
    if (mpg == null) continue;
    if (mpg < settings.mpgMinMilli || mpg > settings.mpgMaxMilli) {
      issues.push({
        severity: "Warn",
        rule: "impossible_mpg",
        message: `Truck ${unit} week ${week} MPG is outside the range in settings.`,
        ref: `${unit}:${week}`,
      });
    }
  }
  return issues;
}

export function validateFuelRowCountDrop(
  fetched: number,
  previousFetched: number | null,
  settings: FuelTollSettings,
): FuelTollIssue | null {
  return rowCountBlock(fetched, previousFetched, settings, "fuel rows");
}

export function validateTollRowCountDrop(
  fetched: number,
  previousFetched: number | null,
  settings: FuelTollSettings,
): FuelTollIssue | null {
  return rowCountBlock(fetched, previousFetched, settings, "toll rows");
}

/**
 * Week close is not built in this version. Call this when a week is closed.
 * Block when promoted fuel in that Monday week has no load delivered that week.
 */
export function validateUnlinkedFuelAtWeekClose(
  fuel: Array<{ unitNumber: string | null; weekStart: string | null }>,
  loadWeekUnits: Set<string>,
  weekStart: string,
): FuelTollIssue[] {
  const units = new Set<string>();
  for (const row of fuel) {
    if (row.weekStart === weekStart && row.unitNumber) units.add(row.unitNumber);
  }
  const issues: FuelTollIssue[] = [];
  for (const unit of units) {
    if (!loadWeekUnits.has(unit)) {
      issues.push({
        severity: "Block",
        rule: "unlinked_fuel_week_close",
        message: `Truck ${unit} has fuel in week ${weekStart} and no load delivered that week.`,
        ref: `${unit}:${weekStart}`,
      });
    }
  }
  return issues;
}
