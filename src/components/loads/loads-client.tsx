"use client";

import { useMemo, useState } from "react";
import { weekBoundsForDate } from "@/lib/fee-engine";

export type LoadListRow = {
  id: string;
  load_id: string | null;
  manifest_friendly_id: string | null;
  delivery_date: string;
  week_start: string;
  pickup_date: string | null;
  driver_name: string | null;
  broker_name: string | null;
  origin_city: string | null;
  origin_state: string | null;
  destination_city: string | null;
  destination_state: string | null;
  loaded_distance_mi: number | null;
  deadhead_miles: number | null;
  rate_cents: number;
  truck_unit_number: string | null;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function place(city: string | null, state: string | null): string {
  if (!city && !state) return "—";
  return [city, state].filter(Boolean).join(", ");
}

export function LoadsClient({
  loads,
  truckUnits,
}: {
  loads: LoadListRow[];
  truckUnits: string[];
}) {
  const todayWeek = weekBoundsForDate(new Date().toISOString().slice(0, 10));
  const [weekStart, setWeekStart] = useState(todayWeek.start);
  const [truck, setTruck] = useState("");

  const weekEnd = useMemo(
    () => weekBoundsForDate(weekStart).end,
    [weekStart],
  );

  const filtered = useMemo(() => {
    return loads.filter((row) => {
      if (row.week_start !== weekStart) return false;
      if (truck && row.truck_unit_number !== truck) return false;
      return true;
    });
  }, [loads, weekStart, truck]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        acc.rateCents += row.rate_cents;
        acc.loaded += row.loaded_distance_mi ?? 0;
        acc.deadhead += row.deadhead_miles ?? 0;
        return acc;
      },
      { rateCents: 0, loaded: 0, deadhead: 0 },
    );
  }, [filtered]);

  function shiftWeek(delta: number) {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setWeekStart(weekBoundsForDate(d.toISOString().slice(0, 10)).start);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Loads</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Read-only. Week is Monday–Sunday from delivery date.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-2">
          <Buttonish onClick={() => shiftWeek(-1)}>Previous week</Buttonish>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--color-fg-muted)]">Week starting</span>
            <input
              type="date"
              value={weekStart}
              onChange={(e) =>
                setWeekStart(weekBoundsForDate(e.target.value).start)
              }
              className="h-10 rounded-md border border-[var(--color-border)] px-3"
            />
          </label>
          <Buttonish onClick={() => shiftWeek(1)}>Next week</Buttonish>
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Truck</span>
          <select
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3"
          >
            <option value="">All trucks</option>
            {truckUnits.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Showing {weekStart} → {weekEnd}
        </p>
      </div>

      {loads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-field)] px-6 py-12 text-center text-[var(--color-fg-muted)]">
          No loads yet. Run Import now on the Imports page after Vektor is configured.
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">
          No loads in this week{truck ? " for that truck" : ""}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-field)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-3 py-3 font-medium">Load ID</th>
                <th className="px-3 py-3 font-medium">Delivery</th>
                <th className="px-3 py-3 font-medium">Truck</th>
                <th className="px-3 py-3 font-medium">Driver</th>
                <th className="px-3 py-3 font-medium">Broker</th>
                <th className="px-3 py-3 font-medium">Origin</th>
                <th className="px-3 py-3 font-medium">Destination</th>
                <th className="px-3 py-3 font-medium">Loaded</th>
                <th className="px-3 py-3 font-medium">Deadhead</th>
                <th className="px-3 py-3 font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2">{row.load_id ?? "—"}</td>
                  <td className="px-3 py-2">{row.delivery_date}</td>
                  <td className="px-3 py-2">{row.truck_unit_number ?? "—"}</td>
                  <td className="px-3 py-2">{row.driver_name ?? "—"}</td>
                  <td className="px-3 py-2">{row.broker_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {place(row.origin_city, row.origin_state)}
                  </td>
                  <td className="px-3 py-2">
                    {place(row.destination_city, row.destination_state)}
                  </td>
                  <td className="px-3 py-2">{row.loaded_distance_mi ?? "—"}</td>
                  <td className="px-3 py-2">{row.deadhead_miles ?? "—"}</td>
                  <td className="px-3 py-2">{dollars(row.rate_cents)}</td>
                </tr>
              ))}
              <tr className="bg-[var(--color-muted)] font-medium">
                <td className="px-3 py-3" colSpan={7}>
                  Totals ({filtered.length} loads)
                </td>
                <td className="px-3 py-3">{totals.loaded.toFixed(2)}</td>
                <td className="px-3 py-3">{totals.deadhead.toFixed(2)}</td>
                <td className="px-3 py-3">{dollars(totals.rateCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Buttonish({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      {children}
    </button>
  );
}
