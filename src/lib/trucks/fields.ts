import type { TruckClass } from "@/lib/fee-engine";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";

export const GOOGLE_SHEET_MIGRATION_MESSAGE =
  "Google Sheet links need migration 20261007170000_truck_google_sheet_url.sql. It has not been applied yet.";

const SHEET_URL_MAX = 2000;

export type TruckFieldInput = {
  unitNumber: string;
  name: string;
  truckClass: string;
  ownerName: string;
  googleSheetUrl: string;
};

export type ParsedTruckFields = {
  unitNumber: string;
  name: string;
  truckClass: TruckClass;
  ownerName: string | null;
  googleSheetUrl: string | null;
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

  return {
    ok: true,
    value: {
      unitNumber,
      name,
      truckClass: input.truckClass,
      ownerName: ownerName || null,
      googleSheetUrl: sheet.url,
    },
  };
}

export function isMissingGoogleSheetColumn(error: {
  code?: string;
  message: string;
}): boolean {
  return /google_sheet_url/i.test(error.message) && isMissingSchemaError(error);
}
