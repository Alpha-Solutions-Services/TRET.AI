"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runVektorImportAction } from "@/app/imports/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 13);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

type RunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  source?: string | null;
  range_from: string;
  range_to: string;
  rows_fetched: number;
  rows_promoted: number;
  rows_rejected: number;
  rows_updated: number;
  error_summary: string | null;
};

export function ImportsClient({ runs }: { runs: RunRow[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  function onImport() {
    startTransition(async () => {
      const result = await runVektorImportAction({ from, to });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(result.message, result.blocked ? "error" : "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Manual Vektor load import only. No scheduler in this version. Does not write to Google Sheets.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 rounded-md border border-[var(--color-border)] px-3"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 rounded-md border border-[var(--color-border)] px-3"
          />
        </label>
        <Button disabled={pending} onClick={onImport}>
          {pending ? "Importing…" : "Import now"}
        </Button>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No import runs yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Range</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Fetched</th>
                <th className="px-4 py-3 font-medium">Promoted</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Rejected</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3">
                    {new Date(run.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{run.source ?? "—"}</td>
                  <td className="px-4 py-3">
                    {run.range_from} → {run.range_to}
                  </td>
                  <td className="px-4 py-3">{run.status}</td>
                  <td className="px-4 py-3">{run.rows_fetched}</td>
                  <td className="px-4 py-3">{run.rows_promoted}</td>
                  <td className="px-4 py-3">{run.rows_updated}</td>
                  <td className="px-4 py-3">{run.rows_rejected}</td>
                  <td className="max-w-xs px-4 py-3 text-[var(--color-fg-muted)]">
                    {run.error_summary ?? "—"}
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
