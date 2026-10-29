"use client";

import { CopyableError } from "@/components/copyable-error";
import { LegacyEarningsPanel } from "@/components/ins-outs/legacy-earnings";
import { SheetsEnvBanner } from "@/components/sheets-env-banner";
import { ReportWeekLabel } from "@/components/reports/report-week";
import { shiftWeek } from "@/lib/fee-engine";
import type { LegacyEarnings } from "@/lib/legacy/fees";
import { formatStatementDollars } from "@/lib/reports/format";
import {
  displayExpenseColumns,
  fleetInsOutsTotals,
  type TruckWeekInsOuts,
} from "@/lib/sheets/ins-outs";

function money(cents: number): string {
  return formatStatementDollars(cents);
}

function categoryCents(row: TruckWeekInsOuts, category: string): number {
  return row.categories.find((item) => item.category === category)?.cents ?? 0;
}

export function InsOutsClient({
  weekStart,
  weekEnd,
  rows,
  error,
  sheetEnvMissing,
  mismatchCount,
  mismatchError,
  legacy,
}: {
  weekStart: string;
  weekEnd: string;
  rows: TruckWeekInsOuts[];
  error: string | null;
  sheetEnvMissing: string[];
  mismatchCount: number | null;
  mismatchError: string | null;
  legacy?: {
    earnings: LegacyEarnings;
    ready: boolean;
    error: string | null;
    orgFeeBp: number;
  } | null;
}) {
  const fleet = fleetInsOutsTotals(rows);
  const feeTotals = rows.filter((row) => row.readable).reduce(
    (sum, row) => ({
      legacy: sum.legacy + (row.legacyFeeCents ?? 0),
      tolson: sum.tolson + (row.tolsonLeaseFeeCents ?? 0),
      management: sum.management + (row.managementFeeCents ?? 0),
    }),
    { legacy: 0, tolson: 0, management: 0 },
  );
  const columns = displayExpenseColumns(rows);
  const columnCount = 9 + columns.length;

  function weekHref(next: string): string {
    return `/ins-outs?week=${encodeURIComponent(next)}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Legacy Inc income and outgoing</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Ins are load rates from each truck Google Sheet (the Rate column, by delivery date). Outs are the
          Weekly Expenses row for that week: driver pay, management fee, dispatch, factoring, fuel, insurance,
          and the other weekly lines. If that tab is missing, Outs use the Mgmt Expenses rows instead.
          Monthly Legacy company expenses are entered on Management. Those portal rows are not added into
          truck outs. Legacy earnings below are the management fee on each load.
        </p>
      </div>

      <SheetsEnvBanner missing={sheetEnvMissing} />

      {mismatchCount != null ? (
        <a
          href={`/sheet-compare?week=${weekStart}`}
          className="pressable material inline-flex rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-accent)] no-underline"
        >
          Sheet vs Vektor: {mismatchCount} open rate or missing-load checks
        </a>
      ) : mismatchError ? (
        <div role="status">
          <CopyableError headline="Sheet comparison could not be loaded." detail={mismatchError} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <a
          href={weekHref(shiftWeek(weekStart, -1))}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium text-[var(--color-fg)] no-underline hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Previous week
        </a>
        <form action="/ins-outs" method="get" className="text-sm">
          <label>
            <span className="mb-1 block text-[var(--color-fg-muted)]">Week starting</span>
            <input
              type="date"
              name="week"
              defaultValue={weekStart}
              onChange={(event) => {
                if (!event.target.value) return;
                event.currentTarget.form?.requestSubmit();
              }}
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3"
            />
          </label>
        </form>
        <a
          href={weekHref(shiftWeek(weekStart, 1))}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium text-[var(--color-fg)] no-underline hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Next week
        </a>
        <div className="text-sm text-[var(--color-fg-muted)]">
          <ReportWeekLabel weekStart={weekStart} />
          <p>Showing {weekStart} through {weekEnd}</p>
        </div>
      </div>

      {rows.some((row) => (row.pending?.length ?? 0) > 0) ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-3">
          <h2 className="text-sm font-medium">Pending</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-fg-muted)]">
            {rows.flatMap((row) =>
              (row.pending ?? []).map((item) => (
                <li key={`${row.unitNumber}:${item.loadId}`}>
                  Truck {row.unitNumber} {item.loadId}: {item.reason}
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}

      <div className="material overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="min-w-full text-left text-sm">
          <caption className="px-3 py-3 text-left font-medium">Ins and Outs</caption>
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-3 font-medium">Unit</th>
              <th className="px-3 py-3 font-medium">Loads</th>
              <th className="px-3 py-3 font-medium">Ins</th>
              <th className="px-3 py-3 font-medium">Legacy fee</th>
              <th className="px-3 py-3 font-medium">Tolson lease fee</th>
              <th className="px-3 py-3 font-medium">Management fee total</th>
              {columns.map((category) => (
                <th key={category} className="px-3 py-3 font-medium whitespace-nowrap">
                  {category}
                </th>
              ))}
              <th className="px-3 py-3 font-medium">Outs</th>
              <th className="px-3 py-3 font-medium">Net</th>
              <th className="px-3 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td className="px-3 py-3" colSpan={columnCount} role="alert">
                  <CopyableError headline="Ins and Outs could not be loaded." detail={error} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-[var(--color-fg-muted)]" colSpan={columnCount}>
                  No active trucks.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.unitNumber} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2 whitespace-nowrap">
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
                  <td className="px-3 py-2">{row.readable ? money(row.legacyFeeCents ?? 0) : ""}</td>
                  <td className="px-3 py-2">{row.readable ? money(row.tolsonLeaseFeeCents ?? 0) : ""}</td>
                  <td className="px-3 py-2">{row.readable ? money(row.managementFeeCents ?? 0) : ""}</td>
                  {columns.map((category) => (
                    <td key={category} className="px-3 py-2 whitespace-nowrap">
                      {row.readable ? money(categoryCents(row, category)) : ""}
                    </td>
                  ))}
                  <td className="px-3 py-2">{row.readable ? money(row.outsCents) : ""}</td>
                  <td className="px-3 py-2">{row.readable ? money(row.netCents) : ""}</td>
                  <td className="max-w-xs px-3 py-2 text-[var(--color-fg-muted)]">
                    {row.note ?? ""}
                    <a
                      href={`/api/reports/asset?week=${weekStart}&unit=${encodeURIComponent(row.unitNumber)}`}
                      className="mt-1 block font-medium text-[var(--color-accent)] no-underline hover:underline"
                    >
                      Download report
                    </a>
                  </td>
                </tr>
              ))
            )}
            {!error && fleet.readableCount > 0 ? (
              <tr className="bg-[var(--color-muted)] font-medium">
                <td className="px-3 py-2">Fleet</td>
                <td className="px-3 py-2">{fleet.loadCount}</td>
                <td className="px-3 py-2">{money(fleet.insCents)}</td>
                <td className="px-3 py-2">{money(feeTotals.legacy)}</td>
                <td className="px-3 py-2">{money(feeTotals.tolson)}</td>
                <td className="px-3 py-2">{money(feeTotals.management)}</td>
                {columns.map((category) => (
                  <td key={category} className="px-3 py-2 whitespace-nowrap">
                    {money(fleet.categories.find((item) => item.category === category)?.cents ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2">{money(fleet.outsCents)}</td>
                <td className="px-3 py-2">{money(fleet.netCents)}</td>
                <td className="px-3 py-2 text-[var(--color-fg-muted)]">Readable sheets only</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {legacy ? (
        <LegacyEarningsPanel
          weekStart={weekStart}
          earnings={legacy.earnings}
          ready={legacy.ready}
          error={legacy.error}
          orgFeeBp={legacy.orgFeeBp}
        />
      ) : null}
    </div>
  );
}
