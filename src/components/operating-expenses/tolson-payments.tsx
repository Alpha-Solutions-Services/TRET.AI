"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTolsonPaymentAction } from "@/app/operating-expenses/tolson-actions";
import { ReportWeekLabel } from "@/components/reports/report-week";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { formatStatementDollars } from "@/lib/reports/format";
import { tryDollarStringToCents } from "@/lib/money/cents";
import type { TolsonWeekBalance } from "@/lib/legacy/tolson-payments";

const field = "h-10 rounded-md border border-[var(--color-border)] px-3 text-sm";

export function TolsonPayments({ balance }: { balance: TolsonWeekBalance }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [paidOn, setPaidOn] = useState(balance.weekStart);
  const [week, setWeek] = useState(balance.weekStart);
  const [dollars, setDollars] = useState("");
  const [note, setNote] = useState("");

  function openWeek(next: string) {
    router.push(`/operating-expenses?week=${next}`);
  }

  function onSave(event: React.FormEvent) {
    event.preventDefault();
    const parsed = tryDollarStringToCents(dollars);
    if (!parsed.ok) {
      toast(parsed.error, "error");
      return;
    }
    let monday = week;
    try {
      monday = weekBoundsForDate(week).start;
    } catch {
      toast("Week covered must be a date.", "error");
      return;
    }
    startTransition(async () => {
      const result = await saveTolsonPaymentAction({
        paidOn,
        weekStart: monday,
        amountCents: parsed.cents,
        note,
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Payment saved", "success");
      setDollars("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-md border border-[var(--color-border)] p-4">
      <div>
        <h2 className="text-lg font-semibold">Paid to Tolson Black Hawk</h2>
        <ReportWeekLabel weekStart={balance.weekStart} />
      </div>
      {balance.error ? <p className="text-sm text-[var(--color-danger)]">{balance.error}</p> : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-[var(--color-fg-muted)]">Owed</dt>
          <dd className="text-xl font-semibold">{formatStatementDollars(balance.owedCents)}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--color-fg-muted)]">Paid</dt>
          <dd className="text-xl font-semibold">{formatStatementDollars(balance.paidCents)}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--color-fg-muted)]">Balance</dt>
          <dd className="text-xl font-semibold">{formatStatementDollars(balance.balanceCents)}</dd>
        </div>
      </dl>
      {balance.payments.length === 0 ? (
        <p className="text-sm">No payments recorded for this week.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {balance.payments.map((row) => (
            <li key={row.id}>
              {row.paid_on} {formatStatementDollars(row.amount_cents)}
              {row.note ? ` ${row.note}` : ""}
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-end gap-2" onSubmit={onSave}>
        <label className="text-sm">
          <span className="mb-1 block">Date</span>
          <input className={field} type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Week covered</span>
          <input
            className={field}
            type="date"
            value={week}
            onChange={(event) => {
              setWeek(event.target.value);
              if (event.target.value) {
                try {
                  openWeek(weekBoundsForDate(event.target.value).start);
                } catch {
                  return;
                }
              }
            }}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Amount</span>
          <input className={field} value={dollars} placeholder="0.00" onChange={(event) => setDollars(event.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Note</span>
          <input className={field} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button type="submit" variant="vivid" disabled={pending || !balance.ready}>
          {pending ? "Saving..." : "Save payment"}
        </Button>
      </form>
    </section>
  );
}
