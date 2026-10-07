"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createFixedExpenseVersionAction,
  deleteFixedExpenseOverrideAction,
  deleteLatestFixedExpenseVersionAction,
  upsertFixedExpenseOverrideAction,
} from "@/app/trucks/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { SidePanel } from "@/components/ui/side-panel";
import { useToast } from "@/components/ui/toast";
import { mondayDateError, weekBoundsForDate } from "@/lib/fee-engine";
import {
  CHARGED_TO_VALUES,
  FIXED_EXPENSE_KINDS,
  FIXED_EXPENSE_LABELS,
  chargedToLabel,
  type FixedExpenseKind,
} from "@/lib/fixed-expenses/kinds";
import { lookupWeeklyFixedExpense } from "@/lib/fixed-expenses/lookup";
import type { FixedExpenseBundle } from "@/lib/fixed-expenses/queries";
import { centsToDollarString, tryDollarStringToCents } from "@/lib/money/cents";

const fieldClass =
  "h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm";

type Props = {
  truckId: string;
  bundle: FixedExpenseBundle;
  canDeleteLatest: boolean;
};

function todayMonday(): string {
  return weekBoundsForDate(new Date().toISOString().slice(0, 10)).start;
}

export function FixedExpensesPanel({ truckId, bundle, canDeleteLatest }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [versionOpen, setVersionOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [kind, setKind] = useState<FixedExpenseKind>("ELD_FEE");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [weeklyDollars, setWeeklyDollars] = useState("");
  const [chargedTo, setChargedTo] = useState<"owner" | "management">("owner");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [overrideKind, setOverrideKind] = useState<FixedExpenseKind>("ELD_FEE");
  const [weekStart, setWeekStart] = useState("");
  const [overrideDollars, setOverrideDollars] = useState("");
  const [overrideChargedTo, setOverrideChargedTo] = useState<"owner" | "management">("owner");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [lookupWeek, setLookupWeek] = useState(todayMonday);

  const groups = useMemo(
    () =>
      FIXED_EXPENSE_KINDS.map((expenseKind) => ({
        kind: expenseKind,
        rows: bundle.expenses.filter((row) => row.kind === expenseKind),
      })).filter((group) => group.rows.length > 0),
    [bundle.expenses],
  );

  const lookupRows = useMemo(() => {
    const mondayError = mondayDateError(lookupWeek, "Week start");
    if (mondayError) return { error: mondayError, rows: [] as Array<{ kind: FixedExpenseKind; text: string }> };
    const versions = bundle.expenses.map((row) => ({
      id: row.id,
      truckId: row.truck_id,
      kind: row.kind,
      weeklyAmountCents: row.weekly_amount_cents,
      chargedTo: row.charged_to,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
    }));
    const overrides = bundle.overrides.map((row) => ({
      id: row.id,
      truckId: row.truck_id,
      kind: row.kind,
      weekStart: row.week_start,
      amountCents: row.amount_cents,
      chargedTo: row.charged_to,
    }));
    const rows = FIXED_EXPENSE_KINDS.map((expenseKind) => {
      try {
        const resolved = lookupWeeklyFixedExpense({
          versions,
          overrides,
          truckId,
          kind: expenseKind,
          weekStart: lookupWeek,
        });
        const source = resolved.source === "override" ? "week override" : "version";
        return {
          kind: expenseKind,
          text: `$${centsToDollarString(resolved.amountCents)} · ${chargedToLabel(resolved.chargedTo)} · ${source}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not look up";
        if (message.startsWith("No fixed expense")) {
          return { kind: expenseKind, text: "—" };
        }
        return { kind: expenseKind, text: message };
      }
    });
    return { error: null, rows };
  }, [bundle.expenses, bundle.overrides, lookupWeek, truckId]);

  function openVersion() {
    setKind("ELD_FEE");
    setEffectiveFrom("");
    setWeeklyDollars("");
    setChargedTo("owner");
    setNote("");
    setFormError(null);
    setVersionOpen(true);
  }

  function openOverride() {
    setOverrideKind("ELD_FEE");
    setWeekStart("");
    setOverrideDollars("");
    setOverrideChargedTo("owner");
    setOverrideNote("");
    setOverrideError(null);
    setOverrideOpen(true);
  }

  function onSaveVersion(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const mondayError = mondayDateError(effectiveFrom, "Effective from");
    if (mondayError) {
      setFormError(mondayError);
      return;
    }
    const parsed = tryDollarStringToCents(weeklyDollars);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await createFixedExpenseVersionAction({
        truckId,
        kind,
        effectiveFrom,
        weeklyAmountCents: parsed.cents,
        chargedTo,
        note,
      });
      if (!result.ok) {
        setFormError(result.error);
        toast(result.error, "error");
        return;
      }
      toast("Expense version saved", "success");
      setVersionOpen(false);
      router.refresh();
    });
  }

  function onSaveOverride(event: React.FormEvent) {
    event.preventDefault();
    setOverrideError(null);
    const mondayError = mondayDateError(weekStart, "Week start");
    if (mondayError) {
      setOverrideError(mondayError);
      return;
    }
    const parsed = tryDollarStringToCents(overrideDollars);
    if (!parsed.ok) {
      setOverrideError(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await upsertFixedExpenseOverrideAction({
        truckId,
        kind: overrideKind,
        weekStart,
        amountCents: parsed.cents,
        chargedTo: overrideChargedTo,
        note: overrideNote,
      });
      if (!result.ok) {
        setOverrideError(result.error);
        toast(result.error, "error");
        return;
      }
      toast("Week override saved", "success");
      setOverrideOpen(false);
      router.refresh();
    });
  }

  function onDeleteLatest(expenseKind: FixedExpenseKind) {
    const label = FIXED_EXPENSE_LABELS[expenseKind];
    startTransition(async () => {
      const ok = await confirm({
        title: `Delete latest ${label} version?`,
        message:
          "This removes the newest version of this expense only. Older versions stay. You can only do this while no weekly statements exist.",
        confirmLabel: "Delete latest",
        danger: true,
      });
      if (!ok) return;
      const result = await deleteLatestFixedExpenseVersionAction(truckId, expenseKind);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Latest expense version deleted", "success");
      router.refresh();
    });
  }

  function onDeleteOverride(expenseKind: FixedExpenseKind, week: string) {
    startTransition(async () => {
      const ok = await confirm({
        title: "Delete week override?",
        message: `Remove the ${FIXED_EXPENSE_LABELS[expenseKind]} override for the week of ${week}.`,
        confirmLabel: "Delete override",
        danger: true,
      });
      if (!ok) return;
      const result = await deleteFixedExpenseOverrideAction({
        truckId,
        kind: expenseKind,
        weekStart: week,
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Week override deleted", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {!bundle.ready ? (
        <p className="text-sm text-[var(--color-fg-muted)]" role="status">
          {bundle.error ??
            "Fixed expenses need the v0.0.0.6 migration. It has not been applied yet."}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={openVersion} disabled={!bundle.ready || pending}>
          New expense version
        </Button>
        <Button variant="secondary" onClick={openOverride} disabled={!bundle.ready || pending}>
          Add week override
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Fixed expenses</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Weekly amount in dollars, stored as cents. A new version must start on a Monday and
          closes the previous open version for that kind.
        </p>
        {!bundle.ready ? null : groups.length === 0 ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            No fixed expenses yet. Add one to set a weekly amount for this truck.
          </p>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => (
              <li
                key={group.kind}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{FIXED_EXPENSE_LABELS[group.kind]}</h3>
                  {canDeleteLatest ? (
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() => onDeleteLatest(group.kind)}
                    >
                      Delete latest version
                    </Button>
                  ) : null}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-[var(--color-fg-muted)]">
                  {group.rows.map((row) => (
                    <li key={row.id}>
                      {row.effective_from}
                      {" → "}
                      {row.effective_to ?? "open"}
                      {" · $"}
                      {centsToDollarString(row.weekly_amount_cents)}
                      {" · "}
                      {chargedToLabel(row.charged_to)}
                      {row.note ? ` · ${row.note}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Week overrides</h2>
        {!bundle.ready ? null : bundle.overrides.length === 0 ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            No week overrides. An override replaces the version for that Monday–Sunday week only.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-field)]">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[var(--color-fg-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Week</th>
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Charged to</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                  <th className="px-4 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bundle.overrides.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-2">{row.week_start}</td>
                    <td className="px-4 py-2">{FIXED_EXPENSE_LABELS[row.kind]}</td>
                    <td className="px-4 py-2">${centsToDollarString(row.amount_cents)}</td>
                    <td className="px-4 py-2">{chargedToLabel(row.charged_to)}</td>
                    <td className="px-4 py-2">{row.note ?? ""}</td>
                    <td className="px-4 py-2">
                      <Button
                        variant="danger"
                        disabled={pending}
                        onClick={() => onDeleteOverride(row.kind, row.week_start)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {bundle.ready ? (
      <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] p-4">
        <h2 className="text-lg font-semibold">Week lookup</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Shows the amount that applies for a Monday. Does not save anything.
        </p>
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Week starting</span>
          <input
            type="date"
            value={lookupWeek}
            onChange={(event) => setLookupWeek(event.target.value)}
            className={fieldClass}
          />
        </label>
        {lookupRows.error ? (
          <p className="text-sm text-[var(--color-danger)]" role="alert">
            {lookupRows.error}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {lookupRows.rows.map((row) => (
              <li key={row.kind}>
                <span className="text-[var(--color-fg-muted)]">{FIXED_EXPENSE_LABELS[row.kind]}: </span>
                {row.text}
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}

      <SidePanel open={versionOpen} title="New expense version" onClose={() => setVersionOpen(false)}>
        <form className="space-y-4" onSubmit={onSaveVersion}>
          <label className="block text-sm">
            <span className="mb-1 block">Kind</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as FixedExpenseKind)}
              className={fieldClass}
            >
              {FIXED_EXPENSE_KINDS.map((expenseKind) => (
                <option key={expenseKind} value={expenseKind}>
                  {FIXED_EXPENSE_LABELS[expenseKind]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Effective from</span>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              className={fieldClass}
            />
            <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
              Must be a Monday.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Weekly amount (dollars)</span>
            <input
              required
              inputMode="decimal"
              value={weeklyDollars}
              onChange={(event) => setWeeklyDollars(event.target.value)}
              className={fieldClass}
              placeholder="0.00"
            />
            <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
              Stored as cents. 20.00 is 2000 cents.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Charged to</span>
            <select
              value={chargedTo}
              onChange={(event) => setChargedTo(event.target.value as "owner" | "management")}
              className={fieldClass}
            >
              {CHARGED_TO_VALUES.map((value) => (
                <option key={value} value={value}>
                  {chargedToLabel(value)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
              Defaults to owner.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Note (optional)</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={fieldClass}
            />
          </label>
          {formError ? (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save expense version"}
          </Button>
        </form>
      </SidePanel>

      <SidePanel open={overrideOpen} title="Week override" onClose={() => setOverrideOpen(false)}>
        <form className="space-y-4" onSubmit={onSaveOverride}>
          <label className="block text-sm">
            <span className="mb-1 block">Kind</span>
            <select
              value={overrideKind}
              onChange={(event) => setOverrideKind(event.target.value as FixedExpenseKind)}
              className={fieldClass}
            >
              {FIXED_EXPENSE_KINDS.map((expenseKind) => (
                <option key={expenseKind} value={expenseKind}>
                  {FIXED_EXPENSE_LABELS[expenseKind]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Week starting</span>
            <input
              type="date"
              required
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              className={fieldClass}
            />
            <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
              Must be a Monday. Replaces the version for that week only.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Amount (dollars)</span>
            <input
              required
              inputMode="decimal"
              value={overrideDollars}
              onChange={(event) => setOverrideDollars(event.target.value)}
              className={fieldClass}
              placeholder="0.00"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Charged to</span>
            <select
              value={overrideChargedTo}
              onChange={(event) =>
                setOverrideChargedTo(event.target.value as "owner" | "management")
              }
              className={fieldClass}
            >
              {CHARGED_TO_VALUES.map((value) => (
                <option key={value} value={value}>
                  {chargedToLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Note (optional)</span>
            <input
              value={overrideNote}
              onChange={(event) => setOverrideNote(event.target.value)}
              className={fieldClass}
            />
          </label>
          {overrideError ? (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {overrideError}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save week override"}
          </Button>
        </form>
      </SidePanel>
    </div>
  );
}
