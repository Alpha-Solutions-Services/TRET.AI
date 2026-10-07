"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AreaChart, BarChart, ChartCard, DonutChart } from "@/components/charts/charts";
import { LegacyEarningsPanel } from "@/components/ins-outs/legacy-earnings";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { expensesByCategory, expensesByMonth } from "@/lib/legacy/expenses";
import type { LegacyEarnings } from "@/lib/legacy/fees";
import { centsToDollarString } from "@/lib/money/cents";
import type { ManagementPnl } from "@/lib/overview/pnl";
import type { OverviewPageData } from "@/lib/overview/queries";

function money(cents: number): string {
  if (cents < 0) return `-$${centsToDollarString(-cents)}`;
  return `$${centsToDollarString(cents)}`;
}

function shiftWeek(weekStart: string, delta: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return weekBoundsForDate(date.toISOString().slice(0, 10)).start;
}

export function ManagementClient({
  data,
  earnings,
  feeReady,
  feeError,
  orgFeeBp,
}: {
  data: OverviewPageData;
  earnings: LegacyEarnings;
  feeReady: boolean;
  feeError: string | null;
  orgFeeBp: number;
}) {
  const router = useRouter();
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

  function openWeek(next: string) {
    router.push(`/management?week=${next}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Management</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Legacy earnings, monthly company expenses, and the management profit and loss. Truck sheet outs stay
          on the main dashboard.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => openWeek(shiftWeek(data.weekStart, -1))}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium"
        >
          Previous week
        </button>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Week {data.weekStart} through {data.weekEnd}. Expense month {month}.
        </p>
        <button
          type="button"
          onClick={() => openWeek(shiftWeek(data.weekStart, 1))}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium"
        >
          Next week
        </button>
      </div>

      {data.pnl ? <PnlStrip pnl={data.pnl} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
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

      <p className="text-sm">
        <Link href={`/operating-expenses?month=${month}`} className="font-medium text-[var(--color-accent)]">
          Add or edit Legacy expenses
        </Link>
      </p>

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

function PnlStrip({ pnl }: { pnl: ManagementPnl }) {
  const cards = [
    { label: "Income", cents: pnl.incomeCents },
    { label: "Expenses", cents: pnl.expenseCents },
    { label: "Net", cents: pnl.netCents },
    { label: "Tolson payable", cents: pnl.tolsonPayableCents },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="material rounded-xl border border-[var(--color-border)] px-4 py-3">
          <p className="text-xs text-[var(--color-fg-muted)]">{card.label}</p>
          <p className="mt-1 text-lg font-semibold">{money(card.cents)}</p>
        </div>
      ))}
    </div>
  );
}
