import { weekBoundsForDate } from "@/lib/fee-engine";
import { formatFooterLabel } from "@/lib/app-version";
import { buildManagementPnl, type ManagementPnl } from "@/lib/overview/pnl";
import { buildWeekSnapshot, type WeekSnapshot } from "@/lib/overview/snapshot";
import { listOperatingExpenses } from "@/lib/operating-expenses/queries";
import { buildInbox, countOpenIssues } from "@/lib/issues/inbox";
import { listImportIssues } from "@/lib/issues/queries";
import { sheetsAccountHealth } from "@/lib/sheets/private-key";
import { loadInsOutsWeek } from "@/lib/sheets/load-week";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { loadStatements, resolveWeekStart } from "@/lib/statements/queries";
import { readAppVersion } from "@/lib/version";

export type OverviewPageData = {
  weekStart: string;
  weekEnd: string;
  error: string | null;
  issuesError: string | null;
  locked: boolean;
  closedAt: string | null;
  snapshot: WeekSnapshot | null;
  pnl: ManagementPnl | null;
  openIssueCount: number | null;
  operatingExpensesReady: boolean;
  insOuts: TruckWeekInsOuts[];
  insOutsError: string | null;
  sheetEnvMissing: string[];
  mismatchCount: number | null;
  mismatchError: string | null;
  versionLabel: string;
  sheetHealth: string;
  operatingExpenses: Array<{ expenseDate: string; category: string; amountCents: number }>;
};

export async function loadOverview(weekRaw: string | undefined): Promise<OverviewPageData> {
  const weekStart = resolveWeekStart(weekRaw);
  const bounds = weekBoundsForDate(weekStart);
  const ins = await loadInsOutsWeek(bounds.start, bounds.end);
  const [statements, expenses, issues] = await Promise.all([
    loadStatements(weekStart),
    listOperatingExpenses(),
    listImportIssues(),
  ]);

  const base = {
    weekStart: statements.weekStart,
    weekEnd: statements.weekEnd,
    locked: statements.locked,
    closedAt: statements.closedAt,
    operatingExpensesReady: expenses.ready,
    insOuts: ins.rows,
    insOutsError: ins.error,
    sheetEnvMissing: ins.sheetEnvMissing,
    mismatchCount: ins.mismatchCount,
    mismatchError: ins.mismatchError,
    versionLabel: formatFooterLabel(readAppVersion()),
    sheetHealth: sheetsAccountHealth().summary,
    operatingExpenses: (expenses.rows ?? []).map((row) => ({
      expenseDate: row.expense_date,
      category: row.category,
      amountCents: row.amount_cents,
    })),
  };

  if (statements.error) {
    return {
      ...base,
      error: statements.error,
      issuesError: issues.error,
      snapshot: null,
      pnl: null,
      openIssueCount: issues.error
        ? null
        : countOpenIssues(
            buildInbox({
              weekStart: statements.weekStart,
              imports: issues.issues,
              blockers: [],
            }),
          ),
    };
  }

  if (expenses.error) {
    let snapshot: WeekSnapshot | null = null;
    try {
      snapshot = buildWeekSnapshot(statements.units);
    } catch (err) {
      return {
        ...base,
        error: err instanceof Error ? err.message : "Could not build this week.",
        issuesError: issues.error,
        snapshot: null,
        pnl: null,
        openIssueCount: null,
      };
    }
    return {
      ...base,
      error: expenses.error,
      issuesError: issues.error,
      snapshot,
      pnl: null,
      openIssueCount: issues.error
        ? null
        : countOpenIssues(
            buildInbox({
              weekStart: statements.weekStart,
              imports: issues.issues,
              blockers: statements.liveBlockers,
            }),
          ),
    };
  }

  let snapshot: WeekSnapshot;
  let pnl: ManagementPnl;
  try {
    snapshot = buildWeekSnapshot(statements.units);
    pnl = buildManagementPnl({
      weekStart: statements.weekStart,
      units: statements.units,
      operatingExpenses: expenses.rows.map((row) => ({
        expenseDate: row.expense_date,
        amountCents: row.amount_cents,
      })),
    });
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : "Could not build this week.",
      issuesError: issues.error,
      snapshot: null,
      pnl: null,
      openIssueCount: null,
    };
  }

  const inbox = buildInbox({
    weekStart: statements.weekStart,
    imports: issues.issues,
    blockers: statements.liveBlockers,
  });

  return {
    ...base,
    error: null,
    issuesError: issues.error,
    snapshot,
    pnl,
    openIssueCount: issues.error ? null : countOpenIssues(inbox),
  };
}
