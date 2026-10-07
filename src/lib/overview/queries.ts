import { weekBoundsForDate } from "@/lib/fee-engine";
import { buildManagementPnl, type ManagementPnl } from "@/lib/overview/pnl";
import { buildWeekSnapshot, type WeekSnapshot } from "@/lib/overview/snapshot";
import { listOperatingExpenses } from "@/lib/operating-expenses/queries";
import { buildInbox, countOpenIssues } from "@/lib/issues/inbox";
import { listImportIssues } from "@/lib/issues/queries";
import { loadActiveTruckInsOuts } from "@/lib/sheets/load-week";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { loadStatements, resolveWeekStart } from "@/lib/statements/queries";

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
};

async function loadInsOuts(
  weekStart: string,
  weekEnd: string,
): Promise<{ insOuts: TruckWeekInsOuts[]; insOutsError: string | null }> {
  const loaded = await loadActiveTruckInsOuts(weekStart, weekEnd);
  return { insOuts: loaded.rows, insOutsError: loaded.error };
}

export async function loadOverview(weekRaw: string | undefined): Promise<OverviewPageData> {
  const weekStart = resolveWeekStart(weekRaw);
  const bounds = weekBoundsForDate(weekStart);
  const [statements, expenses, issues, ins] = await Promise.all([
    loadStatements(weekStart),
    listOperatingExpenses(),
    listImportIssues(),
    loadInsOuts(bounds.start, bounds.end),
  ]);

  const base = {
    weekStart: statements.weekStart,
    weekEnd: statements.weekEnd,
    locked: statements.locked,
    closedAt: statements.closedAt,
    operatingExpensesReady: expenses.ready,
    insOuts: ins.insOuts,
    insOutsError: ins.insOutsError,
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
