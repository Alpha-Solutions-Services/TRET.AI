"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { runFuelAndTollsImportAction } from "@/app/imports/fuel-toll-actions";
import { previewLoadsCsvAction, runVektorImportAction } from "@/app/imports/actions";
import { loadsPreviewCounts } from "@/components/motion/counts";
import { Waveform } from "@/components/motion/waveform";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { lastFinishedWeekStart } from "@/lib/reports/delivery";
import { formatUtcStamp } from "@/lib/format-stamp";

const DataFlow = dynamic(() => import("@/components/motion/data-flow").then((mod) => mod.DataFlow), {
  loading: () => <div className="h-80" aria-hidden="true" />,
});

const Pipeline = dynamic(() => import("@/components/motion/pipeline").then((mod) => mod.Pipeline), {
  loading: () => <div className="h-36" aria-hidden="true" />,
});

function defaultRange(): { from: string; to: string } {
  const start = lastFinishedWeekStart();
  return { from: start, to: weekBoundsForDate(start).end };
}

type RunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  source?: string | null;
  kind?: string | null;
  range_from: string;
  range_to: string;
  rows_fetched: number;
  rows_promoted: number;
  rows_rejected: number;
  rows_updated: number;
  error_summary: string | null;
};

export function ImportsClient({
  runs,
  source,
}: {
  runs: RunRow[];
  source: string | null;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [fuelFile, setFuelFile] = useState<File | null>(null);
  const [tollFile, setTollFile] = useState<File | null>(null);
  const [loadsFile, setLoadsFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<
    Array<{
      loadId: string;
      unitNumber: string;
      statusLabel: string;
      deliveryDay: string | null;
      rateCents: number | null;
      action: "import" | "skip";
      reason: string | null;
    }> | null
  >(null);
  const counts = useMemo(() => loadsPreviewCounts(preview), [preview]);

  async function fileText(file: File | null): Promise<string | null> {
    if (!file) return null;
    return file.text();
  }

  function onPreview() {
    startTransition(async () => {
      const loadsCsv = await fileText(loadsFile);
      const result = await previewLoadsCsvAction({ csvText: loadsCsv ?? "", from, to });
      if (!result.ok) {
        toast(result.error, "error");
        setPreview(null);
        return;
      }
      setPreview(result.rows);
    });
  }

  function onImport() {
    startTransition(async () => {
      const loadsCsv = await fileText(loadsFile);
      const result = await runVektorImportAction({ from, to, csvText: loadsCsv });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(result.message, result.blocked ? "error" : "success");
      router.refresh();
    });
  }

  function onImportFuelTolls() {
    startTransition(async () => {
      const fuelCsv = await fileText(fuelFile);
      const tollCsv = await fileText(tollFile);
      const result = await runFuelAndTollsImportAction({
        from,
        to,
        fuelCsvText: fuelCsv,
        tollCsvText: tollCsv,
      });
      if (!result.ok) {
        toast(result.error, "error");
        router.refresh();
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
          Manual import only. Loads, fuel, and tolls. No scheduler. Fuel and toll files write to Google Sheets
          after you approve them. A Vektor sheet cell writes only after you approve that cell. Overview and Ins
          and Outs read each truck sheet. Current loads source: {source ?? "none"}.
        </p>
      </div>
      <DataFlow counts={counts} />
      <Pipeline pending={pending} />
      <div className="h-16">{pending ? <Waveform label="Import working" /> : null}</div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] p-4">
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
        <Button variant={pending ? "warn" : "secondary"} disabled={pending} onClick={onPreview}>
          {pending ? "Working…" : "Preview loads"}
        </Button>
        <Button variant={pending ? "warn" : "primary"} disabled={pending} onClick={onImport}>
          {pending ? "Importing…" : "Import loads"}
        </Button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Loads CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setLoadsFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </label>
        <Button variant={pending ? "warn" : "primary"} disabled={pending} onClick={onImportFuelTolls}>
          {pending ? "Importing…" : "Import fuel and tolls"}
        </Button>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Fuel CSV (fallback)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFuelFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Tolls CSV (fallback)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setTollFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </label>
      </div>
      <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
        A Vektor orders export is accepted: Order ID, Gross, Truck Reference ID, and a delivery date. Delivered,
        in transit, dispatched, and en route rows in the Monday to Sunday week are imported. Booked and deleted
        rows stay in the preview. A chosen loads file is the only source for that import. A chosen fuel or toll
        file is used on its own. Save the Vektor column mapping in Settings once.
      </p>
      {preview ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-field)]">
          <table className="min-w-full text-left text-sm">
            <caption className="px-4 py-3 text-left font-medium">CSV preview</caption>
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Load</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Delivery</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={`${row.loadId}-${index}`} className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-2">{row.loadId || "Blank"}</td>
                  <td className="px-4 py-2">{row.unitNumber || "Blank"}</td>
                  <td className="px-4 py-2">{row.statusLabel}</td>
                  <td className="px-4 py-2">{row.deliveryDay ?? "Blank"}</td>
                  <td className="px-4 py-2">{row.action === "import" ? "Import" : "Skip"}</td>
                  <td className="px-4 py-2 text-[var(--color-fg-muted)]">{row.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {runs.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No import runs yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-field)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Kind</th>
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
                    {formatUtcStamp(run.started_at)}
                  </td>
                  <td className="px-4 py-3">{run.kind ?? "loads"}</td>
                  <td className="px-4 py-3">{run.source ?? "None"}</td>
                  <td className="px-4 py-3">
                    {run.range_from} through {run.range_to}
                  </td>
                  <td className="px-4 py-3">{run.status}</td>
                  <td className="px-4 py-3">{run.rows_fetched}</td>
                  <td className="px-4 py-3">{run.rows_promoted}</td>
                  <td className="px-4 py-3">{run.rows_updated}</td>
                  <td className="px-4 py-3">{run.rows_rejected}</td>
                  <td className="max-w-xs px-4 py-3 text-[var(--color-fg-muted)]">
                    {run.error_summary ?? "None"}
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
