"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createOperatingExpenseAction,
  deleteOperatingExpenseAction,
  updateOperatingExpenseAction,
} from "@/app/operating-expenses/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { SidePanel } from "@/components/ui/side-panel";
import { useToast } from "@/components/ui/toast";
import { assertIsoDate } from "@/lib/fee-engine";
import { LEGACY_COMPANY_CATEGORIES } from "@/lib/legacy/expenses";
import { centsToDollarString, tryDollarStringToCents } from "@/lib/money/cents";
import type { OperatingExpenseList, OperatingExpenseRow } from "@/lib/operating-expenses/queries";

const fieldClass =
  "h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm";

type Props = {
  list: OperatingExpenseList;
  month: string;
};

export function OperatingExpensesClient({ list, month }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState("");
  const [dollars, setDollars] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setExpenseDate(`${month}-01`);
    setCategory("");
    setDollars("");
    setNote("");
    setFormError(null);
    setPanelOpen(true);
  }

  function openEdit(row: OperatingExpenseRow) {
    setEditingId(row.id);
    setExpenseDate(row.expense_date);
    setCategory(row.category);
    setDollars(centsToDollarString(row.amount_cents));
    setNote(row.note ?? "");
    setFormError(null);
    setPanelOpen(true);
  }

  function onSave(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    try {
      assertIsoDate(expenseDate, "Date");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Date is required.");
      return;
    }
    if (!category) {
      setFormError("Choose a category from the list.");
      return;
    }
    const parsed = tryDollarStringToCents(dollars);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    startTransition(async () => {
      const payload = {
        expenseDate,
        category,
        amountCents: parsed.cents,
        note,
      };
      const result = editingId
        ? await updateOperatingExpenseAction({ id: editingId, ...payload })
        : await createOperatingExpenseAction(payload);
      if (!result.ok) {
        setFormError(result.error);
        toast(result.error, "error");
        return;
      }
      toast(editingId ? "Expense updated" : "Expense saved", "success");
      setPanelOpen(false);
      router.refresh();
    });
  }

  function onDelete(id: string, label: string) {
    startTransition(async () => {
      const ok = await confirm({
        title: "Delete Legacy expense?",
        message: `Remove ${label}. This does not change truck sheet outs.`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      const result = await deleteOperatingExpenseAction(id);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Expense deleted", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Legacy expenses</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-fg-muted)]">
            Monthly costs for Legacy Inc Global. Pick a month, then add a date, a category, an amount, and a
            note. These rows are not truck sheet outs and they are not the management fee on a load.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!list.ready || pending}>
          Add expense
        </Button>
      </div>

      <label className="text-sm">
        <span className="mb-1 block text-[var(--color-fg-muted)]">Month</span>
        <input
          type="month"
          value={month}
          onChange={(event) => {
            if (!event.target.value) return;
            router.push(`/operating-expenses?month=${event.target.value}`);
          }}
          className="h-10 rounded-md border border-[var(--color-border)] bg-white px-3"
        />
      </label>

      {!list.ready ? (
        <p className="text-sm text-[var(--color-fg-muted)]" role="status">
          {list.error ?? "Legacy expenses need the v0.0.0.6 migration. It has not been applied yet."}
        </p>
      ) : null}

      {!list.ready ? null : list.rows.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No Legacy expenses for {month}.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Note</th>
                <th className="px-4 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2">{row.expense_date}</td>
                  <td className="px-4 py-2">{row.category}</td>
                  <td className="px-4 py-2">${centsToDollarString(row.amount_cents)}</td>
                  <td className="px-4 py-2">{row.note ?? ""}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" disabled={pending} onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        disabled={pending}
                        onClick={() => onDelete(row.id, `${row.category} on ${row.expense_date}`)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--color-border)] font-medium">
                <td className="px-4 py-2" colSpan={2}>
                  {month} total
                </td>
                <td className="px-4 py-2">${centsToDollarString(list.totalCents)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <SidePanel
        open={panelOpen}
        title={editingId ? "Edit Legacy expense" : "Add Legacy expense"}
        onClose={() => setPanelOpen(false)}
      >
        <form className="space-y-4" onSubmit={onSave}>
          <label className="block text-sm">
            <span className="mb-1 block">Date</span>
            <input
              type="date"
              required
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              className={fieldClass}
            />
            <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
              The month of this date is the month the expense belongs to.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Category</span>
            <select
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={fieldClass}
            >
              <option value="">Choose a category</option>
              {LEGACY_COMPANY_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Amount (dollars)</span>
            <input
              required
              inputMode="decimal"
              value={dollars}
              onChange={(event) => setDollars(event.target.value)}
              className={fieldClass}
              placeholder="0.00"
            />
            <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
              Stored as cents. 20.00 is 2000 cents.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Note (optional)</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} className={fieldClass} />
          </label>
          {formError ? (
            <p className="text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving..." : "Save expense"}
          </Button>
        </form>
      </SidePanel>
    </div>
  );
}
