import { assertMonday, weekBoundsForDate } from "@/lib/fee-engine";
import type { StatementBlocker } from "@/lib/statements/types";

export type IssueSeverity = "Block" | "Warn";
export type IssueSeverityFilter = "all" | IssueSeverity;
export type IssueStatusFilter = "open" | "resolved" | "all";

/** An import issue plus the date range of its import run, when that run is known. */
export type ImportIssueInput = {
  id: string;
  severity: string;
  rule: string;
  message: string;
  ref: string | null;
  status: string;
  createdAt: string;
  rangeFrom: string | null;
  rangeTo: string | null;
};

export type InboxRow = {
  id: string;
  source: "import" | "close";
  severity: IssueSeverity;
  rule: string;
  message: string;
  ref: string | null;
  status: "open" | "resolved";
  createdAt: string | null;
  resolvable: boolean;
};

export function parseSeverityFilter(raw: string | undefined): IssueSeverityFilter {
  if (raw === "Block" || raw === "Warn") return raw;
  return "all";
}

export function parseStatusFilter(raw: string | undefined): IssueStatusFilter {
  if (raw === "resolved" || raw === "all") return raw;
  return "open";
}

/**
 * An import issue is in the week when its run overlaps Monday–Sunday.
 * A row with no run range stays visible so it cannot disappear from every week.
 */
export function importIssueInWeek(
  issue: ImportIssueInput,
  weekStart: string,
  weekEnd: string,
): boolean {
  if (!issue.rangeFrom || !issue.rangeTo) return true;
  return issue.rangeFrom <= weekEnd && weekStart <= issue.rangeTo;
}

export function buildInbox(input: {
  weekStart: string;
  imports: ImportIssueInput[];
  blockers: StatementBlocker[];
}): InboxRow[] {
  assertMonday(input.weekStart, "Week start");
  const bounds = weekBoundsForDate(input.weekStart);
  const rows: InboxRow[] = [];

  for (const issue of input.imports) {
    if (!importIssueInWeek(issue, bounds.start, bounds.end)) continue;
    const row = importRow(issue);
    if (row) rows.push(row);
  }

  input.blockers.forEach((blocker, index) => {
    rows.push({
      id: `close:${bounds.start}:${index}:${blocker.rule}:${blocker.ref ?? ""}`,
      source: "close",
      severity: "Block",
      rule: blocker.rule,
      message: blocker.message,
      ref: blocker.ref,
      status: "open",
      createdAt: null,
      resolvable: false,
    });
  });

  rows.sort(compareInbox);
  return rows;
}

export function filterInbox(
  rows: InboxRow[],
  filter: { severity: IssueSeverityFilter; status: IssueStatusFilter },
): InboxRow[] {
  return rows.filter((row) => {
    if (filter.severity !== "all" && row.severity !== filter.severity) return false;
    if (filter.status !== "all" && row.status !== filter.status) return false;
    return true;
  });
}

export function countOpenIssues(rows: InboxRow[]): number {
  return filterInbox(rows, { severity: "all", status: "open" }).length;
}

/** True only for a stored open Warn or Block import issue. Close checks are not stored. */
export function canResolveIssue(row: InboxRow): boolean {
  return row.source === "import" && row.resolvable && row.status === "open";
}

function importRow(issue: ImportIssueInput): InboxRow | null {
  if (issue.severity !== "Block" && issue.severity !== "Warn") return null;
  if (issue.status !== "open" && issue.status !== "resolved") return null;
  return {
    id: issue.id,
    source: "import",
    severity: issue.severity,
    rule: issue.rule,
    message: issue.message,
    ref: issue.ref,
    status: issue.status,
    createdAt: issue.createdAt,
    resolvable: issue.status === "open",
  };
}

function compareInbox(a: InboxRow, b: InboxRow): number {
  if (a.source !== b.source) return a.source === "close" ? -1 : 1;
  if (a.severity !== b.severity) return a.severity === "Block" ? -1 : 1;
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}
