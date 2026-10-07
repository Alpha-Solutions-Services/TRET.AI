"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmQuickbooksImportAction,
  confirmQuickbooksPushAction,
  deleteQuickbooksMappingAction,
  disconnectQuickbooksAction,
  loadQuickbooksAccountsAction,
  previewQuickbooksImportAction,
  previewQuickbooksPushAction,
  saveQuickbooksAccountsAction,
} from "@/app/integrations/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LEGACY_COMPANY_CATEGORIES } from "@/lib/legacy/expenses";
import { centsToDollarString } from "@/lib/money/cents";
import type { PostingAccounts } from "@/lib/quickbooks/journal";
import type { RememberChoice } from "@/lib/quickbooks/map";
import type { IntegrationsHome, PushPreview } from "@/lib/quickbooks/live";
import type { PreviewRow } from "@/lib/quickbooks/map";
import type { QboAccount } from "@/lib/quickbooks/parse";

const NOTICES: Record<string, string> = {
  connected: "QuickBooks is connected for the Legacy Inc company.",
  not_setup: "QuickBooks not set up yet.",
  not_admin: "Only an admin can connect QuickBooks.",
  needs_migration: "QuickBooks storage is not ready yet. Apply the database update, then reload this page.",
  denied: "QuickBooks did not finish sign in. Connect again.",
  expired: "That sign in session expired. Connect again.",
  failed: "QuickBooks did not finish sign in. Connect again.",
};

const fieldClass =
  "h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm";

function money(cents: number): string {
  return `$${centsToDollarString(cents)}`;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(): string {
  const today = isoToday();
  return `${today.slice(0, 7)}-01`;
}

type RowChoice = {
  include: boolean;
  category: string;
  remember: RememberChoice;
};

function defaultRemember(row: PreviewRow): RememberChoice {
  if (row.vendorId) return "vendor";
  if (row.accountId) return "account";
  return "none";
}

export function IntegrationsClient({ home, notice }: { home: IntegrationsHome; notice: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(isoToday);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [choices, setChoices] = useState<Record<string, RowChoice>>({});
  const [week, setWeek] = useState(isoToday);
  const [push, setPush] = useState<PushPreview | null>(null);
  const [accounts, setAccounts] = useState<PostingAccounts>(home.accounts);
  const [qboAccounts, setQboAccounts] = useState<QboAccount[]>([]);
  const noticeText = notice ? NOTICES[notice] ?? null : null;

  const accountOptions = useMemo(() => {
    const options = [...qboAccounts];
    const seen = new Set(options.map((account) => account.id));
    const saved = [
      [accounts.feeDebitAccountId, accounts.feeDebitAccountName],
      [accounts.feeCreditAccountId, accounts.feeCreditAccountName],
      [accounts.tolsonDebitAccountId, accounts.tolsonDebitAccountName],
      [accounts.tolsonCreditAccountId, accounts.tolsonCreditAccountName],
    ] as const;
    for (const [id, name] of saved) {
      if (id && !seen.has(id)) options.push({ id, name: name || id, accountType: "Saved" });
    }
    return options;
  }, [accounts, qboAccounts]);

  function setChoice(sourceId: string, patch: Partial<RowChoice>, row: PreviewRow) {
    setChoices((current) => {
      const existing = current[sourceId] ?? {
        include: !row.skipReason && !row.alreadySaved && Boolean(row.category),
        category: row.category ?? "",
        remember: defaultRemember(row),
      };
      return { ...current, [sourceId]: { ...existing, ...patch } };
    });
  }

  function previewImport() {
    startTransition(async () => {
      const result = await previewQuickbooksImportAction({ from, to });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      const next: Record<string, RowChoice> = {};
      for (const row of result.rows) {
        next[row.sourceId] = {
          include: !row.skipReason && !row.alreadySaved && Boolean(row.category),
          category: row.category ?? "",
          remember: defaultRemember(row),
        };
      }
      setRows(result.rows);
      setTruncated(result.truncated);
      setChoices(next);
    });
  }

  function confirmImport() {
    if (!rows) return;
    const selections = rows.flatMap((row) => {
      const choice = choices[row.sourceId];
      if (!choice?.include || row.skipReason || row.alreadySaved) return [];
      return [{ sourceId: row.sourceId, category: choice.category, remember: choice.remember }];
    });
    startTransition(async () => {
      const result = await confirmQuickbooksImportAction({ from, to, selections });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(result.message, "success");
      setRows(null);
      router.refresh();
    });
  }

  function previewPush() {
    startTransition(async () => {
      const result = await previewQuickbooksPushAction(week);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setPush(result.preview);
    });
  }

  function confirmPush() {
    startTransition(async () => {
      const result = await confirmQuickbooksPushAction(week);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(result.message, "success");
      setPush(null);
      router.refresh();
    });
  }

  if (!home.isAdmin) {
    return (
      <section className="material rounded-xl border border-[var(--color-border)] px-5 py-5">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="mt-3 text-sm" role="status">
          Only an admin can connect QuickBooks.
        </p>
      </section>
    );
  }

  if (!home.setupReady) {
    return (
      <section className="material space-y-3 rounded-xl border border-[var(--color-border)] px-5 py-5">
        <h1 className="text-2xl font-semibold">QuickBooks not set up yet</h1>
        <p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">
          Add the Intuit keys on the server, then connect the Legacy Inc company here. This page stays quiet
          until those keys exist.
        </p>
        {home.missingEnv.length > 0 ? (
          <p className="text-sm">Missing: {home.missingEnv.join(", ")}</p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          QuickBooks Online for the Legacy Inc books. One company. Import expenses after a preview. Post a
          week only after you confirm. Nothing posts on its own.
        </p>
      </div>

      {noticeText ? (
        <p className="material rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" role="status">
          {noticeText}
        </p>
      ) : null}
      {home.loadError ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {home.loadError}
        </p>
      ) : null}
      {!home.migrationReady ? (
        <p className="material rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" role="status">
          QuickBooks storage is not ready yet. Apply the database update, then reload this page.
        </p>
      ) : null}

      <section className="material space-y-3 rounded-xl border border-[var(--color-border)] px-5 py-5">
        <h2 className="text-base font-medium">Connection</h2>
        {home.connection?.status === "connected" && home.connection.realmId ? (
          <p className="text-sm">
            Connected to company {home.connection.realmId}
            {home.connection.environment ? ` (${home.connection.environment})` : ""}. This app keeps one
            company.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-fg-muted)]">
            Not connected. Connect the Legacy Inc QuickBooks company. This app keeps one company.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/quickbooks/oauth/start"
            className="pressable inline-flex h-10 items-center rounded-lg bg-[var(--color-accent)] px-4 text-sm font-medium text-[var(--color-on-accent)] no-underline"
          >
            Connect QuickBooks
          </a>
          {home.migrationReady && home.connection?.status === "connected" ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await disconnectQuickbooksAction();
                  if (!result.ok) {
                    toast(result.error, "error");
                    return;
                  }
                  toast(result.message, "success");
                  router.refresh();
                });
              }}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </section>

      {home.migrationReady && home.connection?.status === "connected" ? (
        <>
          <section className="material space-y-4 rounded-xl border border-[var(--color-border)] px-5 py-5">
            <h2 className="text-base font-medium">Import expenses</h2>
            <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
              Pull Purchase and Bill rows for a date range. Map a vendor or an account to a portal category.
              Preview the rows, then save. Nothing is written to portal expenses until you confirm. A
              QuickBooks id that is already saved is skipped.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-[var(--color-fg-muted)]">From</span>
                <input className={fieldClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-[var(--color-fg-muted)]">To</span>
                <input className={fieldClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
              <Button disabled={pending} onClick={previewImport}>
                Preview import
              </Button>
            </div>
            {truncated ? (
              <p className="text-sm" role="status">
                This range has more rows than the preview loaded. Narrow the dates and preview again.
              </p>
            ) : null}
            {rows ? (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[var(--color-border)] text-[var(--color-fg-muted)]">
                      <tr>
                        <th className="px-2 py-2 font-medium">Save</th>
                        <th className="px-2 py-2 font-medium">Date</th>
                        <th className="px-2 py-2 font-medium">Vendor</th>
                        <th className="px-2 py-2 font-medium">Account</th>
                        <th className="px-2 py-2 font-medium">Amount</th>
                        <th className="px-2 py-2 font-medium">Category</th>
                        <th className="px-2 py-2 font-medium">Remember</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td className="px-2 py-3 text-[var(--color-fg-muted)]" colSpan={7}>
                            No Purchase or Bill rows in that range.
                          </td>
                        </tr>
                      ) : (
                        rows.map((row) => {
                          const choice = choices[row.sourceId] ?? {
                            include: false,
                            category: row.category ?? "",
                            remember: defaultRemember(row),
                          };
                          return (
                            <tr key={row.sourceId} className="border-b border-[var(--color-border)]">
                              <td className="px-2 py-2">
                                {row.alreadySaved ? (
                                  "Already saved"
                                ) : row.skipReason ? (
                                  row.skipReason
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={choice.include}
                                    aria-label={`Save ${row.vendorName}`}
                                    onChange={(event) => setChoice(row.sourceId, { include: event.target.checked }, row)}
                                  />
                                )}
                              </td>
                              <td className="px-2 py-2">{row.txnDate}</td>
                              <td className="px-2 py-2">{row.vendorName}</td>
                              <td className="px-2 py-2">{row.accountName}</td>
                              <td className="num px-2 py-2">{money(row.amountCents)}</td>
                              <td className="px-2 py-2">
                                <select
                                  className={fieldClass}
                                  value={choice.category}
                                  disabled={Boolean(row.skipReason) || row.alreadySaved}
                                  onChange={(event) => setChoice(row.sourceId, { category: event.target.value }, row)}
                                >
                                  <option value="">Choose a category</option>
                                  {LEGACY_COMPANY_CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  className={fieldClass}
                                  value={choice.remember}
                                  disabled={Boolean(row.skipReason) || row.alreadySaved}
                                  onChange={(event) =>
                                    setChoice(row.sourceId, { remember: event.target.value as RememberChoice }, row)
                                  }
                                >
                                  <option value="vendor" disabled={!row.vendorId}>
                                    Vendor
                                  </option>
                                  <option value="account" disabled={!row.accountId}>
                                    Account
                                  </option>
                                  <option value="none">Do not save a map</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-[var(--color-fg-muted)]">
                  Amounts are read again from QuickBooks when you confirm.
                </p>
                <Button disabled={pending || rows.length === 0} onClick={confirmImport}>
                  Save to portal expenses
                </Button>
              </>
            ) : null}
          </section>

          <section className="material space-y-4 rounded-xl border border-[var(--color-border)] px-5 py-5">
            <h2 className="text-base font-medium">Saved mapping</h2>
            {home.mappings.length === 0 ? (
              <p className="text-sm text-[var(--color-fg-muted)]">No saved vendor or account mapping yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {home.mappings.map((mapping) => (
                  <li key={mapping.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {mapping.sourceKind === "vendor" ? "Vendor" : "Account"} {mapping.sourceName} to{" "}
                      {mapping.category}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await deleteQuickbooksMappingAction(mapping.id);
                          if (!result.ok) {
                            toast(result.error, "error");
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="material space-y-4 rounded-xl border border-[var(--color-border)] px-5 py-5">
            <h2 className="text-base font-medium">Posting accounts</h2>
            <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
              Pick these once. Management fee income is credited to the income account and debited to the offset
              account. Tolson payable is credited to the payable account and debited to the offset account.
              Saving accounts does not post anything.
            </p>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await loadQuickbooksAccountsAction();
                  if (!result.ok) {
                    toast(result.error, "error");
                    return;
                  }
                  setQboAccounts(result.accounts);
                  toast("Accounts loaded.", "success");
                });
              }}
            >
              Load accounts
            </Button>
            <div className="grid gap-3 md:grid-cols-2">
              <AccountSelect
                label="Management fee offset (debit)"
                value={accounts.feeDebitAccountId}
                options={accountOptions}
                onChange={(id, name) => setAccounts({ ...accounts, feeDebitAccountId: id, feeDebitAccountName: name })}
              />
              <AccountSelect
                label="Management fee income (credit)"
                value={accounts.feeCreditAccountId}
                options={accountOptions}
                onChange={(id, name) =>
                  setAccounts({ ...accounts, feeCreditAccountId: id, feeCreditAccountName: name })
                }
              />
              <AccountSelect
                label="Tolson offset (debit)"
                value={accounts.tolsonDebitAccountId}
                options={accountOptions}
                onChange={(id, name) =>
                  setAccounts({ ...accounts, tolsonDebitAccountId: id, tolsonDebitAccountName: name })
                }
              />
              <AccountSelect
                label="Tolson payable (credit)"
                value={accounts.tolsonCreditAccountId}
                options={accountOptions}
                onChange={(id, name) =>
                  setAccounts({ ...accounts, tolsonCreditAccountId: id, tolsonCreditAccountName: name })
                }
              />
            </div>
            <Button
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await saveQuickbooksAccountsAction(accounts);
                  if (!result.ok) {
                    toast(result.error, "error");
                    return;
                  }
                  toast(result.message, "success");
                  router.refresh();
                });
              }}
            >
              Save accounts
            </Button>
          </section>

          <section className="material space-y-4 rounded-xl border border-[var(--color-border)] px-5 py-5">
            <h2 className="text-base font-medium">Post a week</h2>
            <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
              Preview the weekly management fee income and the Tolson payable, then post one journal entry.
              Nothing posts until you confirm. Confirm reads the week again before it posts.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-[var(--color-fg-muted)]">Week</span>
                <input className={fieldClass} type="date" value={week} onChange={(event) => setWeek(event.target.value)} />
              </label>
              <Button disabled={pending} onClick={previewPush}>
                Preview post
              </Button>
            </div>
            {push ? (
              <div className="space-y-3 text-sm">
                <p>
                  Week of {push.weekStart} through {push.weekEnd}. Income {money(push.incomeCents)}. Tolson
                  payable {money(push.tolsonCents)}.
                </p>
                {push.alreadyPosted ? (
                  <p role="status">This week was posted before. Confirming sends another journal entry.</p>
                ) : null}
                {push.blocked ? <p role="status">{push.blocked}</p> : null}
                {push.lines.length > 0 ? (
                  <ul className="space-y-1">
                    {push.lines.map((line, index) => (
                      <li key={`${line.postingType}-${line.accountName}-${index}`} className="num">
                        {line.postingType} {line.accountName} {money(line.amountCents)}. {line.description}.
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button disabled={pending || Boolean(push.blocked)} onClick={confirmPush}>
                  Post journal entry
                </Button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {home.migrationReady ? (
        <section className="material space-y-3 rounded-xl border border-[var(--color-border)] px-5 py-5">
          <h2 className="text-base font-medium">Push history</h2>
          {home.history.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-muted)]">No posts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--color-border)] text-[var(--color-fg-muted)]">
                  <tr>
                    <th className="px-2 py-2 font-medium">Week</th>
                    <th className="px-2 py-2 font-medium">Income</th>
                    <th className="px-2 py-2 font-medium">Tolson payable</th>
                    <th className="px-2 py-2 font-medium">QuickBooks id</th>
                    <th className="px-2 py-2 font-medium">Posted by</th>
                    <th className="px-2 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {home.history.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--color-border)]">
                      <td className="px-2 py-2">{row.weekStart}</td>
                      <td className="num px-2 py-2">{money(row.incomeCents)}</td>
                      <td className="num px-2 py-2">{money(row.tolsonCents)}</td>
                      <td className="px-2 py-2">{row.qboId}</td>
                      <td className="px-2 py-2">{row.postedBy}</td>
                      <td className="px-2 py-2">{row.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function AccountSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: QboAccount[];
  onChange: (id: string, name: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-[var(--color-fg-muted)]">{label}</span>
      <select
        className={`${fieldClass} w-full`}
        value={value}
        onChange={(event) => {
          const account = options.find((item) => item.id === event.target.value);
          onChange(event.target.value, account?.name ?? "");
        }}
      >
        <option value="">Choose an account</option>
        {options.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name} ({account.accountType})
          </option>
        ))}
      </select>
    </label>
  );
}
