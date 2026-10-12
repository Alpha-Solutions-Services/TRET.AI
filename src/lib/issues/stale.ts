/** An open import issue, with the run it came from when that run is known. */
export type StaleIssue = {
  id: string;
  rule: string;
  ref: string | null;
  status: string;
  createdAt: string;
  importRunId: string | null;
  kind: string | null;
  runFinishedAt: string | null;
};

/**
 * Open issues to mark resolved.
 * An issue on an older run of the same kind is stale.
 * An older copy of the same rule and ref is stale. The newest one stays open.
 */
export function staleIssueIds(issues: readonly StaleIssue[]): string[] {
  const open = issues.filter((issue) => issue.status === "open");
  const latestRunByKind = new Map<string, { id: string; finished: string }>();
  for (const issue of issues) {
    if (!issue.importRunId || !issue.kind) continue;
    const finished = issue.runFinishedAt ?? issue.createdAt;
    const current = latestRunByKind.get(issue.kind);
    if (!current || finished > current.finished || (finished === current.finished && issue.importRunId > current.id)) {
      latestRunByKind.set(issue.kind, { id: issue.importRunId, finished });
    }
  }

  const stale = new Set<string>();
  for (const issue of open) {
    if (!issue.kind || !issue.importRunId) continue;
    const latest = latestRunByKind.get(issue.kind);
    if (latest && issue.importRunId !== latest.id) stale.add(issue.id);
  }

  const groups = new Map<string, StaleIssue[]>();
  for (const issue of open) {
    if (stale.has(issue.id)) continue;
    const key = `${issue.rule}\0${issue.ref ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(issue);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    for (const older of list.slice(1)) stale.add(older.id);
  }
  return [...stale];
}
