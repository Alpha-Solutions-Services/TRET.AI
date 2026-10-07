import { driverNamesEqual } from "@/lib/loads/drivers";
import { canonicalLoadId, loadMatchKey } from "@/lib/loads/load-id";
import { layoutManifestGroups, type ManifestRole } from "@/lib/loads/manifest-miles";
import { compareSheetLoads, unitKey, type SheetMismatch } from "@/lib/sheets/mismatch";

export type DateKind = "order" | "manifest" | null;

export type LoadFacts = {
  unitNumber: string;
  loadId: string;
  deliveryDay: string | null;
  pickupDay?: string | null;
  rateCents: number | null;
  loadedMilesHundredths: number | null;
  deadheadMilesHundredths: number | null;
  driverName?: string | null;
  deliveryDateKind?: DateKind;
  pickupDateKind?: DateKind;
  manifestRef?: string | null;
};

export type AlignHighlight =
  | "missing_sheet"
  | "missing_vektor"
  | "rate"
  | "date"
  | "pickup"
  | "loaded_miles"
  | "deadhead"
  | "driver";

export type FieldAcceptance = {
  unitNumber: string;
  loadId: string;
  field: string;
  acceptedValue: string;
};

export type AlignedLoad = {
  unitNumber: string;
  loadId: string;
  sheet: LoadFacts | null;
  vektor: LoadFacts | null;
  highlights: AlignHighlight[];
  notes: string[];
  manifestRef: string | null;
  manifestRole: ManifestRole;
  manifestHeader: boolean;
};

function pairKey(unitNumber: string, loadId: string): string {
  return `${unitKey(unitNumber)}|${loadMatchKey(loadId)}`;
}

function displayId(sheet: LoadFacts | null, vektor: LoadFacts | null): string {
  return canonicalLoadId((sheet ?? vektor)!.loadId);
}

function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function milesLabel(hundredths: number | null): string {
  if (hundredths == null) return "blank";
  const sign = hundredths < 0 ? "-" : "";
  const abs = Math.abs(hundredths);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function indexFacts(rows: LoadFacts[]): Map<string, LoadFacts> {
  const map = new Map<string, LoadFacts>();
  for (const row of rows) {
    if (!row.loadId.trim()) continue;
    const key = pairKey(row.unitNumber, row.loadId);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

function mismatchKey(row: SheetMismatch): string {
  return pairKey(row.unitNumber, row.loadId);
}

/**
 * Lines sheet loads up with Vektor loads by load number.
 * Rate gaps and sheet loads missing from Vektor reuse compareSheetLoads.
 * Date and miles are highlighted here and are not stored as issues.
 */
export function alignSheetAndVektor(input: {
  weekStart: string;
  sheet: LoadFacts[];
  vektor: LoadFacts[];
  acceptances?: FieldAcceptance[];
}): AlignedLoad[] {
  const sheetByKey = indexFacts(input.sheet);
  const vektorByKey = indexFacts(input.vektor);
  const mismatches = compareSheetLoads({
    weekStart: input.weekStart,
    sheet: [...sheetByKey.values()].map((row) => ({
      unitNumber: row.unitNumber,
      loadId: row.loadId,
      rateCents: row.rateCents,
    })),
    vektor: [...vektorByKey.values()]
      .filter((row) => row.rateCents != null)
      .map((row) => ({
        unitNumber: row.unitNumber,
        loadId: row.loadId,
        rateCents: row.rateCents as number,
      })),
  });
  const byPair = new Map<string, SheetMismatch[]>();
  for (const row of mismatches) {
    const key = mismatchKey(row);
    const list = byPair.get(key) ?? [];
    list.push(row);
    byPair.set(key, list);
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of input.sheet) {
    if (!row.loadId.trim()) continue;
    const key = pairKey(row.unitNumber, row.loadId);
    if (seen.has(key) || !sheetByKey.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  const vektorOnly = [...vektorByKey.keys()].filter((key) => !seen.has(key)).sort();
  keys.push(...vektorOnly);

  const laid = layoutManifestGroups(
    keys.map((key) => buildAligned(key, sheetByKey, vektorByKey, byPair, input.acceptances ?? [])),
  );
  return laid.map((row) => {
    const { rankHundredths, ...aligned } = row;
    void rankHundredths;
    return aligned;
  });
}

function buildAligned(
  key: string,
  sheetByKey: Map<string, LoadFacts>,
  vektorByKey: Map<string, LoadFacts>,
  byPair: Map<string, SheetMismatch[]>,
  acceptances: FieldAcceptance[],
): AlignedLoad & { rankHundredths: number } {
  const sheet = sheetByKey.get(key) ?? null;
  const vektor = vektorByKey.get(key) ?? null;
  const highlights: AlignHighlight[] = [];
  const notes: string[] = [];
  const stored = byPair.get(key) ?? [];
  for (const row of stored) {
    if (row.rule === "sheet_load_missing") {
      highlights.push("missing_vektor");
      notes.push(`Load ${row.loadId} is on the sheet and not in Vektor for this week.`);
    }
    if (row.rule === "sheet_rate_diff") {
      highlights.push("rate");
      notes.push(row.message);
    }
  }
  if (!sheet && vektor) {
    highlights.push("missing_sheet");
    notes.push(`Load ${vektor.loadId} is in Vektor and not on the sheet for this week.`);
  }
  if (sheet && vektor) {
    if (sheet.deliveryDay && vektor.deliveryDay && sheet.deliveryDay !== vektor.deliveryDay) {
      if (vektor.deliveryDateKind === "manifest") {
        notes.push(`Vektor delivery date ${vektor.deliveryDay} is a manifest date.`);
      } else {
        highlights.push("date");
        notes.push(
          `Delivery date differs. The sheet says ${sheet.deliveryDay} and Vektor says ${vektor.deliveryDay}.`,
        );
      }
    }
    if (sheet.pickupDay && vektor.pickupDay && sheet.pickupDay !== vektor.pickupDay) {
      if (vektor.pickupDateKind === "manifest") {
        notes.push(`Vektor pickup date ${vektor.pickupDay} is a manifest date.`);
      } else {
        highlights.push("pickup");
        notes.push(
          `Pickup date differs. The sheet says ${sheet.pickupDay} and Vektor says ${vektor.pickupDay}.`,
        );
      }
    }
    pushMiles(highlights, notes, "loaded_miles", "Loaded miles", sheet.loadedMilesHundredths, vektor.loadedMilesHundredths, false);
    pushMiles(
      highlights,
      notes,
      "deadhead",
      "Deadhead miles",
      sheet.deadheadMilesHundredths,
      vektor.deadheadMilesHundredths,
      true,
    );
    if (
      sheet.rateCents != null &&
      vektor.rateCents != null &&
      sheet.rateCents !== vektor.rateCents &&
      !highlights.includes("rate")
    ) {
      highlights.push("rate");
      notes.push(
        `Rate differs. The sheet says ${dollars(sheet.rateCents)} and Vektor says ${dollars(vektor.rateCents)}.`,
      );
    }
    if (!driverNamesEqual(sheet.driverName, vektor.driverName)) {
      highlights.push("driver");
      notes.push(
        `Driver differs. The sheet says ${sheet.driverName || "blank"} and Vektor says ${vektor.driverName || "blank"}.`,
      );
    }
  }
  const kept = highlights.filter((field) => !accepted(acceptances, sheet, vektor, field));
  const manifestRef = chosenManifest(sheet, vektor);
  return {
    unitNumber: (sheet ?? vektor)!.unitNumber,
    loadId: displayId(sheet, vektor),
    sheet,
    vektor,
    highlights: kept,
    notes: kept.length === 0 && highlights.length > 0 ? notes.filter((note) => note.includes("manifest date")) : notes,
    manifestRef,
    manifestRole: "solo",
    manifestHeader: false,
    rankHundredths: rankMiles(sheet, vektor),
  };
}

function chosenManifest(sheet: LoadFacts | null, vektor: LoadFacts | null): string | null {
  const fromSheet = sheet?.manifestRef?.trim() || null;
  const fromVektor = vektor?.manifestRef?.trim() || null;
  return fromSheet || fromVektor;
}

function rankMiles(sheet: LoadFacts | null, vektor: LoadFacts | null): number {
  const values = [sheet?.loadedMilesHundredths, vektor?.loadedMilesHundredths].filter(
    (value): value is number => value != null,
  );
  if (values.length === 0) return 0;
  return Math.max(...values);
}

function accepted(
  rows: FieldAcceptance[],
  sheet: LoadFacts | null,
  vektor: LoadFacts | null,
  field: AlignHighlight,
): boolean {
  const unit = (sheet ?? vektor)!.unitNumber;
  const loadId = (sheet ?? vektor)!.loadId;
  const match = rows.find(
    (row) =>
      unitKey(row.unitNumber) === unitKey(unit) &&
      loadMatchKey(row.loadId) === loadMatchKey(loadId) &&
      row.field === highlightToField(field),
  );
  if (!match) return false;
  if (field === "missing_sheet" || field === "missing_vektor") return match.acceptedValue === "missing";
  if (!vektor) return false;
  return match.acceptedValue === acceptanceValue(field, vektor);
}

export function highlightToField(field: AlignHighlight): string {
  if (field === "date") return "delivery_date";
  if (field === "pickup") return "pickup_date";
  if (field === "loaded_miles") return "loaded_miles";
  if (field === "deadhead") return "deadhead";
  if (field === "driver") return "driver";
  if (field === "rate") return "rate";
  return "presence";
}

function acceptanceValue(field: AlignHighlight, vektor: LoadFacts): string {
  if (field === "rate") return String(vektor.rateCents ?? "");
  if (field === "date") return vektor.deliveryDay ?? "";
  if (field === "pickup") return vektor.pickupDay ?? "";
  if (field === "loaded_miles") return String(vektor.loadedMilesHundredths ?? "");
  if (field === "deadhead") return String(vektor.deadheadMilesHundredths ?? "");
  if (field === "driver") return vektor.driverName ?? "";
  return "missing";
}

function pushMiles(
  highlights: AlignHighlight[],
  notes: string[],
  highlight: "loaded_miles" | "deadhead",
  label: string,
  sheet: number | null,
  vektor: number | null,
  blankEqualsZero: boolean,
): void {
  if (blankEqualsZero && (sheet ?? 0) === 0 && (vektor ?? 0) === 0) return;
  if (sheet == null && vektor == null) return;
  if (sheet === vektor) return;
  highlights.push(highlight);
  notes.push(`${label} differ. The sheet says ${milesLabel(sheet)} and Vektor says ${milesLabel(vektor)}.`);
}
