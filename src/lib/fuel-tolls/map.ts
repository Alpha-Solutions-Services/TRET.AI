import { weekBoundsForDate } from "@/lib/fee-engine";
import { normalizeTimestamp, timestampToDate } from "@/lib/vektor/dates";
import { decimalStringToCents } from "@/lib/vektor/money";
import { gallonsStringToMilli } from "./quantity";
import type { FuelDraft, FuelProduct, TollDraft } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

/** Prefer a non-zero money string. Vektor sometimes puts 0.00 in the raw field. */
function pickMoney(record: Record<string, unknown>, keys: string[]): string | null {
  let zero: string | null = null;
  for (const key of keys) {
    const value = asString(record[key]);
    if (!value) continue;
    if (value === "0" || value === "0.0" || value === "0.00") {
      zero ??= value;
      continue;
    }
    return value;
  }
  return zero;
}

function productOf(value: string | null): FuelProduct {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "diesel" || text === "dsl" || text === "fuel_diesel") return "diesel";
  if (text === "def" || text === "diesel_exhaust_fluid") return "def";
  if (!text) return "diesel";
  return "other";
}

function centsOf(raw: string | null): { cents: number | null; error: string | null } {
  if (raw == null) return { cents: null, error: "Amount is missing." };
  try {
    const cents = decimalStringToCents(raw);
    if (cents < 0) return { cents: null, error: "Amount cannot be negative." };
    return { cents, error: null };
  } catch {
    return { cents: null, error: "Amount is not a dollar value." };
  }
}

function whenOf(raw: string | null): {
  transactedAt: string | null;
  transactedDate: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  error: string | null;
} {
  const transactedAt = normalizeTimestamp(raw);
  const transactedDate = timestampToDate(transactedAt);
  if (!transactedAt || !transactedDate) {
    return {
      transactedAt: null,
      transactedDate: null,
      weekStart: null,
      weekEnd: null,
      error: "Transaction time is missing or not a date.",
    };
  }
  const week = weekBoundsForDate(transactedDate);
  return {
    transactedAt,
    transactedDate,
    weekStart: week.start,
    weekEnd: week.end,
    error: null,
  };
}

export function mapFuelRecord(value: unknown): FuelDraft {
  const record = asRecord(value) ?? {};
  const truck = asRecord(record.truck);
  const id =
    firstString(record, ["transactionId", "transaction_id", "id"]) ?? "";
  const unit =
    firstString(record, ["unitNumber", "unit_number", "truckUnitNumber", "referenceId"]) ??
    (truck
      ? firstString(truck, ["referenceId", "reference_id", "unitNumber", "unit_number"])
      : null);
  const when = whenOf(
    firstString(record, [
      "transactedAt",
      "transacted_at",
      "transactionDate",
      "transaction_date",
      "date",
      "postedAt",
    ]),
  );
  const amount = centsOf(
    pickMoney(record, [
      "discountedAmount",
      "discounted_amount",
      "amount",
      "totalAmount",
      "formattedDiscountedAmount",
      "amountFormatted",
    ]),
  );
  const retailRaw = pickMoney(record, [
    "retailAmount",
    "retail_amount",
    "formattedRetailAmount",
  ]);
  const retail = retailRaw ? centsOf(retailRaw) : { cents: null, error: null };
  const gallonsRaw = firstString(record, ["gallons", "quantity", "volume"]);
  let gallonsMilli: number | null = null;
  let gallonsError: string | null = null;
  if (gallonsRaw == null) gallonsError = "Gallons are missing.";
  else {
    try {
      gallonsMilli = gallonsStringToMilli(gallonsRaw);
    } catch (err) {
      gallonsError = err instanceof Error ? err.message : "Gallons are invalid.";
    }
  }
  const invalid =
    (!id ? "Transaction id is missing." : null) ??
    when.error ??
    amount.error ??
    retail.error ??
    gallonsError;
  return {
    vektorTransactionId: id,
    unitNumber: unit,
    transactedAt: when.transactedAt,
    transactedDate: when.transactedDate,
    weekStart: when.weekStart,
    weekEnd: when.weekEnd,
    product: productOf(firstString(record, ["product", "fuelType", "fuel_type", "type"])),
    card: firstString(record, ["cardNumber", "card_number", "card", "fuelCard"]),
    gallonsMilli,
    amountCents: amount.cents,
    retailAmountCents: retail.cents,
    invalidReason: invalid,
    source: value,
  };
}

export function mapTollRecord(
  value: unknown,
  truckUnitsByVektorId: ReadonlyMap<string, string>,
): TollDraft {
  const record = asRecord(value) ?? {};
  const truck = asRecord(record.truck);
  const id = firstString(record, ["transactionId", "transaction_id", "id"]) ?? "";
  const vektorTruckId =
    firstString(record, ["truckId", "truck_id"]) ??
    (truck ? firstString(truck, ["truckId", "truck_id", "id"]) : null);
  const fromLookup = vektorTruckId ? (truckUnitsByVektorId.get(vektorTruckId) ?? null) : null;
  const fromRow =
    firstString(record, ["unitNumber", "unit_number", "referenceId", "reference_id"]) ??
    (truck
      ? firstString(truck, ["referenceId", "reference_id", "unitNumber", "unit_number"])
      : null);
  const unitNumber = fromLookup ?? fromRow;
  const when = whenOf(
    firstString(record, [
      "transactedAt",
      "transacted_at",
      "transactionDate",
      "transaction_date",
      "date",
      "postedAt",
    ]),
  );
  const amount = centsOf(
    pickMoney(record, ["amount", "totalAmount", "formattedAmount", "amountFormatted"]),
  );
  const invalid =
    (!id ? "Transaction id is missing." : null) ?? when.error ?? amount.error;
  return {
    vektorTransactionId: id,
    vektorTruckId,
    unitNumber,
    transactedAt: when.transactedAt,
    transactedDate: when.transactedDate,
    weekStart: when.weekStart,
    weekEnd: when.weekEnd,
    amountCents: amount.cents,
    card: firstString(record, ["card", "cardNumber", "transponder", "tagNumber", "tag"]),
    location: firstString(record, ["location", "plaza", "description", "agency"]),
    invalidReason: invalid,
    source: value,
  };
}

export function recordsFromPayload(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  if (firstString(record, ["transactionId", "transaction_id", "id"])) return [record];
  return [];
}
