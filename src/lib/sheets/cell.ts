import { dollarStringToCents } from "@/lib/money/cents";

/** Collapse odd spaces from sheet cells. */
export function cleanCell(raw: string): string {
  return raw.replace(/\u00a0/g, " ").replace(/[\r\n]+/g, " ").trim();
}

export function cleanLoadId(raw: string): string {
  return cleanCell(raw).replace(/\s+/g, "");
}

export function sheetAmountToCents(raw: string): number | null {
  const trimmed = cleanCell(raw);
  if (!trimmed) return null;
  const negative = trimmed.startsWith("-") || /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[$,\s]/g, "").replace(/[()]/g, "").replace(/^-/, "");
  if (!cleaned) return null;
  try {
    const cents = dollarStringToCents(cleaned);
    return negative ? -cents : cents;
  } catch {
    return null;
  }
}

/**
 * Sheet dates: `2026-09-01 0:00:00`, `M/D/YYYY` with an optional time,
 * or a Google Sheets serial day (days since 1899-12-30).
 */
export function sheetDay(raw: string): string | null {
  const text = cleanCell(raw);
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  }
  if (/^\d+(\.\d+)?$/.test(text)) return sheetsSerialToIso(Number(text));
  return null;
}

/** Google Sheets serial: day 0 is 1899-12-30. The time fraction is ignored. */
export function sheetsSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const days = Math.floor(serial);
  if (days < 20_000 || days > 80_000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + days * 86_400_000).toISOString().slice(0, 10);
}

export function inWeek(day: string | null, weekStart: string, weekEnd: string): boolean {
  if (!day) return false;
  return day >= weekStart && day <= weekEnd;
}

export function normalizeHeader(raw: string): string {
  return cleanCell(raw).toLowerCase().replace(/\s+/g, " ");
}

export function columnIndexes(header: string[], names: readonly string[]): number[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const found: number[] = [];
  header.forEach((cell, index) => {
    if (wanted.has(normalizeHeader(cell))) found.push(index);
  });
  return found;
}

export function columnIndex(header: string[], names: readonly string[]): number {
  return columnIndexes(header, names)[0] ?? -1;
}

export function findHeaderRow(grid: string[][], groups: ReadonlyArray<readonly string[]>): number {
  for (let index = 0; index < grid.length; index++) {
    const cells = (grid[index] ?? []).map((cell) => normalizeHeader(cell));
    const ok = groups.every((group) => group.some((name) => cells.includes(name.toLowerCase())));
    if (ok) return index;
  }
  return -1;
}
