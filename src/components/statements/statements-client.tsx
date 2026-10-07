"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeWeekAction } from "@/app/statements/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { bpToPercentString } from "@/lib/fees/percent";
import { centsToDollarString } from "@/lib/money/cents";
import type { StatementsPageData } from "@/lib/statements/queries";
import type { UnitStatement } from "@/lib/statements/types";
import { truckClassLabel } from "@/lib/fees/kinds";

function money(cents: number): string {
  if (cents < 0) return `-$${centsToDollarString(-cents)}`;
  return `$${centsToDollarString(cents)}`;
}

function shiftWeek(weekStart: string, delta: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return weekBoundsForDate(date.toISOString().slice(0, 10)).start;
}

function feeCell(unit: UnitStatement): number {
  return unit.truckClass === "third_party" ? unit.managementFeeCents : unit.tolsonPayableCents;
}

export function StatementsClient({ data }: { data: StatementsPageData }) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [unitNumber, setUnitNumber] = useState(data.units[0]?.unitNumber ?? "");
  const selected = data.units.find((unit) => unit.unitNumber === unitNumber) ?? data.units[0];

  function openWeek(next: string) {
    router.push(`/statements?week=${next}`);
  }

  async function onClose() {
    const accepted = await confirm({
      title: "Lock this week",
      message: `Lock ${data.weekStart} through ${data.weekEnd}? A locked week stays locked. Later corrections are adjustment rows, which are not in this version.`,
      confirmLabel: "Lock week",
    });
    if (!accepted) return;
    startTransition(async () => {
      const result = await closeWeekAction(data.weekStart);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Week locked", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Monday–Sunday statements by delivery date. Amounts are cents. Legacy-owned trucks show Tolson payable.
          Managed trucks show one management fee. The Tolson and Legacy split is stored and is not subtracted again.
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

      {data.error ? (
        <p className="text-sm text-red-700" role="alert">
          {data.error}
        </p>
      ) : null}

      {data.locked ? (
        <p className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm">
          Locked{data.closedAt ? ` ${data.closedAt.slice(0, 10)}` : ""}. This snapshot does not change.
        </p>
      ) : null}

      {data.liveDiffers ? (
        <p className="text-sm text-red-700" role="status">
          Live loads, fuel, or tolls no longer match this locked snapshot.
        </p>
      ) : null}

      {!data.lockReady && !data.locked ? (
        <p className="text-sm text-[var(--color-fg-muted)]">
          Close stays off until the v0.0.0.8 migration is applied.
        </p>
      ) : null}

      {data.blockers.length > 0 ? (
        <div role="alert" aria-labelledby="statement-blockers" className="rounded-md border border-red-200 bg-white px-3 py-3">
          <h2 id="statement-blockers" className="text-sm font-medium text-red-800">
            Close is blocked
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {data.blockers.map((blocker) => (
              <li key={`${blocker.rule}:${blocker.ref ?? ""}:${blocker.message}`}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!data.locked && data.lockReady ? (
        <Button
          type="button"
          onClick={onClose}
          disabled={!data.closeAllowed || pending}
          aria-describedby={data.blockers.length > 0 ? "statement-blockers" : undefined}
        >
          {pending ? "Locking…" : "Close week"}
        </Button>
      ) : null}

      {data.units.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-6 py-12 text-center text-[var(--color-fg-muted)]">
          Nothing to show for this week.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
            <table className="min-w-full text-left text-sm">
              <caption className="px-3 py-3 text-left font-medium">
                Fleet ({data.fleet.unitCount} units)
              </caption>
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
                <tr>
                  <th className="px-3 py-3 font-medium">Unit</th>
                  <th className="px-3 py-3 font-medium">Class</th>
                  <th className="px-3 py-3 font-medium">Loads</th>
                  <th className="px-3 py-3 font-medium">Gross</th>
                  <th className="px-3 py-3 font-medium">Driver</th>
                  <th className="px-3 py-3 font-medium">Management / Tolson</th>
                  <th className="px-3 py-3 font-medium">Dispatch</th>
                  <th className="px-3 py-3 font-medium">Factoring</th>
                  <th className="px-3 py-3 font-medium">Fuel</th>
                  <th className="px-3 py-3 font-medium">Tolls</th>
                  <th className="px-3 py-3 font-medium">Fixed</th>
                  <th className="px-3 py-3 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.units.map((unit) => (
                  <tr key={unit.truckId} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-medium text-[var(--color-accent)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        onClick={() => setUnitNumber(unit.unitNumber)}
                      >
                        {unit.unitNumber}
                      </button>
                    </td>
                    <td className="px-3 py-2">{truckClassLabel(unit.truckClass)}</td>
                    <td className="px-3 py-2">{unit.loadCount}</td>
                    <td className="px-3 py-2">{money(unit.grossCents)}</td>
                    <td className="px-3 py-2">{money(unit.driverPayCents)}</td>
                    <td className="px-3 py-2">{money(feeCell(unit))}</td>
                    <td className="px-3 py-2">{money(unit.dispatchFeeCents)}</td>
                    <td className="px-3 py-2">{money(unit.factoringFeeCents)}</td>
                    <td className="px-3 py-2">{money(unit.fuelCents)}</td>
                    <td className="px-3 py-2">{money(unit.tollsCents)}</td>
                    <td className="px-3 py-2">{money(unit.fixedOwnerCents)}</td>
                    <td className="px-3 py-2">{money(unit.netCents)}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-muted)] font-medium">
                  <td className="px-3 py-2">Fleet</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">{data.fleet.loadCount}</td>
                  <td className="px-3 py-2">{money(data.fleet.grossCents)}</td>
                  <td className="px-3 py-2">{money(data.fleet.driverPayCents)}</td>
                  <td className="px-3 py-2">{money(data.units.reduce((sum, unit) => sum + feeCell(unit), 0))}</td>
                  <td className="px-3 py-2">{money(data.fleet.dispatchFeeCents)}</td>
                  <td className="px-3 py-2">{money(data.fleet.factoringFeeCents)}</td>
                  <td className="px-3 py-2">{money(data.fleet.fuelCents)}</td>
                  <td className="px-3 py-2">{money(data.fleet.tollsCents)}</td>
                  <td className="px-3 py-2">{money(data.fleet.fixedOwnerCents)}</td>
                  <td className="px-3 py-2">{money(data.fleet.netCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Fleet Tolson payable {money(data.fleet.tolsonPayableCents)}. Legacy retained{" "}
            {money(data.fleet.legacyRetainedCents)}. Fixed expenses charged to management{" "}
            {money(data.fleet.fixedManagementCents)} are not in net.
          </p>

          {selected ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
              <table className="min-w-full text-left text-sm">
                <caption className="px-3 py-3 text-left font-medium">
                  Unit {selected.unitNumber} lines
                </caption>
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
                  <tr>
                    <th className="px-3 py-3 font-medium">Line</th>
                    <th className="px-3 py-3 font-medium">Rate</th>
                    <th className="px-3 py-3 font-medium">Calculated on</th>
                    <th className="px-3 py-3 font-medium">Charged to</th>
                    <th className="px-3 py-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((line) => (
                    <tr key={line.lineCode} className="border-b border-[var(--color-border)]">
                      <td className="px-3 py-2">
                        {line.label}
                        {line.ownerVisible ? "" : " (internal)"}
                      </td>
                      <td className="px-3 py-2">
                        {line.rateBp == null ? "—" : `${bpToPercentString(line.rateBp)}%`}
                      </td>
                      <td className="px-3 py-2">
                        {line.basePctBp == null ? "—" : `${bpToPercentString(line.basePctBp)}%`}
                      </td>
                      <td className="px-3 py-2">
                        {line.chargedTo == null ? "—" : line.chargedTo === "owner" ? "Owner" : "Management"}
                      </td>
                      <td className="px-3 py-2">{money(line.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
