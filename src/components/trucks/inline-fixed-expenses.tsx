"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveSheetWritesAction, saveFixedExpenseAndQueueAction } from "@/app/trucks/sheet-actions";
import { PrepareReportButtons, ReportWeekLabel } from "@/components/reports/report-week";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { SHEET_EXPENSE_LINES, type SheetExpenseKind } from "@/lib/sheets/fixed-expense-cells";
import { isFixedExpenseKind } from "@/lib/fixed-expenses/kinds";
import { lookupWeeklyFixedExpense } from "@/lib/fixed-expenses/lookup";
import type { FixedExpenseBundle } from "@/lib/fixed-expenses/queries";
import { centsToDollarString, tryDollarStringToCents } from "@/lib/money/cents";

const field = "h-10 w-full rounded-md border border-[var(--color-border)] px-2 text-sm";

export type QueuedSheetWrite = {
  id: string;
  kind: string;
  tab_title: string;
  column_header: string;
  week_start: string;
  a1: string | null;
  new_value: string;
  status: string;
  error: string | null;
};

type Props = {
  truckId: string;
  unitNumber: string;
  sheetUrl: string | null;
  weekStart: string;
  bundle: FixedExpenseBundle;
  queue: QueuedSheetWrite[];
};

export function InlineFixedExpenses({ truckId, unitNumber, sheetUrl, weekStart, bundle, queue }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const line of SHEET_EXPENSE_LINES) {
      if (!isFixedExpenseKind(line.kind)) {
        next[line.kind] = "";
        continue;
      }
      try {
        const resolved = lookupWeeklyFixedExpense({
          versions: bundle.expenses.map((row) => ({
            id: row.id,
            truckId: row.truck_id,
            kind: row.kind,
            weeklyAmountCents: row.weekly_amount_cents,
            chargedTo: row.charged_to,
            effectiveFrom: row.effective_from,
            effectiveTo: row.effective_to,
          })),
          overrides: [],
          truckId,
          kind: line.kind,
          weekStart,
        });
        next[line.kind] = centsToDollarString(resolved.amountCents);
      } catch {
        next[line.kind] = "";
      }
    }
    return next;
  });
  const [charged, setCharged] = useState<Record<string, "owner" | "management">>({});

  function save(kind: SheetExpenseKind) {
    const parsed = tryDollarStringToCents(amounts[kind] ?? "");
    if (!parsed.ok) {
      toast(parsed.error, "error");
      return;
    }
    startTransition(async () => {
      const result = await saveFixedExpenseAndQueueAction({
        truckId,
        unitNumber,
        kind,
        effectiveFrom: weekStart,
        weeklyAmountCents: parsed.cents,
        chargedTo: charged[kind] ?? "owner",
        sheetUrl,
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Saved in TRET. Approve the sheet write when the preview looks right.", "success");
      router.refresh();
    });
  }

  function approve() {
    startTransition(async () => {
      const result = await approveSheetWritesAction({ truckId, unitNumber, sheetUrl });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(`Wrote ${result.wrote} cell${result.wrote === 1 ? "" : "s"} to the sheet.`, "success");
      router.refresh();
    });
  }

  const waiting = queue.filter((row) => row.status === "queued");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fixed weekly expenses</h2>
          <ReportWeekLabel weekStart={weekStart} />
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Save stores the amount in TRET from this Monday. The Google Sheet changes only after you approve the preview.
          </p>
        </div>
        <PrepareReportButtons weekStart={weekStart} unitNumber={unitNumber} />
      </div>
      {SHEET_EXPENSE_LINES.every((line) => !amounts[line.kind]) ? (
        <p className="text-sm">No weekly amounts stored yet. Enter a dollar amount and save the row.</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[var(--color-fg-muted)]">
              <th className="py-2 pr-2">Expense</th>
              <th className="py-2 pr-2">Weekly amount</th>
              <th className="py-2 pr-2">Charged to</th>
              <th className="py-2 pr-2">Effective from</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {SHEET_EXPENSE_LINES.map((line) => (
              <tr key={line.kind} className="border-t border-[var(--color-border)]">
                <td className="py-2 pr-2">{line.label}</td>
                <td className="py-2 pr-2">
                  <input
                    className={field}
                    value={amounts[line.kind] ?? ""}
                    placeholder="Not set"
                    onChange={(event) => setAmounts((current) => ({ ...current, [line.kind]: event.target.value }))}
                  />
                </td>
                <td className="py-2 pr-2">
                  <select
                    className={field}
                    value={charged[line.kind] ?? "owner"}
                    onChange={(event) =>
                      setCharged((current) => ({
                        ...current,
                        [line.kind]: event.target.value === "management" ? "management" : "owner",
                      }))
                    }
                  >
                    <option value="owner">Owner</option>
                    <option value="management">Management</option>
                  </select>
                </td>
                <td className="py-2 pr-2">{weekStart}</td>
                <td className="py-2">
                  <Button type="button" variant="secondary" disabled={pending} onClick={() => save(line.kind)}>
                    Save
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">Sheet preview</h3>
        {waiting.length === 0 ? <p className="text-sm">No sheet cells are waiting.</p> : null}
        <ul className="space-y-1 text-sm">
          {waiting.map((row) => (
            <li key={row.id}>
              {row.tab_title} {row.a1 ?? row.column_header} week {row.week_start} becomes {row.new_value}
              {row.error ? ` (${row.error})` : ""}
            </li>
          ))}
        </ul>
        <Button type="button" variant="vivid" disabled={pending || waiting.length === 0} onClick={approve}>
          Approve
        </Button>
      </div>
    </section>
  );
}
