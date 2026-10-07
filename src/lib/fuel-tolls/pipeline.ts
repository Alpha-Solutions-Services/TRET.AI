import {
  decideFuelRow,
  decideTollRow,
  fuelDuplicateLosers,
  impossibleMpgIssues,
  tollDuplicateLosers,
  validateFuelRowCountDrop,
  validateTollRowCountDrop,
} from "./validate";
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

export type FuelPipelineResult = {
  blocked: boolean;
  blockIssue: FuelTollIssue | null;
  decisions: FuelDecision[];
  weekIssues: FuelTollIssue[];
};

export type TollPipelineResult = {
  blocked: boolean;
  blockIssue: FuelTollIssue | null;
  decisions: TollDecision[];
};

export function runFuelPipeline(
  rows: FuelDraft[],
  opts: {
    knownUnits: Set<string>;
    loadSpans: LoadSpan[];
    weekMiles: WeekMiles[];
    rangeFrom: string;
    rangeTo: string;
    previousFetched: number | null;
    settings: FuelTollSettings;
    existingDuplicates: DuplicateKey[];
  },
): FuelPipelineResult {
  const blockIssue = validateFuelRowCountDrop(
    rows.length,
    opts.previousFetched,
    opts.settings,
  );
  if (blockIssue) {
    return { blocked: true, blockIssue, decisions: [], weekIssues: [] };
  }
  const losers = fuelDuplicateLosers(rows, opts.existingDuplicates);
  const decisions = rows.map((draft) =>
    decideFuelRow(draft, {
      knownUnits: opts.knownUnits,
      loadSpans: opts.loadSpans,
      rangeFrom: opts.rangeFrom,
      rangeTo: opts.rangeTo,
      settings: opts.settings,
      duplicate: losers.has(draft.vektorTransactionId),
    }),
  );
  const weekIssues = impossibleMpgIssues(decisions, opts.weekMiles, opts.settings);
  return { blocked: false, blockIssue: null, decisions, weekIssues };
}

export function runTollPipeline(
  rows: TollDraft[],
  opts: {
    knownUnits: Set<string>;
    loadSpans: LoadSpan[];
    rangeFrom: string;
    rangeTo: string;
    previousFetched: number | null;
    settings: FuelTollSettings;
    existingDuplicates: DuplicateKey[];
  },
): TollPipelineResult {
  const blockIssue = validateTollRowCountDrop(
    rows.length,
    opts.previousFetched,
    opts.settings,
  );
  if (blockIssue) {
    return { blocked: true, blockIssue, decisions: [] };
  }
  const losers = tollDuplicateLosers(rows, opts.existingDuplicates);
  const decisions = rows.map((draft) =>
    decideTollRow(draft, {
      knownUnits: opts.knownUnits,
      loadSpans: opts.loadSpans,
      rangeFrom: opts.rangeFrom,
      rangeTo: opts.rangeTo,
      duplicate: losers.has(draft.vektorTransactionId),
    }),
  );
  return { blocked: false, blockIssue: null, decisions };
}

/** Re-import keeps one ledger row per Vektor transaction id. Later row wins. */
export function collapseByTransactionId<T extends { vektorTransactionId: string }>(
  rows: T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!row.vektorTransactionId) continue;
    map.set(row.vektorTransactionId, row);
  }
  return [...map.values()];
}
