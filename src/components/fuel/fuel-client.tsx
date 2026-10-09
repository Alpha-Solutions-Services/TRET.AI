"use client";

import { useMemo, useState } from "react";
import { FileImportPanel } from "@/components/fuel-tolls/file-import-panel";
import type { OpenQueueItem } from "@/lib/fuel-tolls/file/messages";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { fuelWeekTotals } from "@/lib/fuel-tolls/totals";
import { formatGallonsMilli } from "@/lib/fuel-tolls/quantity";
import { centsToDollarString } from "@/lib/money/cents";

export type FuelListRow = {
  id: string;
  vektor_transaction_id: string;
  unit_number: string | null;
  transacted_date: string;
  week_start: string;
  product: string;
  card: string | null;
  gallons_milli: number;
  amount_cents: number;
  retail_amount_cents: number | null;
};

function money(cents: number): string {
  if (cents < 0) return `-$${centsToDollarString(-cents)}`;
  return `$${centsToDollarString(cents)}`;
}

export function FuelClient({
  rows,
  truckUnits,
  queue,
  queueReady,
}: {
  rows: FuelListRow[];
  truckUnits: string[];
  queue: OpenQueueItem[];
  queueReady: boolean;
}) {
  const todayWeek = weekBoundsForDate(new Date().toISOString().slice(0, 10));
  const [weekStart, setWeekStart] = useState(todayWeek.start);
  const [truck, setTruck] = useState("");

  const weekEnd = useMemo(() => weekBoundsForDate(weekStart).end, [weekStart]);
  const inWeek = useMemo(
    () => rows.filter((row) => row.week_start === weekStart),
    [rows, weekStart],
  );
  const filtered = useMemo(
    () => inWeek.filter((row) => !truck || row.unit_number === truck),
    [inWeek, truck],
  );
  const byUnit = useMemo(
    () =>
      fuelWeekTotals(
        filtered.map((row) => ({
          unitNumber: row.unit_number,
          weekStart: row.week_start,
          gallonsMilli: row.gallons_milli,
          amountCents: row.amount_cents,
          retailAmountCents: row.retail_amount_cents,
        })),
        weekStart,
      ),
    [filtered, weekStart],
  );

  function shiftWeek(delta: number) {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setWeekStart(weekBoundsForDate(d.toISOString().slice(0, 10)).start);
  }

  return (
    <div className="space-y-6">
      <FileImportPanel queue={queue} truckUnits={truckUnits} queueReady={queueReady} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fuel</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Promoted fuel for the Monday to Sunday week. Amount is the discounted price. Retail is shown beside it.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Previous week
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Week starting</span>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(weekBoundsForDate(e.target.value).start)}
            className="h-10 rounded-md border border-[var(--color-border)] px-3"
          />
        </label>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Next week
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Truck</span>
          <select
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3"
          >
            <option value="">All trucks</option>
            {truckUnits.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Showing {weekStart} through {weekEnd}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-field)] px-6 py-12 text-center text-[var(--color-fg-muted)]">
          No fuel yet. Use Import fuel and tolls on the Imports page.
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No fuel in this week.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-field)]">
            <table className="min-w-full text-left text-sm">
              <caption className="px-3 py-3 text-left font-medium">Per-unit week totals</caption>
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
                <tr>
                  <th className="px-3 py-3 font-medium">Unit</th>
                  <th className="px-3 py-3 font-medium">Transactions</th>
                  <th className="px-3 py-3 font-medium">Gallons</th>
                  <th className="px-3 py-3 font-medium">Discounted</th>
                  <th className="px-3 py-3 font-medium">Retail</th>
                  <th className="px-3 py-3 font-medium">Retail minus discounted</th>
                </tr>
              </thead>
              <tbody>
                {byUnit.map((row) => (
                  <tr key={row.unitNumber} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2">{row.unitNumber}</td>
                    <td className="px-3 py-2">{row.count}</td>
                    <td className="px-3 py-2">{formatGallonsMilli(row.gallonsMilli)}</td>
                    <td className="px-3 py-2">{money(row.amountCents)}</td>
                    <td className="px-3 py-2">{money(row.retailAmountCents)}</td>
                    <td className="px-3 py-2">{money(row.retailAmountCents - row.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-field)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
                <tr>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Unit</th>
                  <th className="px-3 py-3 font-medium">Product</th>
                  <th className="px-3 py-3 font-medium">Card</th>
                  <th className="px-3 py-3 font-medium">Gallons</th>
                  <th className="px-3 py-3 font-medium">Discounted</th>
                  <th className="px-3 py-3 font-medium">Retail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2">{row.transacted_date}</td>
                    <td className="px-3 py-2">{row.unit_number ?? "—"}</td>
                    <td className="px-3 py-2">{row.product}</td>
                    <td className="px-3 py-2">{row.card ?? "—"}</td>
                    <td className="px-3 py-2">{formatGallonsMilli(row.gallons_milli)}</td>
                    <td className="px-3 py-2">{money(row.amount_cents)}</td>
                    <td className="px-3 py-2">
                      {row.retail_amount_cents == null ? "—" : money(row.retail_amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
