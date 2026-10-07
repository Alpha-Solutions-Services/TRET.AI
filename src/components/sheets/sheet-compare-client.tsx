"use client";

import { useRouter } from "next/navigation";
import { CopyableError } from "@/components/copyable-error";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { centsToDollarString } from "@/lib/money/cents";
import { milesLabel, type AlignedLoad, type AlignHighlight } from "@/lib/sheets/align";

function money(cents: number | null): string {
  if (cents == null) return "Blank";
  if (cents < 0) return `-$${centsToDollarString(-cents)}`;
  return `$${centsToDollarString(cents)}`;
}

function shiftWeek(weekStart: string, delta: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return weekBoundsForDate(date.toISOString().slice(0, 10)).start;
}

function cellClass(row: AlignedLoad, field: AlignHighlight): string {
  return row.highlights.includes(field)
    ? "bg-[var(--color-warn-bg)] text-[var(--color-warn-fg)]"
    : "";
}

function SideTable({
  title,
  rows,
  side,
}: {
  title: string;
  rows: AlignedLoad[];
  side: "sheet" | "vektor";
}) {
  return (
    <section className="material overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="min-w-full text-left text-sm">
        <caption className="px-3 py-3 text-left font-medium">{title}</caption>
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
          <tr>
            <th className="px-3 py-3 font-medium">Unit</th>
            <th className="px-3 py-3 font-medium">Load</th>
            <th className="px-3 py-3 font-medium">Delivery date</th>
            <th className="px-3 py-3 font-medium">Rate</th>
            <th className="px-3 py-3 font-medium">Loaded miles</th>
            <th className="px-3 py-3 font-medium">Deadhead miles</th>
            <th className="px-3 py-3 font-medium">Check</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-3 text-[var(--color-fg-muted)]" colSpan={7}>
                No loads for this week and truck.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const facts = row[side];
              const missing = side === "sheet" ? "missing_sheet" : "missing_vektor";
              return (
                <tr key={`${row.unitNumber}-${row.loadId}`} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2">{row.unitNumber}</td>
                  <td className="px-3 py-2 font-medium">{row.loadId}</td>
                  {facts ? (
                    <>
                      <td className={`px-3 py-2 ${cellClass(row, "date")}`}>{facts.deliveryDay ?? "Blank"}</td>
                      <td className={`px-3 py-2 ${cellClass(row, "rate")}`}>{money(facts.rateCents)}</td>
                      <td className={`px-3 py-2 ${cellClass(row, "loaded_miles")}`}>
                        {milesLabel(facts.loadedMilesHundredths)}
                      </td>
                      <td className={`px-3 py-2 ${cellClass(row, "deadhead")}`}>
                        {milesLabel(facts.deadheadMilesHundredths)}
                      </td>
                    </>
                  ) : (
                    <td className="px-3 py-2 bg-[var(--color-warn-bg)] text-[var(--color-warn-fg)]" colSpan={4}>
                      {missing === "missing_sheet" ? "Not on the sheet" : "Not in Vektor"}
                    </td>
                  )}
                  <td className="max-w-sm px-3 py-2 text-[var(--color-fg-muted)]">
                    {row.notes.length === 0 ? "Matches" : row.notes.join(" ")}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}

export function SheetCompareClient({
  weekStart,
  weekEnd,
  unit,
  trucks,
  rows,
  error,
}: {
  weekStart: string;
  weekEnd: string;
  unit: string;
  trucks: Array<{ unitNumber: string; truckName: string }>;
  rows: AlignedLoad[];
  error: string | null;
}) {
  const router = useRouter();

  function open(nextWeek: string, nextUnit: string) {
    const params = new URLSearchParams();
    params.set("week", nextWeek);
    if (nextUnit) params.set("unit", nextUnit);
    router.push(`/sheet-compare?${params.toString()}`);
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[1.75rem]">Sheet vs Vektor</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Sheet load records for this week are on top. Vektor load records for the same load numbers are
          below. A highlighted cell means that load is missing on one side, or the rate, delivery date, or
          miles do not match.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => open(shiftWeek(weekStart, -1), unit)}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium"
        >
          Previous week
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Week starting</span>
          <input
            type="date"
            value={weekStart}
            onChange={(event) => {
              if (!event.target.value) return;
              try {
                open(weekBoundsForDate(event.target.value).start, unit);
              } catch {
                return;
              }
            }}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3"
          />
        </label>
        <button
          type="button"
          onClick={() => open(shiftWeek(weekStart, 1), unit)}
          className="pressable inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium"
        >
          Next week
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Truck</span>
          <select
            value={unit}
            onChange={(event) => open(weekStart, event.target.value)}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3"
          >
            <option value="">All trucks</option>
            {trucks.map((truck) => (
              <option key={truck.unitNumber} value={truck.unitNumber}>
                {truck.unitNumber} {truck.truckName}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Showing {weekStart} through {weekEnd}
        </p>
      </div>

      {error ? (
        <div role="alert">
          <CopyableError headline="This comparison could not be loaded." detail={error} />
        </div>
      ) : null}

      <SideTable title="Sheet load records" rows={rows} side="sheet" />
      <SideTable title="Vektor load records" rows={rows} side="vektor" />
    </div>
  );
}
