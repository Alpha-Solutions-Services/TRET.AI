import { compareSheetLoads, unitKey, type SheetMismatch } from "@/lib/sheets/mismatch";

export type LoadFacts = {
  unitNumber: string;
  loadId: string;
  deliveryDay: string | null;
  rateCents: number | null;
  loadedMilesHundredths: number | null;
  deadheadMilesHundredths: number | null;
};

export type AlignHighlight = "missing_sheet" | "missing_vektor" | "rate" | "date" | "loaded_miles" | "deadhead";

export type AlignedLoad = {
  unitNumber: string;
  loadId: string;
  sheet: LoadFacts | null;
  vektor: LoadFacts | null;
  highlights: AlignHighlight[];
  notes: string[];
};

function pairKey(unitNumber: string, loadId: string): string {
  return `${unitKey(unitNumber)}|${loadId.trim().toLowerCase()}`;
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

  return keys.map((key) => {
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
      if (
        sheet.deliveryDay &&
        vektor.deliveryDay &&
        sheet.deliveryDay !== vektor.deliveryDay
      ) {
        highlights.push("date");
        notes.push(
          `Delivery date differs. The sheet says ${sheet.deliveryDay} and Vektor says ${vektor.deliveryDay}.`,
        );
      }
      pushMiles(highlights, notes, "loaded_miles", "Loaded miles", sheet.loadedMilesHundredths, vektor.loadedMilesHundredths);
      pushMiles(
        highlights,
        notes,
        "deadhead",
        "Deadhead miles",
        sheet.deadheadMilesHundredths,
        vektor.deadheadMilesHundredths,
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
    }
    return {
      unitNumber: (sheet ?? vektor)!.unitNumber,
      loadId: (sheet ?? vektor)!.loadId,
      sheet,
      vektor,
      highlights,
      notes,
    };
  });
}

function pushMiles(
  highlights: AlignHighlight[],
  notes: string[],
  highlight: "loaded_miles" | "deadhead",
  label: string,
  sheet: number | null,
  vektor: number | null,
): void {
  if (sheet == null && vektor == null) return;
  if (sheet === vektor) return;
  highlights.push(highlight);
  notes.push(`${label} differ. The sheet says ${milesLabel(sheet)} and Vektor says ${milesLabel(vektor)}.`);
}
