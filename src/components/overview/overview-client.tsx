"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { centsToDollarString } from "@/lib/money/cents";
import type { OverviewPageData } from "@/lib/overview/queries";
import type { ManagementPnl } from "@/lib/overview/pnl";
import type { SnapshotRow } from "@/lib/overview/snapshot";
import { CopyableError } from "@/components/copyable-error";
import { FleetCharts } from "@/components/dashboard/fleet-charts";
import { SheetsEnvBanner } from "@/components/sheets-env-banner";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="material rounded-xl border border-[var(--color-border)] px-4 py-3">
      <p className="text-xs text-[var(--color-fg-muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Fleet sheets, loads, issues, and status for one Monday to Sunday week. Fees are driver, management or
          Tolson, dispatch, and factoring. Fixed is the amount charged to the owner. Amounts are cents. Legacy
          earnings and monthly company expenses are on Management.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard label="Version" value={data.versionLabel} />
        <StatusCard label="Sheets" value={data.sheetHealth} />
        <StatusCard
          label="Open issues"
          value={data.openIssueCount == null ? "Unavailable" : String(data.openIssueCount)}
        />
        <StatusCard
          label="Loads"
          value={String(data.insOuts.reduce((sum, row) => sum + (row.readable ? row.loadCount : 0), 0))}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => openWeek(shiftWeek(data.weekStart, -1))}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-white/80 px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
            className="h-10 rounded-lg border border-[var(--color-border)] bg-white/80 px-3"
          />
        </label>
        <button
          type="button"
          onClick={() => openWeek(shiftWeek(data.weekStart, 1))}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-white/80 px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Next week
        </button>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Showing {data.weekStart} through {data.weekEnd}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <p className="material rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm">
          Close status: {data.locked ? "Locked" : "Open"}
          {data.locked && data.closedAt ? ` ${data.closedAt.slice(0, 10)}` : ""}
        </p>
        {data.openIssueCount == null ? (
          <div className="material rounded-xl border border-[var(--color-border)] px-3 py-2" role="status">
            <CopyableError
              headline="Open issues could not be loaded."
              detail={data.issuesError ?? "Open issues could not be loaded."}
            />
          </div>
        ) : (
          <Link
            href={`/issues?week=${data.weekStart}`}
            className="pressable material rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-accent)] no-underline hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Open issues: {data.openIssueCount}
          </Link>
        )}
      </div>

      <SheetsEnvBanner missing={data.sheetEnvMissing} />
      <FleetCharts rows={data.insOuts} />

      {data.mismatchCount != null ? (
        <Link
          href={`/issues?week=${data.weekStart}`}
          className="pressable material inline-flex rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-accent)] no-underline"
        >
          Sheet mismatches: {data.mismatchCount}
        </Link>
      ) : data.mismatchError ? (
        <div role="status">
          <CopyableError headline="Sheet comparison could not be loaded." detail={data.mismatchError} />
        </div>
      ) : null}

      {data.error ? (
        <div role="alert">
          <CopyableError headline="This week could not be loaded." detail={data.error} />
        </div>
      ) : null}

      {data.snapshot ? <SnapshotTable snapshot={data.snapshot} /> : null}
      <InsOutsTable rows={data.insOuts} error={data.insOutsError} weekStart={data.weekStart} />
      {data.pnl ? (
        <PnlTable pnl={data.pnl} operatingExpensesReady={data.operatingExpensesReady} />
      ) : null}
    </div>
  );
}

function categoryLine(row: TruckWeekInsOuts): string {
  if (!row.readable) return "Not read";
  const parts = row.categories.map((category) => `${category.category} ${money(category.cents)}`);
  if (row.note) parts.push(row.note);
  if (parts.length === 0) return "No outs this week.";
  return parts.join(", ");
}

function InsOutsTable({
  rows,
  error,
  weekStart,
}: {
  rows: TruckWeekInsOuts[];
  error: string | null;
  weekStart: string;
}) {
  const fleet = rows.filter((row) => row.readable).reduce(
    (sum, row) => ({
      insCents: sum.insCents + row.insCents,
      outsCents: sum.outsCents + row.outsCents,
      loadCount: sum.loadCount + row.loadCount,
    }),
    { insCents: 0, outsCents: 0, loadCount: 0 },
  );

  return (
    <section className="space-y-2">
      <div className="material overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="min-w-full text-left text-sm">
          <caption className="px-3 py-3 text-left font-medium">Ins and Outs</caption>
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-3 font-medium">Unit</th>
              <th className="px-3 py-3 font-medium">Loads</th>
              <th className="px-3 py-3 font-medium">Ins</th>
              <th className="px-3 py-3 font-medium">Outs</th>
              <th className="px-3 py-3 font-medium">Net</th>
              <th className="px-3 py-3 font-medium">Out detail</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td className="px-3 py-3" colSpan={6} role="alert">
                  <CopyableError headline="Ins and Outs could not be loaded." detail={error} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-[var(--color-fg-muted)]" colSpan={6}>
                  No active trucks.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.unitNumber} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2">
                    {row.unitNumber}
                    <span className="block text-xs text-[var(--color-fg-muted)]">{row.truckName}</span>
                  </td>
                  <td className="px-3 py-2">
                    {row.readable ? (
                      row.loadCount
                    ) : (
                      <CopyableError headline={row.note ?? "Sheet was not read."} detail={row.noteDetail} />
                    )}
                  </td>
                  <td className="px-3 py-2">{row.readable ? money(row.insCents) : ""}</td>
                  <td className="px-3 py-2">{row.readable ? money(row.outsCents) : ""}</td>
                  <td className="px-3 py-2">{row.readable ? money(row.netCents) : ""}</td>
                  <td className="max-w-md px-3 py-2 text-[var(--color-fg-muted)]">{categoryLine(row)}</td>
                </tr>
              ))
            )}
            {rows.some((row) => row.readable) ? (
              <tr className="bg-[var(--color-muted)] font-medium">
                <td className="px-3 py-2">Fleet</td>
                <td className="px-3 py-2">{fleet.loadCount}</td>
                <td className="px-3 py-2">{money(fleet.insCents)}</td>
                <td className="px-3 py-2">{money(fleet.outsCents)}</td>
                <td className="px-3 py-2">{money(fleet.insCents - fleet.outsCents)}</td>
                <td className="px-3 py-2 text-[var(--color-fg-muted)]">Readable sheets only</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
        Ins are load rates from each truck Google Sheet. Outs are that sheet&apos;s expense rows for the week.
        Monthly Legacy company expenses are on Legacy expenses and are not added into these outs.{" "}
        <Link
          href={`/ins-outs?week=${weekStart}`}
          className="font-medium text-[var(--color-accent)] no-underline hover:underline"
        >
          Open the Ins and Outs page
        </Link>
        .
      </p>
    </section>
  );
}

function SnapshotTable({ snapshot }: { snapshot: NonNullable<OverviewPageData["snapshot"]> }) {
  return (
    <div className="material overflow-x-auto rounded-xl border border-[var(--color-border)]">
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
      <div className="material overflow-x-auto rounded-xl border border-[var(--color-border)]">
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
