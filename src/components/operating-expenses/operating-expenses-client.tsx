"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createOperatingExpenseAction,
  deleteOperatingExpenseAction,
} from "@/app/operating-expenses/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { SidePanel } from "@/components/ui/side-panel";
import { useToast } from "@/components/ui/toast";
import { assertIsoDate } from "@/lib/fee-engine";
import { centsToDollarString, tryDollarStringToCents } from "@/lib/money/cents";
import type { OperatingExpenseList } from "@/lib/operating-expenses/queries";

const fieldClass =
  "h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm";

type Props = {
  list: OperatingExpenseList;
};

export function OperatingExpensesClient({ list }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [panelOpen, setPanelOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState("");
  const [dollars, setDollars] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const totalCents = useMemo(
    () => list.rows.reduce((sum, row) => sum + row.amount_cents, 0),
    [list.rows],
  );

  function openPanel() {
    setExpenseDate("");
    setCategory("");
    setDollars("");
    setNote("");
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
    const trimmed = category.trim();
    if (!trimmed) {
      setFormError("Category is required.");
      return;
    }
    if (trimmed.length > 80) {
      setFormError("Category must be 80 characters or fewer.");
      return;
    }
    const parsed = tryDollarStringToCents(dollars);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await createOperatingExpenseAction({
        expenseDate,
        category: trimmed,
        amountCents: parsed.cents,
        note,
      });
      if (!result.ok) {
        setFormError(result.error);
        toast(result.error, "error");
        return;
      }
      toast("Operating expense saved", "success");
      setPanelOpen(false);
      router.refresh();
    });
  }

  function onDelete(id: string, label: string) {
    startTransition(async () => {
      const ok = await confirm({
        title: "Delete operating expense?",
        message: `Remove ${label}. This does not change truck fixed expenses.`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      const result = await deleteOperatingExpenseAction(id);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Operating expense deleted", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">
          Manual costs for the management company. Enter a date, a category, and an amount.
          These rows are not truck fixed expenses and this page is not a profit and loss statement.
        </p>
        <Button onClick={openPanel} disabled={!list.ready || pending}>
          Add expense
        </Button>
      </div>

      {!list.ready ? (
        <p className="text-sm text-[var(--color-fg-muted)]" role="status">
          {list.error ??
            "Operating expenses need the v0.0.0.6 migration. It has not been applied yet."}
        </p>
      ) : null}

      {!list.ready ? null : list.rows.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No operating expenses yet.</p>
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
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() => onDelete(row.id, `${row.category} on ${row.expense_date}`)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--color-border)] font-medium">
                <td className="px-4 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-2">${centsToDollarString(totalCents)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <SidePanel open={panelOpen} title="Add operating expense" onClose={() => setPanelOpen(false)}>
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
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Category</span>
            <input
              required
              maxLength={80}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={fieldClass}
            />
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
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={fieldClass}
            />
          </label>
          {formError ? (
            <p className="text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save expense"}
          </Button>
        </form>
      </SidePanel>
    </div>
  );
}
