"use client";

import { AreaChart, BarChart, ChartCard, DonutChart } from "@/components/charts/charts";
import { ManagementCards } from "@/components/dashboard/management-summary";
import { LegacyEarningsPanel } from "@/components/ins-outs/legacy-earnings";
import { OperatingExpensesClient } from "@/components/operating-expenses/operating-expenses-client";
import { ReportWeekLabel } from "@/components/reports/report-week";
import { shiftWeek } from "@/lib/fee-engine";
import { expensesByCategory, expensesByMonth } from "@/lib/legacy/expenses";
import type { LegacyEarnings } from "@/lib/legacy/fees";
import type { ManagementCardSummary } from "@/lib/legacy/summary";
import type { OperatingExpenseList } from "@/lib/operating-expenses/queries";
import type { OverviewPageData } from "@/lib/overview/queries";

export function ManagementClient({
  data,
  earnings,
  feeReady,
  feeError,
  orgFeeBp,
  cards,
  expenses,
}: {
  data: OverviewPageData;
  earnings: LegacyEarnings;
  feeReady: boolean;
  feeError: string | null;
  orgFeeBp: number;
  cards: ManagementCardSummary;
  expenses: OperatingExpenseList;
}) {
  const month = data.weekStart.slice(0, 7);
  const feeBars = earnings.trucks.map((truck) => ({
    label: truck.unitNumber,
    values: { fee: truck.feeCents },
  }));
  const monthTrend = expensesByMonth(data.operatingExpenses).map((point) => ({
    label: point.month,
    values: { expenses: point.cents },
  }));
  const slices = expensesByCategory(data.operatingExpenses, month);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[1.75rem]">Management</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Legacy earnings, monthly company expenses, and the management profit and loss. Truck sheet outs stay
          on the main dashboard.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <a
          href={`/management?week=${encodeURIComponent(shiftWeek(data.weekStart, -1))}`}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-fg)] no-underline"
        >
          Previous week
        </a>
        <div>
          <ReportWeekLabel weekStart={data.weekStart} />
          <p className="text-sm text-[var(--color-fg-muted)]">
            Week {data.weekStart} through {data.weekEnd}. Expense month {month}.
          </p>
        </div>
        <a
          href={`/management?week=${encodeURIComponent(shiftWeek(data.weekStart, 1))}`}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-fg)] no-underline"
        >
          Next week
        </a>
      </div>

      <ManagementCards summary={cards} />

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Legacy earnings by truck">
          <BarChart
            rows={feeBars}
            series={[{ key: "fee", label: "Fee", color: "var(--color-chart-3)" }]}
            empty="No readable loads for this week."
          />
        </ChartCard>
        <ChartCard title="Monthly Legacy expenses">
          <AreaChart
            rows={monthTrend}
            series={[{ key: "expenses", label: "Expenses", color: "var(--color-chart-1)" }]}
            empty="No portal expenses yet."
          />
        </ChartCard>
        <ChartCard title={`${month} expense mix`}>
          <DonutChart slices={slices} empty={`No portal expenses in ${month}.`} />
        </ChartCard>
      </div>

      <OperatingExpensesClient list={expenses} month={month} embedded />

      <LegacyEarningsPanel
        weekStart={data.weekStart}
        earnings={earnings}
        ready={feeReady}
        error={feeError}
        orgFeeBp={orgFeeBp}
      />
    </div>
  );
}
