import type { MappedLoad } from "../types";
import type { IssueDraft } from "../types";

/**
 * Natural key across sources = manifest friendlyId (e.g. "1152").
 * Whether friendlyId is unique per company is OPEN until verified from real data.
 */
export function naturalKey(mapped: MappedLoad): string | null {
  return mapped.manifestFriendlyId;
}

export type ExistingLoadSnapshot = {
  naturalKey: string;
  manifestId: string | null;
  loadId: string | null;
  deliveryDate: string | null;
  rateCents: number;
  loadedDistanceMi: number | null;
  deadheadMiles: number | null;
  originCity: string | null;
  destinationCity: string | null;
  source: string | null;
};

function fingerprint(parts: {
  loadId: string | null;
  deliveryDate: string | null;
  rateCents: number;
  loadedDistanceMi: number | null;
  deadheadMiles: number | null;
  originCity: string | null;
  destinationCity: string | null;
}): string {
  return JSON.stringify(parts);
}

/**
 * Re-importing the same load from a different source must not create a duplicate.
 * Identical data → skip (do nothing). Differing → Warn, do not overwrite.
 */
export function resolveCrossSourceConflict(
  incoming: MappedLoad,
  existing: ExistingLoadSnapshot | null,
  incomingSource: string,
): {
  action: "insert" | "skip_identical" | "warn_differ";
  issue: IssueDraft | null;
} {
  const key = naturalKey(incoming);
  if (!key) {
    return {
      action: "insert",
      issue: {
        severity: "Warn",
        rule: "missing_natural_key",
        message: "Manifest has no friendlyId; cannot guarantee cross-source dedupe (OPEN).",
        ref: incoming.manifestId,
        manifestId: incoming.manifestId,
      },
    };
  }

  if (!existing) {
    return { action: "insert", issue: null };
  }

  const a = fingerprint({
    loadId: incoming.loadId,
    deliveryDate: incoming.deliveryDate,
    rateCents: incoming.rateCents,
    loadedDistanceMi: incoming.loadedDistanceMi,
    deadheadMiles: incoming.deadheadMiles,
    originCity: incoming.originCity,
    destinationCity: incoming.destinationCity,
  });
  const b = fingerprint({
    loadId: existing.loadId,
    deliveryDate: existing.deliveryDate,
    rateCents: existing.rateCents,
    loadedDistanceMi: existing.loadedDistanceMi,
    deadheadMiles: existing.deadheadMiles,
    originCity: existing.originCity,
    destinationCity: existing.destinationCity,
  });

  if (a === b) {
    return { action: "skip_identical", issue: null };
  }

  return {
    action: "warn_differ",
    issue: {
      severity: "Warn",
      rule: "cross_source_conflict",
      message: `Load ${key} already exists (source ${existing.source ?? "unknown"}). Incoming source ${incomingSource} differs; not overwritten.`,
      ref: key,
      manifestId: incoming.manifestId,
    },
  };
}
