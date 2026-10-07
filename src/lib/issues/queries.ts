import { weekBoundsForDate } from "@/lib/fee-engine";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";
import { loadStatements, resolveWeekStart } from "@/lib/statements/queries";
import { buildInbox, type ImportIssueInput, type InboxRow } from "./inbox";

export type ImportIssueList = {
  ready: boolean;
  error: string | null;
  issues: ImportIssueInput[];
};

export type IssuesPageData = {
  weekStart: string;
  weekEnd: string;
  rows: InboxRow[];
  error: string | null;
  issuesReady: boolean;
  statementsReady: boolean;
};

export async function listImportIssues(): Promise<ImportIssueList> {
  const supabase = await createClient();
  const [issuesRes, runsRes] = await Promise.all([
    supabase
      .from("issues")
      .select("id, severity, rule, message, ref, status, import_run_id, created_at")
      .in("severity", ["Warn", "Block"])
      .order("created_at", { ascending: false }),
    supabase.from("import_runs").select("id, range_from, range_to"),
  ]);

  if (issuesRes.error) {
    if (isMissingSchemaError(issuesRes.error)) {
      return { ready: false, error: null, issues: [] };
    }
    return { ready: false, error: issuesRes.error.message, issues: [] };
  }

  const runs = new Map<string, { range_from: string; range_to: string }>();
  if (!runsRes.error) {
    for (const run of runsRes.data ?? []) {
      runs.set(run.id, { range_from: run.range_from, range_to: run.range_to });
    }
  }

  const issues: ImportIssueInput[] = (issuesRes.data ?? []).map((row) => {
    const run = row.import_run_id ? runs.get(row.import_run_id) : undefined;
    return {
      id: row.id,
      severity: row.severity,
      rule: row.rule,
      message: row.message,
      ref: row.ref,
      status: row.status,
      createdAt: row.created_at,
      rangeFrom: run?.range_from ?? null,
      rangeTo: run?.range_to ?? null,
    };
  });

  return { ready: true, error: null, issues };
}

export async function loadIssuesPage(weekRaw: string | undefined): Promise<IssuesPageData> {
  const weekStart = resolveWeekStart(weekRaw);
  const bounds = weekBoundsForDate(weekStart);
  const [statements, issues] = await Promise.all([
    loadStatements(weekStart),
    listImportIssues(),
  ]);

  const rows = buildInbox({
    weekStart: bounds.start,
    imports: issues.issues,
    blockers: statements.error ? [] : statements.liveBlockers,
  });

  return {
    weekStart: bounds.start,
    weekEnd: bounds.end,
    rows,
    error: issues.error ?? statements.error,
    issuesReady: issues.ready,
    statementsReady: statements.ready && !statements.error,
  };
}
