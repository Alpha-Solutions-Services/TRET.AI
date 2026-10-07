"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmQuickbooksFileAction,
  exportQuickbooksJournalAction,
  previewQuickbooksFileAction,
  saveQuickbooksFileAccountsAction,
} from "@/app/integrations/file-actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { LEGACY_COMPANY_CATEGORIES } from "@/lib/legacy/expenses";
import { centsToDollarString } from "@/lib/money/cents";
import type { FilePreviewRow } from "@/lib/quickbooks/file-import";
import type { FileAccountNames } from "@/lib/quickbooks/file-journal";
import type { FileQuickbooksHome } from "@/lib/quickbooks/file-home";

const fieldClass = "h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm";

function money(cents: number): string {
  if (cents < 0) return `-$${centsToDollarString(-cents)}`;
  return `$${centsToDollarString(cents)}`;
}

export function FileQuickbooksClient({ home, isAdmin }: { home: FileQuickbooksHome; isAdmin: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accounts, setAccounts] = useState<FileAccountNames>(home.accounts);
  const [week, setWeek] = useState(() => weekBoundsForDate(new Date().toISOString().slice(0, 10)).start);
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<FilePreviewRow[] | null>(null);
  const [choices, setChoices] = useState<Record<string, { include: boolean; category: string; remember: boolean }>>({});

  if (!isAdmin) {
    return (
      <section className="material rounded-xl border border-[var(--color-border)] px-5 py-5">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="mt-3 text-sm" role="status">
          Only an admin can export or import QuickBooks files.
        </p>
      </section>
    );
  }

  function setAccount(key: keyof FileAccountNames, value: string) {
    setAccounts((current) => ({ ...current, [key]: value }));
  }

  function saveAccounts() {
    startTransition(async () => {
      const result = await saveQuickbooksFileAccountsAction(accounts);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(result.message, "success");
      router.refresh();
    });
  }

  function downloadJournal() {
    startTransition(async () => {
      const result = await exportQuickbooksJournalAction(week);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast("Journal CSV downloaded.", "success");
    });
  }

  function previewFile() {
    startTransition(async () => {
      const result = await previewQuickbooksFileAction({ csvText });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      const next: Record<string, { include: boolean; category: string; remember: boolean }> = {};
      for (const row of result.rows) {
        next[row.hash] = {
          include: !row.skipReason && !row.alreadySaved && Boolean(row.category),
          category: row.category ?? "",
          remember: Boolean(row.vendorName || row.accountName),
        };
      }
      setRows(result.rows);
      setChoices(next);
    });
  }

  function confirmFile() {
    if (!rows) return;
    const selections = rows.flatMap((row) => {
      const choice = choices[row.hash];
      if (!choice?.include || row.skipReason || row.alreadySaved) return [];
      const remember = choice.remember ? (row.vendorName ? "vendor" : "account") : "none";
      return [{ hash: row.hash, category: choice.category, remember }] as const;
    });
    startTransition(async () => {
      const result = await confirmQuickbooksFileAction({
        csvText,
        selections: selections.map((row) => ({ ...row })),
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(result.message, "success");
      setRows(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[1.75rem]">Integrations</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Move a week between TRET and QuickBooks Online with CSV files. Nothing is sent to Intuit from this page.
        </p>
      </div>

      <section className="material space-y-4 rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-lg font-medium">Account names</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Save these once. Use the account names from your QuickBooks chart. A subaccount is written as Parent: Sub.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <AccountField label="Fee income debit" value={accounts.feeDebitName} onChange={(value) => setAccount("feeDebitName", value)} />
          <AccountField label="Fee income credit" value={accounts.feeCreditName} onChange={(value) => setAccount("feeCreditName", value)} />
          <AccountField label="Tolson payable debit" value={accounts.tolsonDebitName} onChange={(value) => setAccount("tolsonDebitName", value)} />
          <AccountField label="Tolson payable credit" value={accounts.tolsonCreditName} onChange={(value) => setAccount("tolsonCreditName", value)} />
        </div>
        <Button type="button" variant="secondary" disabled={pending} onClick={saveAccounts}>
          Save account names
        </Button>
      </section>

      <section className="material space-y-4 rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-lg font-medium">Export a journal entry</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Download one CSV for the chosen week. It contains the management fee income and the Tolson payable.
        </p>
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Week</span>
          <input type="date" value={week} onChange={(event) => setWeek(event.target.value)} className={fieldClass} />
        </label>
        <Button type="button" disabled={pending} onClick={downloadJournal}>
          Download journal CSV
        </Button>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--color-fg-muted)]">
          <li>In QuickBooks Online, open the gear menu.</li>
          <li>Choose Import data, then Journal entries.</li>
          <li>Upload the CSV from this page.</li>
          <li>Map Journal No., Journal Date, Account Name, Journal/Description, Debits, and Credits.</li>
          <li>Turn off account numbers if the file uses names.</li>
          <li>A payable line may need a vendor name in QuickBooks after the import.</li>
        </ol>
      </section>

      <section className="material space-y-4 rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-lg font-medium">Import expenses</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Export a Transaction List or Expenses report from QuickBooks Online, then upload it here. Rows are
          saved only after you confirm. A row that was saved before is skipped.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">QuickBooks CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setCsvText("");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setCsvText(typeof reader.result === "string" ? reader.result : "");
              reader.readAsText(file);
            }}
            className="block text-sm"
          />
        </label>
        <Button type="button" variant="secondary" disabled={pending || !csvText} onClick={previewFile}>
          Preview rows
        </Button>
        {rows ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--color-border)] text-[var(--color-fg-muted)]">
                  <tr>
                    <th className="px-2 py-2 font-medium">Save</th>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Account</th>
                    <th className="px-2 py-2 font-medium">Amount</th>
                    <th className="px-2 py-2 font-medium">Category</th>
                    <th className="px-2 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.hash} className="border-b border-[var(--color-border)]">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={choices[row.hash]?.include ?? false}
                          disabled={Boolean(row.skipReason) || row.alreadySaved}
                          onChange={(event) =>
                            setChoices((current) => ({
                              ...current,
                              [row.hash]: {
                                include: event.target.checked,
                                category: current[row.hash]?.category ?? "",
                                remember: current[row.hash]?.remember ?? false,
                              },
                            }))
                          }
                          aria-label={`Save ${row.vendorName || row.accountName || "row"}`}
                        />
                      </td>
                      <td className="px-2 py-2">{row.date || "Blank"}</td>
                      <td className="px-2 py-2">{row.vendorName || "Blank"}</td>
                      <td className="px-2 py-2">{row.accountName || "Blank"}</td>
                      <td className="px-2 py-2">{money(row.amountCents)}</td>
                      <td className="px-2 py-2">
                        <select
                          value={choices[row.hash]?.category ?? ""}
                          disabled={Boolean(row.skipReason) || row.alreadySaved}
                          onChange={(event) =>
                            setChoices((current) => ({
                              ...current,
                              [row.hash]: {
                                include: current[row.hash]?.include ?? false,
                                category: event.target.value,
                                remember: current[row.hash]?.remember ?? false,
                              },
                            }))
                          }
                          className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-2"
                        >
                          <option value="">Choose</option>
                          {LEGACY_COMPANY_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-[var(--color-fg-muted)]">
                        {row.alreadySaved ? "Already saved" : row.skipReason ?? row.memo}
                        {!row.skipReason && !row.alreadySaved ? (
                          <label className="mt-1 flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={choices[row.hash]?.remember ?? false}
                              onChange={(event) =>
                                setChoices((current) => ({
                                  ...current,
                                  [row.hash]: {
                                    include: current[row.hash]?.include ?? false,
                                    category: current[row.hash]?.category ?? "",
                                    remember: event.target.checked,
                                  },
                                }))
                              }
                            />
                            Remember this {row.vendorName ? "vendor" : "account"}
                          </label>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" disabled={pending} onClick={confirmFile}>
              Save selected expenses
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AccountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[var(--color-fg-muted)]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </label>
  );
}
