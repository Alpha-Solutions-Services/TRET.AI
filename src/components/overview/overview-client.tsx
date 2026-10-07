"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { centsToDollarString } from "@/lib/money/cents";
import type { OverviewPageData } from "@/lib/overview/queries";
import type { ManagementPnl } from "@/lib/overview/pnl";
import type { SnapshotRow } from "@/lib/overview/snapshot";

function money(cents: number): string {
  if (cents < 0) return `-$${centsToDollarString(-cents)}`;
  return `$${centsToDollarString(cents)}`;
}

function shiftWeek(weekStart: string, delta: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return weekBoundsForDate(date.toISOString().slice(0, 10)).start;
}

export function OverviewClient({ data }: { data: OverviewPageData }) {
  const router = useRouter();

  function openWeek(next: string) {
    router.push(`/?week=${next}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Fleet and unit totals for one Monday–Sunday week. Fees are driver, management or Tolson, dispatch, and
          factoring. Fixed is the amount charged to the owner. Amounts are cents.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => openWeek(shiftWeek(data.weekStart, -1))}
          className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Previous week
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Week starting</span>
          <input
            type="date"
            value={data.weekStart}
            onChange={(event) => {
              if (!event.target.value) return;
              try {
                openWeek(weekBoundsForDate(event.target.value).start);
              } catch {
                return;
              }
            }}
            className="h-10 rounded-md border border-[var(--color-border)] px-3"
          />
        </label>
        <button
          type="button"
          onClick={() => openWeek(shiftWeek(data.weekStart, 1))}
          className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Next week
        </button>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Showing {data.weekStart} → {data.weekEnd}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <p className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm">
          Close status: {data.locked ? "Locked" : "Open"}
          {data.locked && data.closedAt ? ` ${data.closedAt.slice(0, 10)}` : ""}
        </p>
        {data.openIssueCount == null ? (
          <p className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-red-700" role="status">
            {data.issuesError ?? "Open issues could not be loaded."}
          </p>
        ) : (
          <Link
            href={`/issues?week=${data.weekStart}`}
            className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-accent)] no-underline hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Open issues: {data.openIssueCount}
          </Link>
        )}
      </div>

      {data.error ? (
        <p className="text-sm text-red-700" role="alert">
          {data.error}
        </p>
      ) : null}

      {data.snapshot ? <SnapshotTable snapshot={data.snapshot} /> : null}
      {data.pnl ? (
        <PnlTable pnl={data.pnl} operatingExpensesReady={data.operatingExpensesReady} />
      ) : null}
    </div>
  );
}

function SnapshotTable({ snapshot }: { snapshot: NonNullable<OverviewPageData["snapshot"]> }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
      <table className="min-w-full text-left text-sm">
        <caption className="px-3 py-3 text-left font-medium">Week snapshot</caption>
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
          <tr>
            <th className="px-3 py-3 font-medium">Unit</th>
            <th className="px-3 py-3 font-medium">Gross</th>
            <th className="px-3 py-3 font-medium">Fees</th>
            <th className="px-3 py-3 font-medium">Fuel</th>
            <th className="px-3 py-3 font-medium">Tolls</th>
            <th className="px-3 py-3 font-medium">Fixed</th>
            <th className="px-3 py-3 font-medium">Net</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.units.map((row) => (
            <SnapshotLine key={row.unitNumber} row={row} fleet={false} />
          ))}
          <SnapshotLine key="fleet" row={snapshot.fleet} fleet />
        </tbody>
      </table>
    </div>
  );
}

function SnapshotLine({ row, fleet }: { row: SnapshotRow; fleet: boolean }) {
  return (
    <tr className={fleet ? "bg-[var(--color-muted)] font-medium" : "border-b border-[var(--color-border)]"}>
      <td className="px-3 py-2">{row.unitNumber}</td>
      <td className="px-3 py-2">{money(row.grossCents)}</td>
      <td className="px-3 py-2">{money(row.feesCents)}</td>
      <td className="px-3 py-2">{money(row.fuelCents)}</td>
      <td className="px-3 py-2">{money(row.tollsCents)}</td>
      <td className="px-3 py-2">{money(row.fixedCents)}</td>
      <td className="px-3 py-2">{money(row.netCents)}</td>
    </tr>
  );
}

function PnlTable({
  pnl,
  operatingExpensesReady,
}: {
  pnl: ManagementPnl;
  operatingExpensesReady: boolean;
}) {
  const lines: Array<{ label: string; cents: number; strong?: boolean }> = [
    { label: "Legacy retained (managed trucks)", cents: pnl.legacyRetainedCents },
    { label: "Dispatch fee", cents: pnl.dispatchFeeCents },
    { label: "Income", cents: pnl.incomeCents, strong: true },
    { label: "Fixed expenses charged to management", cents: pnl.fixedManagementCents },
    { label: "Operating expenses", cents: pnl.operatingExpenseCents },
    { label: "Expenses", cents: pnl.expenseCents, strong: true },
    { label: "Net", cents: pnl.netCents, strong: true },
  ];

  return (
    <section className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <caption className="px-3 py-3 text-left font-medium">Management P&L</caption>
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-3 font-medium">Line</th>
              <th className="px-3 py-3 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.label}
                className={
                  line.strong
                    ? "border-b border-[var(--color-border)] bg-[var(--color-muted)] font-medium"
                    : "border-b border-[var(--color-border)]"
                }
              >
                <td className="px-3 py-2">{line.label}</td>
                <td className="px-3 py-2">{money(line.cents)}</td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 text-[var(--color-fg-muted)]">Tolson payable (not in net)</td>
              <td className="px-3 py-2 text-[var(--color-fg-muted)]">{money(pnl.tolsonPayableCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
        Income uses the statement for this week. Legacy retained is the managed-truck amount already calculated.
        Dispatch is the fee Legacy keeps. A lock keeps those statement figures. Operating expenses are the rows
        dated this week and are not frozen by the lock.
        {operatingExpensesReady
          ? ""
          : " Operating expenses stay at zero until the v0.0.0.6 migration is applied."}
      </p>
    </section>
  );
}
