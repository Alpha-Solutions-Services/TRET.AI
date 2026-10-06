import type { IssueDraft, VektorManifest } from "./types";

export type Eligibility = {
  importable: boolean;
  reason: string | null;
  statusBucket:
    | "delivered"
    | "deleted"
    | "merged_into"
    | "other";
};

/**
 * Import only STATUS_DELIVERED.
 * Never STATUS_DELETED.
 * Never lineage.relation MERGED_INTO.
 * Other statuses: not imported (OPEN for later); counted separately.
 */
export function classifyManifestEligibility(
  manifest: VektorManifest,
): Eligibility {
  const relation = manifest.lineage?.relation ?? null;
  if (relation === "MANIFEST_LINEAGE_RELATION_MERGED_INTO") {
    return {
      importable: false,
      reason: "Excluded: lineage relation MERGED_INTO (deleted duplicate)",
      statusBucket: "merged_into",
    };
  }

  if (manifest.status === "STATUS_DELETED") {
    return {
      importable: false,
      reason: "Excluded: STATUS_DELETED",
      statusBucket: "deleted",
    };
  }

  if (manifest.status === "STATUS_DELIVERED") {
    return { importable: true, reason: null, statusBucket: "delivered" };
  }

  return {
    importable: false,
    reason: `Not imported: status ${manifest.status} (OPEN for later)`,
    statusBucket: "other",
  };
}

export function eligibilityIssue(
  manifest: VektorManifest,
  eligibility: Eligibility,
): IssueDraft | null {
  if (eligibility.importable || !eligibility.reason) return null;
  if (eligibility.statusBucket === "other") {
    return {
      severity: "Info",
      rule: "status_not_imported",
      message: eligibility.reason,
      ref: manifest.friendlyId ?? manifest.manifestId,
      manifestId: manifest.manifestId,
    };
  }
  return {
    severity: "Info",
    rule: "excluded_manifest",
    message: eligibility.reason,
    ref: manifest.friendlyId ?? manifest.manifestId,
    manifestId: manifest.manifestId,
  };
}
