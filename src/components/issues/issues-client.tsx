"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveIssueAction } from "@/app/issues/actions";
import { CopyableError } from "@/components/copyable-error";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { weekBoundsForDate } from "@/lib/fee-engine";
import {
  canResolveIssue,
  filterInbox,
  parseSeverityFilter,
  parseStatusFilter,
  type InboxRow,
  type IssueSeverityFilter,
  type IssueStatusFilter,
} from "@/lib/issues/inbox";
import { issueRuleLabel, presentIssue } from "@/lib/issues/present-issue";
import type { IssuesPageData } from "@/lib/issues/queries";

function IssueCell({ message, rule }: { message: string; rule: string }) {
  const presented = presentIssue(message, rule);
  const label = issueRuleLabel(rule);
  return (
    <div className="max-w-md">
      <CopyableError headline={presented.headline} detail={presented.detail} showDetail={false} />
      {label ? <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{label}</p> : null}
    </div>
  );
}

function shiftWeek(weekStart: string, delta: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return weekBoundsForDate(date.toISOString().slice(0, 10)).start;
}

export function IssuesClient({
  data,
  severity,
  status,
}: {
  data: IssuesPageData;
  severity: string | undefined;
  status: string | undefined;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const severityFilter = parseSeverityFilter(severity);
  const statusFilter = parseStatusFilter(status);
  const rows = filterInbox(data.rows, { severity: severityFilter, status: statusFilter });

  function openQuery(next: { week?: string; severity?: IssueSeverityFilter; status?: IssueStatusFilter }) {
    const week = next.week ?? data.weekStart;
    const nextSeverity = next.severity ?? severityFilter;
    const nextStatus = next.status ?? statusFilter;
    const params = new URLSearchParams();
    params.set("week", week);
    if (nextSeverity !== "all") params.set("severity", nextSeverity);
    if (nextStatus !== "open") params.set("status", nextStatus);
    router.push(`/issues?${params.toString()}`);
  }

  function onResolve(row: InboxRow) {
    startTransition(async () => {
      const accepted = await confirm({
        title: "Mark issue resolved",
        message:
          "This only changes the issue status. Imported rows stay as they are, and a locked week stays locked.",
        confirmLabel: "Mark resolved",
      });
      if (!accepted) return;
      const result = await resolveIssueAction(row.id);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Issue marked resolved", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          Warn and Block issues from imports, plus close checks for this week. Info is not listed. Mark resolved
          is for a stored import issue. A close check leaves this list when that check passes.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => openQuery({ week: shiftWeek(data.weekStart, -1) })}
          className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Previous week
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Week starting</span>
          <input
            type="date"
            value={data.weekStart}
            onChange={(event) => {
              if (!event.target.value) return;
              try {
                openQuery({ week: weekBoundsForDate(event.target.value).start });
              } catch {
                return;
              }
            }}
            className="h-10 rounded-md border border-[var(--color-border)] px-3"
          />
        </label>
        <button
          type="button"
          onClick={() => openQuery({ week: shiftWeek(data.weekStart, 1) })}
          className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-medium hover:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Next week
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Severity</span>
          <select
            value={severityFilter}
            onChange={(event) => openQuery({ severity: parseSeverityFilter(event.target.value) })}
            className="h-10 rounded-md border border-[var(--color-border)] bg-white px-3"
          >
            <option value="all">Warn and Block</option>
            <option value="Block">Block</option>
            <option value="Warn">Warn</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => openQuery({ status: parseStatusFilter(event.target.value) })}
            className="h-10 rounded-md border border-[var(--color-border)] bg-white px-3"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      <p className="text-sm text-[var(--color-fg-muted)]">
        Showing {data.weekStart} through {data.weekEnd}
      </p>

      {data.error ? (
        <p className="text-sm text-red-700" role="alert">
          {data.error}
        </p>
      ) : null}

      {!data.issuesReady ? (
        <p className="text-sm text-[var(--color-fg-muted)]">
          Import issues stay hidden until the v0.0.0.4 migration is applied.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-6 py-12 text-center text-[var(--color-fg-muted)]">
          No issues for this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <caption className="px-3 py-3 text-left font-medium">Issues</caption>
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-3 py-3 font-medium">Severity</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Issue</th>
                <th className="px-3 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2">{row.severity}</td>
                  <td className="px-3 py-2">{row.source === "close" ? "Close check" : "Import"}</td>
                  <td className="px-3 py-2">{row.status === "open" ? "Open" : "Resolved"}</td>
                  <td className="px-3 py-2">
                    <IssueCell message={row.message} rule={row.rule} />
                  </td>
                  <td className="px-3 py-2">
                    {canResolveIssue(row) ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => onResolve(row)}
                        disabled={pending}
                      >
                        Mark resolved
                      </Button>
                    ) : (
                      <span className="text-[var(--color-fg-muted)]">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
