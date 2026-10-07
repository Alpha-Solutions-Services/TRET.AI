"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { resolveSheetFieldAction } from "@/app/sheet-compare/actions";
import { CopyableError } from "@/components/copyable-error";
import { useToast } from "@/components/ui/toast";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { loadMatchKey } from "@/lib/loads/load-id";
import { countedLoadedHundredths } from "@/lib/loads/manifest-miles";
import { centsToDollarString } from "@/lib/money/cents";
import { centsPerLoadedMile } from "@/lib/reports/format";
import { highlightToField, milesLabel, type AlignedLoad, type AlignHighlight } from "@/lib/sheets/align";
import type { FieldDecisionRow } from "@/lib/sheets/compare-load";
import { unitKey } from "@/lib/sheets/mismatch";

const FIELD_LABEL: Record<string, string> = {
  rate: "Rate",
  delivery_date: "Delivery date",
  pickup_date: "Pickup date",
  loaded_miles: "Loaded miles",
  deadhead: "Deadhead miles",
  driver: "Driver",
  presence: "Load",
};

const CHOICE_LABEL: Record<string, string> = {
  use_sheet: "Use sheet",
  use_vektor: "Use Vektor",
  write_sheet: "Write to sheet",
};

function sideTotals(rows: AlignedLoad[], side: "sheet" | "vektor"): {
  loaded: number;
  deadhead: number;
  rate: number;
  ratePerMile: number | null;
} {
  let loaded = 0;
  let deadhead = 0;
  let rate = 0;
  for (const row of rows) {
    const facts = row[side];
    if (!facts) continue;
    loaded += countedLoadedHundredths(row.manifestRole, facts.loadedMilesHundredths);
    deadhead += facts.deadheadMilesHundredths ?? 0;
    rate += facts.rateCents ?? 0;
  }
  const miles = loaded + deadhead;
  return {
    loaded,
    deadhead,
    rate,
    ratePerMile: miles === 0 ? null : centsPerLoadedMile(rate, miles),
  };
}

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

function dateLabel(day: string | null, kind: string | null | undefined): string {
  if (!day) return "Blank";
  if (kind === "manifest") return `${day} (manifest date)`;
  return day;
}

function resolveFields(row: AlignedLoad): string[] {
  const fields: string[] = [];
  for (const highlight of row.highlights) {
    const field = highlightToField(highlight);
    if (!fields.includes(field)) fields.push(field);
  }
  return fields;
}

function checkLabel(row: AlignedLoad): string {
  if (row.highlights.length === 0) return "Matches";
  const labels: string[] = [];
  if (row.highlights.includes("missing_vektor")) labels.push("Not in Vektor");
  if (row.highlights.includes("missing_sheet")) labels.push("Not on the sheet");
  if (row.highlights.includes("rate")) labels.push("Rate differs");
  if (row.highlights.includes("date")) labels.push("Date differs");
  if (row.highlights.includes("pickup")) labels.push("Pickup differs");
  if (row.highlights.includes("loaded_miles")) labels.push("Miles differ");
  if (row.highlights.includes("deadhead")) labels.push("Deadhead differs");
  if (row.highlights.includes("driver")) labels.push("Driver differs");
  return labels.join(", ") || "Differs";
}

const nowrap = "whitespace-nowrap px-3 py-2";
const num = `${nowrap} num`;

function SideTable({
  title,
  rows,
  side,
  weekStart,
  isAdmin,
  sheetEditable,
  decisions,
}: {
  title: string;
  rows: AlignedLoad[];
  side: "sheet" | "vektor";
  weekStart: string;
  isAdmin: boolean;
  sheetEditable: Record<string, boolean>;
  decisions: FieldDecisionRow[];
}) {
  const totals = sideTotals(rows, side);
  return (
    <section className="material overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-max min-w-full border-collapse text-left text-sm">
        <caption className="px-3 py-3 text-left font-medium">{title}</caption>
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
          <tr>
            <th className={`${nowrap} font-medium`}>Unit</th>
            <th className={`${nowrap} font-medium`}>Load</th>
            <th className={`${nowrap} font-medium`}>Pickup date</th>
            <th className={`${nowrap} font-medium`}>Delivery date</th>
            <th className={`${nowrap} font-medium`}>Rate</th>
            <th className={`${nowrap} font-medium`}>Loaded miles</th>
            <th className={`${nowrap} font-medium`}>Deadhead miles</th>
            <th className={`${nowrap} font-medium`}>Driver</th>
            <th className={`${nowrap} min-w-36 font-medium`}>Check</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-3 text-[var(--color-fg-muted)]" colSpan={9}>
                No loads for this week and truck.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const facts = row[side];
              const missing = side === "sheet" ? "missing_sheet" : "missing_vektor";
              const history = decisions.filter(
                (item) => unitKey(item.unitNumber) === unitKey(row.unitNumber) && item.loadKey === loadMatchKey(row.loadId),
              );
              const expand = side === "sheet" && (row.highlights.length > 0 || history.length > 0);
              return (
                <Fragment key={`${row.unitNumber}-${row.loadId}`}>
                  {row.manifestHeader && row.manifestRef ? (
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                      <td colSpan={9} className="px-3 py-2 text-sm font-medium">
                        Manifest {row.manifestRef}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-b border-[var(--color-border)]">
                    <td className={nowrap}>{row.unitNumber}</td>
                    <td className={`${nowrap} font-medium`}>{row.loadId}</td>
                    {facts ? (
                      <>
                        <td className={`${num} ${cellClass(row, "pickup")}`}>
                          {dateLabel(facts.pickupDay ?? null, facts.pickupDateKind)}
                        </td>
                        <td className={`${num} ${cellClass(row, "date")}`}>
                          {dateLabel(facts.deliveryDay, facts.deliveryDateKind)}
                        </td>
                        <td className={`${num} ${cellClass(row, "rate")}`}>{money(facts.rateCents)}</td>
                        <td className={`${num} ${cellClass(row, "loaded_miles")}`}>
                          {row.manifestRole === "partial" ? "partial" : milesLabel(facts.loadedMilesHundredths)}
                        </td>
                        <td className={`${num} ${cellClass(row, "deadhead")}`}>
                          {milesLabel(facts.deadheadMilesHundredths)}
                        </td>
                        <td className={`${nowrap} ${cellClass(row, "driver")}`}>{facts.driverName || "Blank"}</td>
                      </>
                    ) : (
                      <td className={`${nowrap} bg-[var(--color-warn-bg)] text-[var(--color-warn-fg)]`} colSpan={6}>
                        {missing === "missing_sheet" ? "Not on the sheet" : "Not in Vektor"}
                      </td>
                    )}
                    <td className={`${nowrap} min-w-36 text-[var(--color-fg-muted)]`}>{checkLabel(row)}</td>
                  </tr>
                  {expand ? (
                    <tr className="border-b border-[var(--color-border)]">
                      <td colSpan={9} className="bg-[var(--color-muted)] px-4 py-3">
                        {row.notes.length > 0 ? <p className="text-sm text-[var(--color-fg-muted)]">{row.notes.join(" ")}</p> : null}
                        {row.highlights.length > 0 ? (
                          <ResolveFields
                            row={row}
                            weekStart={weekStart}
                            isAdmin={isAdmin}
                            canEdit={sheetEditable[unitKey(row.unitNumber)] === true}
                          />
                        ) : null}
                        {history.length > 0 ? (
                          <ul className="mt-2 space-y-1 text-sm text-[var(--color-fg-muted)]">
                            {history.map((item) => (
                              <li key={item.id}>
                                {CHOICE_LABEL[item.choice] ?? item.choice} · {FIELD_LABEL[item.field] ?? item.field} · {item.note}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr className="border-t border-[var(--color-border)] bg-[var(--color-muted)] font-medium">
              <td className={nowrap} colSpan={4}>
                Totals
              </td>
              <td className={num}>{money(totals.rate)}</td>
              <td className={num}>{milesLabel(totals.loaded)}</td>
              <td className={num}>{milesLabel(totals.deadhead)}</td>
              <td className={nowrap} />
              <td className={`${nowrap} text-[var(--color-fg-muted)]`}>
                {totals.ratePerMile == null ? "Rate per mile n/a" : `${money(totals.ratePerMile)} per mile`}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      <p className="px-3 pb-3 text-xs text-[var(--color-fg-muted)]">
        Loaded miles count once per manifest. A partial load shows as partial and is left out of that total. Revenue still adds every load.
      </p>
    </section>
  );
}

function ResolveFields({
  row,
  weekStart,
  isAdmin,
  canEdit,
}: {
  row: AlignedLoad;
  weekStart: string;
  isAdmin: boolean;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!isAdmin) {
    return <p className="mt-3 text-sm">Only an admin can resolve a mismatch.</p>;
  }
  return (
    <div className="mt-3 space-y-3">
      {resolveFields(row).map((field) => {
        const sheetBlocked = field === "presence" && row.highlights.includes("missing_vektor");
        const noSheet = !row.sheet;
        const buttonClass =
          "pressable inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium disabled:opacity-50";
        return (
          <div key={field} className="flex min-w-[40rem] flex-nowrap items-center gap-3">
            <span className="w-28 shrink-0 text-sm font-medium text-[var(--color-fg)]">{FIELD_LABEL[field]}</span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Note for {FIELD_LABEL[field]}</span>
              <input
                value={notes[field] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [field]: event.target.value }))}
                placeholder="Short note"
                maxLength={200}
                className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={pending || sheetBlocked || noSheet}
              title={sheetBlocked ? "Import this load before using the sheet value." : undefined}
              onClick={() => choose(field, "use_sheet")}
              className={`${buttonClass} border border-[var(--color-border)] bg-[var(--color-field)]`}
            >
              Use sheet
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(field, "use_vektor")}
              className={`${buttonClass} bg-[var(--color-accent)] text-[var(--color-on-accent)]`}
            >
              Use Vektor
            </button>
            {field !== "presence" ? (
              <button
                type="button"
                disabled={pending || !canEdit}
                title={canEdit ? undefined : "The Google account cannot edit this sheet."}
                onClick={() => choose(field, "write_sheet")}
                className={`${buttonClass} border border-[var(--color-border)] bg-[var(--color-field)]`}
              >
                Write to sheet
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  function choose(field: string, choice: "use_sheet" | "use_vektor" | "write_sheet") {
    startTransition(async () => {
      const result = await resolveSheetFieldAction({
        weekStart,
        unitNumber: row.unitNumber,
        loadId: row.loadId,
        field,
        choice,
        note: notes[field] ?? "",
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(result.message, "success");
      router.refresh();
    });
  }
}

export function SheetCompareClient({
  weekStart,
  weekEnd,
  unit,
  trucks,
  rows,
  decisions,
  isAdmin,
  sheetEditable,
  error,
}: {
  weekStart: string;
  weekEnd: string;
  unit: string;
  trucks: Array<{ unitNumber: string; truckName: string }>;
  rows: AlignedLoad[];
  decisions: FieldDecisionRow[];
  isAdmin: boolean;
  sheetEditable: Record<string, boolean>;
  error: string | null;
}) {
  const router = useRouter();

  function open(nextWeek: string, nextUnit: string) {
    const params = new URLSearchParams();
    params.set("week", nextWeek);
    if (nextUnit) params.set("unit", nextUnit);
    router.push(`/sheet-compare?${params.toString()}`);
  }

  const shared = { weekStart, isAdmin, sheetEditable, decisions };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[1.75rem]">Sheet vs Vektor</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Sheet load records for this week are on top. Vektor load records for the same load numbers are
          below. A highlighted cell means that load is missing on one side, or the rate, date, miles, or
          driver do not match. A manifest date is labeled and is not a mismatch. An admin can use the sheet
          value, accept Vektor, or write one cell when the Google account can edit the sheet.
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

      <SideTable title="Sheet load records" rows={rows} side="sheet" {...shared} />
      <SideTable title="Vektor load records" rows={rows} side="vektor" {...shared} />
    </div>
  );
}
