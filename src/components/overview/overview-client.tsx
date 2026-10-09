"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { categoryColor } from "@/lib/charts/palette";
import { KpiCard } from "@/components/motion/kpi-card";
import { weekBoundsForDate } from "@/lib/fee-engine";
import {
  centsPerLoadedMile,
  formatDieselMpg,
  formatGroupedInt,
  formatMilesHundredths,
  formatMilesWhole,
  formatStatementDollars,
} from "@/lib/reports/format";
import { ManagementSummaryTable } from "@/components/dashboard/management-summary";
import type { ManagementCardSummary } from "@/lib/legacy/summary";
import type { HubFeed } from "@/lib/overview/hub-feeds";
import type { OverviewPageData } from "@/lib/overview/queries";
import type { SnapshotRow } from "@/lib/overview/snapshot";
import { CopyableError } from "@/components/copyable-error";
import { SheetsEnvBanner } from "@/components/sheets-env-banner";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { PrepareReportButtons, ReportWeekLabel } from "@/components/reports/report-week";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { TruckCardGrid } from "@/components/dashboard/truck-cards";

const HubFlow = dynamic(() => import("@/components/motion/hub-flow").then((mod) => mod.HubFlow), {
  loading: () => <div className="h-[340px]" aria-hidden="true" />,
});

const FleetCharts = dynamic(() => import("@/components/dashboard/fleet-charts").then((mod) => mod.FleetCharts), {
  loading: () => <div className="h-[420px]" aria-hidden="true" />,
});

function money(cents: number): string {
  return formatStatementDollars(cents);
}

function miles(hundredths: number | undefined): string {
  if (hundredths == null) return "";
  return formatMilesHundredths(hundredths);
}

function rpm(cents: number | null | undefined): string {
  if (cents == null) return "";
  return formatStatementDollars(cents);
}

function mpgTarget(mpg: string | null): number | null {
  if (!mpg || !/^\d+\.\d{2}$/.test(mpg)) return null;
  const [whole, frac] = mpg.split(".");
  return Number(whole) * 100 + Number(frac);
}

function formatMpgCount(value: number): string {
  const whole = Math.floor(Math.abs(value) / 100);
  const frac = Math.abs(value) % 100;
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

function shiftWeek(weekStart: string, delta: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return weekBoundsForDate(date.toISOString().slice(0, 10)).start;
}

export function OverviewClient({
  data,
  cards,
  hub,
}: {
  data: OverviewPageData;
  cards: ManagementCardSummary;
  hub: HubFeed[];
}) {
  const router = useRouter();
  const readable = data.insOuts.filter((row) => row.readable);
  const fleetIns = readable.reduce((sum, row) => sum + row.insCents, 0);
  const fleetOuts = readable.reduce((sum, row) => sum + row.outsCents, 0);
  const fleetLoads = readable.reduce((sum, row) => sum + row.loadCount, 0);
  const fleetMiles = readable.reduce((sum, row) => sum + (row.loadedMilesHundredths ?? 0), 0);
  const fleetDeadhead = readable.reduce((sum, row) => sum + (row.deadheadMilesHundredths ?? 0), 0);
  const fleetGallons = readable.reduce((sum, row) => sum + (row.dieselGallonsMilli ?? 0), 0);
  const fleetRpm = centsPerLoadedMile(fleetIns, fleetMiles);
  const fleetMpg = formatDieselMpg(fleetMiles, fleetGallons);
  const issueStatus = data.openIssueCount == null ? "warn" : data.openIssueCount > 0 ? "danger" : "ok";

  function openWeek(next: string) {
    router.push(`/?week=${next}`);
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[1.75rem]">Dashboard</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Fleet sheets, loads, issues, and status for one Monday to Sunday week. Fees are driver, management or
          Tolson, dispatch, and factoring. Fixed is the amount charged to the owner. Legacy earnings and monthly
          company expenses are on Management.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Ins"
          value={money(fleetIns)}
          detail="Load rates this week"
          color={categoryColor(0)}
          target={fleetIns}
          format={formatStatementDollars}
        />
        <KpiCard
          label="Outs"
          value={money(fleetOuts)}
          detail="Weekly expenses, including misc"
          color={categoryColor(1)}
          target={fleetOuts}
          format={formatStatementDollars}
        />
        <KpiCard
          label="Net"
          value={money(fleetIns - fleetOuts)}
          detail="Ins minus outs"
          color={categoryColor(2)}
          target={fleetIns - fleetOuts}
          format={formatStatementDollars}
        />
        <KpiCard
          label="Loads"
          value={formatGroupedInt(fleetLoads)}
          detail={data.versionLabel}
          color={categoryColor(3)}
          target={fleetLoads}
          format={formatGroupedInt}
        />
        <KpiCard
          label="Loaded miles"
          value={formatMilesWhole(fleetMiles)}
          detail="Primary miles on each trip"
          color={categoryColor(4)}
          target={Math.floor(fleetMiles / 100)}
          format={formatGroupedInt}
        />
        <KpiCard
          label="Deadhead"
          value={formatMilesHundredths(fleetDeadhead)}
          detail="Empty miles on each trip"
          color={categoryColor(5)}
          target={fleetDeadhead}
          format={formatMilesHundredths}
        />
        <KpiCard
          label="RPM"
          value={fleetRpm == null ? "None" : money(fleetRpm)}
          detail="Ins per loaded mile"
          color={categoryColor(6)}
          target={fleetRpm}
          format={fleetRpm == null ? undefined : formatStatementDollars}
        />
        <KpiCard
          label="MPG"
          value={fleetMpg ?? "None"}
          detail="Diesel miles per gallon"
          color={categoryColor(7)}
          target={mpgTarget(fleetMpg)}
          format={fleetMpg == null ? undefined : formatMpgCount}
        />
        <KpiCard
          label="Open issues"
          value={data.openIssueCount == null ? "Unavailable" : formatGroupedInt(data.openIssueCount)}
          detail={data.sheetHealth}
          color={categoryColor(8)}
          target={data.openIssueCount}
          format={data.openIssueCount == null ? undefined : formatGroupedInt}
          status={issueStatus}
        />
      </div>

      <HubFlow feeds={hub} />

      <div className="flex flex-wrap items-end gap-3">
        <Button variant="vivid" onClick={() => openWeek(shiftWeek(data.weekStart, -1))}>
          Previous week
        </Button>
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
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3"
          />
        </label>
        <Button variant="vividAlt" onClick={() => openWeek(shiftWeek(data.weekStart, 1))}>
          Next week
        </Button>
        <div className="space-y-1">
          <ReportWeekLabel weekStart={data.weekStart} />
          <p className="text-sm text-[var(--color-fg-muted)]">
            Showing {data.weekStart} through {data.weekEnd}
          </p>
        </div>
        <PrepareReportButtons weekStart={data.weekStart} showAll />
      </div>

      <div className="flex flex-wrap gap-3">
        <p className="material flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm">
          <StatusDot tone={data.locked ? "warn" : "ok"} glow />
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
            className="pressable material inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] no-underline hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <StatusDot tone={data.openIssueCount > 0 ? "danger" : "ok"} glow />
            Open issues: {data.openIssueCount}
          </Link>
        )}
      </div>

      <SheetsEnvBanner missing={data.sheetEnvMissing} />
      <FleetCharts rows={data.insOuts} />
      <TruckCardGrid rows={data.insOuts} />

      {data.mismatchCount != null ? (
        <Link
          href={`/sheet-compare?week=${data.weekStart}`}
          className="pressable material inline-flex rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-accent)] no-underline"
        >
          Sheet vs Vektor: {data.mismatchCount} open rate or missing-load checks
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
      <ManagementSummaryTable summary={cards} />
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
      loaded: sum.loaded + (row.loadedMilesHundredths ?? 0),
      deadhead: sum.deadhead + (row.deadheadMilesHundredths ?? 0),
    }),
    { insCents: 0, outsCents: 0, loadCount: 0, loaded: 0, deadhead: 0 },
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
              <th className="px-3 py-3 font-medium">Loaded miles</th>
              <th className="px-3 py-3 font-medium">Deadhead</th>
              <th className="px-3 py-3 font-medium">RPM</th>
              <th className="px-3 py-3 font-medium">MPG</th>
              <th className="px-3 py-3 font-medium">Ins</th>
              <th className="px-3 py-3 font-medium">Outs</th>
              <th className="px-3 py-3 font-medium">Net</th>
              <th className="px-3 py-3 font-medium">Out detail</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td className="px-3 py-3" colSpan={10} role="alert">
                  <CopyableError headline="Ins and Outs could not be loaded." detail={error} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-[var(--color-fg-muted)]" colSpan={10}>
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
                  <td className="px-3 py-2">{row.readable ? formatMilesWhole(row.loadedMilesHundredths ?? 0) : ""}</td>
                  <td className="px-3 py-2">{row.readable ? miles(row.deadheadMilesHundredths) : ""}</td>
                  <td className="px-3 py-2">{row.readable ? rpm(row.rpmCents) : ""}</td>
                  <td className="px-3 py-2">{row.readable ? (row.mpg ?? "") : ""}</td>
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
                <td className="px-3 py-2">{formatMilesWhole(fleet.loaded)}</td>
                <td className="px-3 py-2">{formatMilesHundredths(fleet.deadhead)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
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
        Ins are load rates from each truck Google Sheet. Outs are that truck&apos;s Weekly Expenses row for the
        week (driver pay, management fee, fuel, and the other weekly lines). If that tab is missing, Outs use
        the Mgmt Expenses rows instead. Monthly Legacy company expenses stay on Management and are not added
        into these outs. Loaded miles are whole miles.{" "}
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
