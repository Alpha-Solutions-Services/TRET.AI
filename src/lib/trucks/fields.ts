import type { TruckClass } from "@/lib/fee-engine";
import { tryPercentStringToBp, bpToPercentString } from "@/lib/fees/percent";
import { centsToDollarString, tryDollarStringToCents } from "@/lib/money/cents";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { isTolsonPayableType, type TolsonPayableType } from "@/lib/trucks/tolson";

export const GOOGLE_SHEET_MIGRATION_MESSAGE =
  "Google Sheet links need migration 20261007170000_truck_google_sheet_url.sql. It has not been applied yet.";

export const TOLSON_MIGRATION_MESSAGE =
  "Tolson payable needs migration 20261007200000_truck_tolson_payable.sql. It has not been applied yet.";

const SHEET_URL_MAX = 2000;

export type TruckFieldInput = {
  unitNumber: string;
  name: string;
  truckClass: string;
  ownerName: string;
  googleSheetUrl: string;
  tolsonPayableType: string;
  tolsonPayableValue: string;
};

export type ParsedTruckFields = {
  unitNumber: string;
  name: string;
  truckClass: TruckClass;
  ownerName: string | null;
  googleSheetUrl: string | null;
  tolsonPayableType: TolsonPayableType | null;
  tolsonPayableValue: number | null;
};

export type TruckFieldResult =
  | { ok: true; value: ParsedTruckFields }
  | { ok: false; error: string };

export function parseGoogleSheetUrl(
  raw: string,
): { ok: true; url: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: null };
  if (trimmed.length > SHEET_URL_MAX) {
    return { ok: false, error: "Google Sheet link is too long." };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, error: "Google Sheet must be an https link." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Google Sheet must be an https link." };
  }

  if (parsed.protocol !== "https:" || !parsed.hostname) {
    return { ok: false, error: "Google Sheet must be an https link." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Google Sheet must be an https link." };
  }

  const url = trimmed.replace(/^https:\/\//i, "https://");
  if (!/^https:\/\/\S+$/.test(url) || url.length > SHEET_URL_MAX) {
    return { ok: false, error: "Google Sheet must be an https link." };
  }
  return { ok: true, url };
}

/** Safe href for an already stored value. Anything else stays plain text. */
export function googleSheetHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parseGoogleSheetUrl(raw);
  if (!parsed.ok) return null;
  return parsed.url;
}

/** Blank type and value stay null. A stored number is shown only after someone saves one. */
export function formatTolsonPayableValue(
  type: TolsonPayableType | null,
  value: number | null,
): string {
  if (!isTolsonPayableType(type) || value == null) return "";
  if (type === "percent_of_gross") return bpToPercentString(value);
  return centsToDollarString(value);
}

export function parseTolsonPayable(
  typeRaw: string,
  valueRaw: string,
): { ok: true; type: TolsonPayableType | null; value: number | null } | { ok: false; error: string } {
  const typeText = typeRaw.trim();
  const valueText = valueRaw.trim();
  if (!typeText && !valueText) return { ok: true, type: null, value: null };
  if (!typeText) return { ok: false, error: "Choose a Tolson payable type or clear the value." };
  if (!isTolsonPayableType(typeText)) return { ok: false, error: "Choose percent of gross or a fixed weekly amount." };
  if (!valueText) return { ok: false, error: "Enter a Tolson payable value or choose Not set." };
  if (typeText === "percent_of_gross") {
    const parsed = tryPercentStringToBp(valueText);
    if (!parsed.ok) return { ok: false, error: "Enter a percent from 0 to 100 with up to 2 decimal places." };
    return { ok: true, type: typeText, value: parsed.bp };
  }
  const parsed = tryDollarStringToCents(valueText);
  if (!parsed.ok) return { ok: false, error: "Enter a weekly dollar amount with up to 2 decimal places." };
  return { ok: true, type: typeText, value: parsed.cents };
}

export function parseTruckFields(input: TruckFieldInput): TruckFieldResult {
  const unitNumber = input.unitNumber.trim();
  const name = input.name.trim();
  const ownerName = input.ownerName.trim();

  if (!unitNumber) return { ok: false, error: "Unit number is required." };
  if (!name) return { ok: false, error: "Name is required." };
  if (input.truckClass !== "legacy_owned" && input.truckClass !== "third_party") {
    return { ok: false, error: "Choose Legacy-owned or Third-party." };
  }

  const sheet = parseGoogleSheetUrl(input.googleSheetUrl);
  if (!sheet.ok) return sheet;

  const tolson = parseTolsonPayable(input.tolsonPayableType, input.tolsonPayableValue);
  if (!tolson.ok) return tolson;

  return {
    ok: true,
    value: {
      unitNumber,
      name,
      truckClass: input.truckClass,
      ownerName: ownerName || null,
      googleSheetUrl: sheet.url,
      tolsonPayableType: tolson.type,
      tolsonPayableValue: tolson.value,
    },
  };
}

export function isMissingGoogleSheetColumn(error: {
  code?: string;
  message: string;
}): boolean {
  return /google_sheet_url/i.test(error.message) && isMissingSchemaError(error);
}

export function isMissingTolsonColumn(error: {
  code?: string;
  message: string;
}): boolean {
  return /tolson_payable/i.test(error.message) && isMissingSchemaError(error);
}
