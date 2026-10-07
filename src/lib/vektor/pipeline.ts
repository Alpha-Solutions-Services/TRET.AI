import { mapManifestToLoad, type LookupMaps } from "./map";
import {
  matchTruckUnit,
  validateDateOutsideRange,
  validateDuplicateLoadIds,
  validateMappedLoad,
  validateRowCountDrop,
  type ImportSettings,
} from "./validate";
import type { IssueDraft, MappedLoad, VektorManifest } from "./types";
import { timestampToDate } from "./dates";

export type PromoteDecision = {
  mapped: MappedLoad;
  issues: IssueDraft[];
  promote: boolean;
  rejectReason: string | null;
};

export function decidePromotion(
  manifest: VektorManifest,
  opts: {
    lookups: LookupMaps;
    knownTruckUnits: Set<string>;
    rangeFrom: string;
    rangeTo: string;
  },
): PromoteDecision {
  const mapped = mapManifestToLoad(manifest, opts.lookups);
  const issues = validateMappedLoad(mapped);

  const outside = validateDateOutsideRange(
    mapped,
    opts.rangeFrom,
    opts.rangeTo,
  );
  if (outside) issues.push(outside);

  if (!mapped.eligible) {
    return {
      mapped,
      issues,
      promote: false,
      rejectReason: mapped.skipReason ?? "not eligible",
    };
  }

  // truckId → trucks lookup referenceId → match trucks.unit_number exactly
  const truck = matchTruckUnit(mapped.truckUnitNumber, opts.knownTruckUnits);
  if (!truck.matched) {
    const msg = !mapped.truckId
      ? "Manifest has no truckId. Row stays in staging."
      : !mapped.truckUnitNumber
        ? `No Vektor truck lookup for truckId ${mapped.truckId}. Row stays in staging.`
        : `No truck with unit_number "${mapped.truckUnitNumber}" (from Vektor referenceId). Row stays in staging.`;
    issues.push({
      severity: "Warn",
      rule: "truck_unmatched",
      message: msg,
      ref: mapped.manifestFriendlyId ?? mapped.manifestId,
      manifestId: mapped.manifestId,
    });
    return {
      mapped,
      issues,
      promote: false,
      rejectReason: "truck unmatched",
    };
  }

  return { mapped, issues, promote: true, rejectReason: null };
}

export function runImportPipeline(
  manifests: VektorManifest[],
  opts: {
    lookups: LookupMaps;
    knownTruckUnits: Set<string>;
    rangeFrom: string;
    rangeTo: string;
    previousFetched: number | null;
    settings: ImportSettings;
  },
): {
  blocked: boolean;
  blockIssue: IssueDraft | null;
  decisions: PromoteDecision[];
  statusCounts: Record<string, number>;
  duplicateIssues: IssueDraft[];
} {
  const statusCounts: Record<string, number> = {};
  for (const m of manifests) {
    statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
  }

  const blockIssue = validateRowCountDrop(
    manifests.length,
    opts.previousFetched,
    opts.settings,
  );
  if (blockIssue) {
    return {
      blocked: true,
      blockIssue,
      decisions: [],
      statusCounts,
      duplicateIssues: [],
    };
  }

  const decisions = manifests.map((m) =>
    decidePromotion(m, {
      lookups: opts.lookups,
      knownTruckUnits: opts.knownTruckUnits,
      rangeFrom: opts.rangeFrom,
      rangeTo: opts.rangeTo,
    }),
  );

  const duplicateIssues = validateDuplicateLoadIds(
    decisions.map((d) => d.mapped),
  );

  return {
    blocked: false,
    blockIssue: null,
    decisions,
    statusCounts,
    duplicateIssues,
  };
}

/** Calendar date for range checks (delivery timestamp → day). */
export function deliveryDay(mapped: MappedLoad): string | null {
  return timestampToDate(mapped.deliveryDate);
}
