"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveDailyCheckAction } from "@/app/daily-check/actions";
import { ReportWeekLabel } from "@/components/reports/report-week";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { shiftWeek, weekBoundsForDate } from "@/lib/fee-engine";
import type { DailyCheckSummary } from "@/lib/reports/daily-check";

export function DailyCheckClient({
  weekStart,
  summary,
  error,
  approved,
}: {
  weekStart: string;
  summary: DailyCheckSummary;
  error: string | null;
  approved: boolean;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [pending, startTransition] = useTransition();
  const lines = [
    ["New loads", summary.loadsNew],
    ["Changed loads", summary.loadsChanged],
    ["Cancelled loads", summary.loadsCancelled],
    ["Fuel added", summary.fuelAdded],
    ["Fuel duplicates skipped", summary.fuelDuplicates],
    ["Fills unlinked", summary.fuelUnlinked],
    ["Tolls added", summary.tollsAdded],
    ["Receipts found", summary.receiptsFound],
  ] as const;

  function openWeek(next: string) {
    router.push(`/daily-check?week=${next}`);
  }

  function onApprove() {
    startTransition(async () => {
      const accepted = await confirm({
        title: "Approve this daily check",
        message: "This marks the week as reviewed. It does not lock the week or change a load.",
        confirmLabel: "Approve",
      });
      if (!accepted) return;
      const result = await approveDailyCheckAction(weekStart);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily check</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          What came in for this week from loads, fuel, tolls, and receipts. One approve covers the list.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="secondary" onClick={() => openWeek(shiftWeek(weekStart, -1))}>
          Previous week
        </Button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Week starting</span>
          <input
            type="date"
            value={weekStart}
            onChange={(event) => {
              if (!event.target.value) return;
              try {
                openWeek(weekBoundsForDate(event.target.value).start);
              } catch {
                return;
              }
            }}
            className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3"
          />
        </label>
        <Button type="button" variant="secondary" onClick={() => openWeek(shiftWeek(weekStart, 1))}>
          Next week
        </Button>
        <ReportWeekLabel weekStart={weekStart} />
      </div>
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {lines.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-3">
            <dt className="text-xs text-[var(--color-fg-muted)]">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-3">
        <h2 className="text-sm font-medium">Trucks that do not match the sheet</h2>
        {summary.truckMismatches.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">None.</p>
        ) : (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {summary.truckMismatches.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        )}
      </section>
      <Button type="button" onClick={onApprove} disabled={pending || approved}>
        {approved ? "Approved" : pending ? "Saving…" : "Approve"}
      </Button>
    </div>
  );
}
