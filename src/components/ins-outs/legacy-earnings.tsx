"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveLegacyLoadFeeAction,
  saveLegacyTruckWeekFeeAction,
  seedLegacyLoadFeesAction,
} from "@/app/ins-outs/fee-actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  feeCentsFromRate,
  feeSourceLabel,
  type LegacyEarnings,
  type LegacyLoadLine,
} from "@/lib/legacy/fees";
import { bpToPercentString, tryPercentStringToBp } from "@/lib/fees/percent";
import { centsToDollarString, tryDollarStringToCents } from "@/lib/money/cents";

function money(cents: number): string {
  return `$${centsToDollarString(cents)}`;
}

const fieldClass = "h-9 w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-2 text-sm";

export function LegacyEarningsPanel({
  weekStart,
  earnings,
  ready,
  error,
  orgFeeBp,
}: {
  weekStart: string;
  earnings: LegacyEarnings;
  ready: boolean;
  error: string | null;
  orgFeeBp: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const seedRows = earnings.trucks.flatMap((truck) =>
    truck.loads
      .filter((load) => (load.source === "org" || load.source === "truck_week") && load.feeBp != null)
      .map((load) => ({
        unitNumber: load.unitNumber,
        loadId: load.loadId,
        feeBp: load.feeBp ?? orgFeeBp,
      })),
  );

  function seed() {
    startTransition(async () => {
      const result = await seedLegacyLoadFeesAction({ weekStart, rows: seedRows });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Default fees saved for this week", "success");
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Legacy earnings</h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
            Legacy keeps a management fee on each load. The default is {bpToPercentString(orgFeeBp)}% of that
            load&apos;s sheet rate. Change the default in Settings. Change one truck for this week, or one
            load&apos;s percent or dollar amount, here. Truck sheet outs above stay the truck&apos;s own sheet
            rows. Portal monthly Legacy expenses are not added into those outs.
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-[var(--color-fg-muted)]">Fleet Legacy earnings</p>
          <p className="text-lg font-semibold">{money(earnings.fleetFeeCents)}</p>
        </div>
      </div>

      {!ready ? (
        <p className="text-sm text-[var(--color-fg-muted)]" role="status">
          {error ??
            "Saving fees needs the v0.0.0.20 migration. The amounts below use the default and are not stored yet."}
        </p>
      ) : null}

      {ready && seedRows.length > 0 ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={seed}>
          Save these default fees
        </Button>
      ) : null}

      {earnings.trucks.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No readable loads for this week.</p>
      ) : (
        earnings.trucks.map((truck) => (
          <TruckFees
            key={truck.unitKey}
            weekStart={weekStart}
            truck={truck}
            ready={ready}
            pending={pending}
            startTransition={startTransition}
          />
        ))
      )}
    </section>
  );
}

function TruckFees({
  weekStart,
  truck,
  ready,
  pending,
  startTransition,
}: {
  weekStart: string;
  truck: LegacyEarnings["trucks"][number];
  ready: boolean;
  pending: boolean;
  startTransition: (callback: () => void) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const weekBp = truck.loads.find((load) => load.source === "truck_week")?.feeBp;
  const [percent, setPercent] = useState(weekBp == null ? "" : bpToPercentString(weekBp));

  function saveWeek() {
    const parsed = tryPercentStringToBp(percent);
    if (!parsed.ok) {
      toast(parsed.error, "error");
      return;
    }
    startTransition(async () => {
      const result = await saveLegacyTruckWeekFeeAction({
        weekStart,
        unitNumber: truck.unitNumber,
        mode: "percent",
        feeBp: parsed.bp,
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Truck week fee saved", "success");
      router.refresh();
    });
  }

  function clearWeek() {
    startTransition(async () => {
      const result = await saveLegacyTruckWeekFeeAction({
        weekStart,
        unitNumber: truck.unitNumber,
        mode: "clear",
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Truck week fee cleared", "success");
      router.refresh();
    });
  }

  return (
    <div className="material overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] px-3 py-3">
        <div>
          <p className="font-medium">
            Unit {truck.unitNumber}
            <span className="ml-2 text-sm font-normal text-[var(--color-fg-muted)]">{truck.truckName}</span>
          </p>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Ins {money(truck.insCents)}. Legacy earnings {money(truck.feeCents)}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-[var(--color-fg-muted)]">This truck, this week (%)</span>
            <input
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              inputMode="decimal"
              className={fieldClass}
              disabled={!ready || pending}
            />
          </label>
          <Button type="button" variant="secondary" disabled={!ready || pending} onClick={saveWeek}>
            Save truck
          </Button>
          <Button type="button" variant="secondary" disabled={!ready || pending || weekBp == null} onClick={clearWeek}>
            Clear truck
          </Button>
        </div>
      </div>
      {truck.loads.length === 0 ? (
        <p className="px-3 py-3 text-sm text-[var(--color-fg-muted)]">No rated loads this week.</p>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Load</th>
              <th className="px-3 py-2 font-medium">Rate</th>
              <th className="px-3 py-2 font-medium">Fee %</th>
              <th className="px-3 py-2 font-medium">Fee</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {truck.loads.map((load) => (
              <LoadFeeRow
                key={`${load.unitKey}-${load.loadKey}`}
                weekStart={weekStart}
                load={load}
                ready={ready}
                pending={pending}
                startTransition={startTransition}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LoadFeeRow({
  weekStart,
  load,
  ready,
  pending,
  startTransition,
}: {
  weekStart: string;
  load: LegacyLoadLine;
  ready: boolean;
  pending: boolean;
  startTransition: (callback: () => void) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [percent, setPercent] = useState(load.feeBp == null ? "" : bpToPercentString(load.feeBp));
  const [dollars, setDollars] = useState(centsToDollarString(load.feeCents));
  const [touched, setTouched] = useState<"percent" | "amount" | null>(null);

  function onPercent(value: string) {
    setPercent(value);
    setTouched("percent");
    const parsed = tryPercentStringToBp(value);
    if (parsed.ok) setDollars(centsToDollarString(feeCentsFromRate(load.rateCents, parsed.bp)));
  }

  function save() {
    const useAmount = touched === "amount";
    if (useAmount) {
      const parsed = tryDollarStringToCents(dollars);
      if (!parsed.ok) {
        toast(parsed.error, "error");
        return;
      }
      startTransition(async () => {
        const result = await saveLegacyLoadFeeAction({
          weekStart,
          unitNumber: load.unitNumber,
          loadId: load.loadId,
          mode: "amount",
          feeCents: parsed.cents,
        });
        if (!result.ok) {
          toast(result.error, "error");
          return;
        }
        toast("Load fee saved", "success");
        router.refresh();
      });
      return;
    }
    const parsed = tryPercentStringToBp(percent);
    if (!parsed.ok) {
      toast(parsed.error, "error");
      return;
    }
    startTransition(async () => {
      const result = await saveLegacyLoadFeeAction({
        weekStart,
        unitNumber: load.unitNumber,
        loadId: load.loadId,
        mode: "percent",
        feeBp: parsed.bp,
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Load fee saved", "success");
      router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await saveLegacyLoadFeeAction({
        weekStart,
        unitNumber: load.unitNumber,
        loadId: load.loadId,
        mode: "clear",
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Load fee cleared", "success");
      router.refresh();
    });
  }

  const saved = load.source === "saved_amount" || load.source === "saved_percent";

  return (
    <tr className="border-t border-[var(--color-border)]">
      <td className="px-3 py-2">{load.loadId}</td>
      <td className="px-3 py-2">{money(load.rateCents)}</td>
      <td className="px-3 py-2">
        <input
          value={percent}
          onChange={(event) => onPercent(event.target.value)}
          inputMode="decimal"
          className={fieldClass}
          disabled={!ready || pending}
          aria-label={`Fee percent for ${load.loadId}`}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={dollars}
          onChange={(event) => {
            setDollars(event.target.value);
            setTouched("amount");
          }}
          inputMode="decimal"
          className={fieldClass}
          disabled={!ready || pending}
          aria-label={`Fee amount for ${load.loadId}`}
        />
      </td>
      <td className="px-3 py-2 text-[var(--color-fg-muted)]">{feeSourceLabel(load.source)}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!ready || pending} onClick={save}>
            Save
          </Button>
          <Button type="button" variant="secondary" disabled={!ready || pending || !saved} onClick={clear}>
            Use default
          </Button>
        </div>
      </td>
    </tr>
  );
}
