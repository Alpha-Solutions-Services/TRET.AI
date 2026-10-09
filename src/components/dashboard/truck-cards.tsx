"use client";

import { categoryColor } from "@/lib/charts/palette";
import { formatMilesWhole, formatStatementDollars } from "@/lib/reports/format";
import type { TruckWeekInsOuts } from "@/lib/sheets/ins-outs";
import { CopyableError } from "@/components/copyable-error";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";

function money(cents: number): string {
  return formatStatementDollars(cents);
}

function rpm(cents: number | null | undefined): string {
  if (cents == null) return "None";
  return formatStatementDollars(cents);
}

export function TruckCardGrid({ rows }: { rows: TruckWeekInsOuts[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--color-fg-muted)]">No active trucks.</p>;
  }
  return (
    <section className="space-y-3" aria-label="Trucks">
      <h2 className="text-sm font-medium">Trucks</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row, index) => (
          <TruckCard key={row.unitNumber} row={row} color={categoryColor(index)} />
        ))}
      </div>
    </section>
  );
}

function TruckCard({ row, color }: { row: TruckWeekInsOuts; color: string }) {
  const tone = truckTone(row);
  return (
    <article
      className="material rounded-2xl border px-5 py-4"
      style={{
        borderColor: `color-mix(in srgb, ${color} 65%, var(--color-border))`,
        boxShadow: `0 0 18px color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-base font-semibold">
            <StatusDot tone={tone} glow />
            Unit {row.unitNumber}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{row.truckName}</p>
        </div>
        <p className="num text-sm font-semibold" style={{ color }}>
          {row.readable ? money(row.netCents) : ""}
        </p>
      </div>
      {row.readable ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Stat label="Loads" value={String(row.loadCount)} />
          <Stat label="Miles" value={formatMilesWhole(row.loadedMilesHundredths ?? 0)} />
          <Stat label="RPM" value={rpm(row.rpmCents)} />
          <Stat label="MPG" value={row.mpg ?? "None"} />
          <Stat label="Net" value={money(row.netCents)} />
        </dl>
      ) : (
        <div className="mt-3">
          <CopyableError headline={row.note ?? "Sheet was not read."} detail={row.noteDetail} />
        </div>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="num font-medium">{value}</dd>
    </div>
  );
}

function truckTone(row: TruckWeekInsOuts): StatusTone {
  if (!row.readable) return "danger";
  if (row.note) return "warn";
  return "ok";
}
