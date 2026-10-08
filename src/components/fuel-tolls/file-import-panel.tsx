"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveFuelTollFileAction,
  approveQueuedImportAction,
  dismissQueuedImportAction,
  previewFuelTollFileAction,
} from "@/app/fuel/file-actions";
import { ReviewQueueList, UploadPreviewTable } from "@/components/fuel-tolls/upload-preview";
import type { OpenQueueItem } from "@/lib/fuel-tolls/file/messages";
import { filePreviewCounts } from "@/components/motion/counts";
import { Waveform } from "@/components/motion/waveform";
import type { ImportPreviewRow } from "@/lib/fuel-tolls/file/types";

const DataFlow = dynamic(() => import("@/components/motion/data-flow").then((mod) => mod.DataFlow), {
  loading: () => <div className="h-80" aria-hidden="true" />,
});

async function fileBody(file: File): Promise<{ csvText?: string; xlsxBase64?: string }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const size = 0x8000;
    for (let index = 0; index < bytes.length; index += size) {
      binary += String.fromCharCode(...bytes.subarray(index, index + size));
    }
    return { xlsxBase64: btoa(binary) };
  }
  return { csvText: await file.text() };
}

export function FileImportPanel({
  queue,
  truckUnits,
  queueReady,
}: {
  queue: OpenQueueItem[];
  truckUnits: string[];
  queueReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const counts = useMemo(() => filePreviewCounts(rows), [rows]);

  function onFile(next: File | null) {
    setFile(next);
    setRows(null);
    setKind(null);
    setMessage(null);
    setAiNotice(null);
    setResult(null);
    setError(null);
    if (!next) return;
    startTransition(async () => {
      const body = await fileBody(next);
      const preview = await previewFuelTollFileAction(body);
      if (!preview.ok) {
        setError(preview.error);
        return;
      }
      setKind(preview.kind);
      setMessage(preview.message);
      setAiNotice(preview.aiNotice);
      setRows(preview.rows);
    });
  }

  function approve() {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const body = await fileBody(file);
      const saved = await approveFuelTollFileAction(body);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      const note = saved.note ? ` ${saved.note}` : "";
      setResult(`Wrote ${saved.wrote} rows. ${saved.queued} rows are in the review queue. ${saved.duplicates} duplicates were skipped.${note}`);
      setRows(null);
      setFile(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4" aria-label="Upload fuel or toll file">
      <DataFlow counts={counts} />
      <div className="h-16">{pending ? <Waveform label="Reading the file" /> : null}</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Fuel or toll file</span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!file || !rows || pending || rows.length === 0}
          onClick={approve}
          className="inline-flex h-10 items-center rounded-md bg-[var(--color-accent)] px-3 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-50"
        >
          Approve and write to sheets
        </button>
      </div>
      <p className="text-sm text-[var(--color-fg-muted)]">
        Upload a fuel card CSV or an E-ZPass XLSX. The file type is detected from the headers. Fees are not added to fuel cost.
      </p>
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {result ? <p className="text-sm">{result}</p> : null}
      {message ? <p className="text-sm">{message}</p> : null}
      {kind && rows ? (
        <p className="text-sm text-[var(--color-fg-muted)]">
          Detected {kind === "fuel" ? "a fuel card file" : kind === "toll" ? "an E-ZPass file" : "an unknown file"}. {rows.length} rows.
        </p>
      ) : null}
      {rows && rows.length > 0 ? <UploadPreviewTable rows={rows} /> : null}
      <QueueBlock
        queue={queue}
        truckUnits={truckUnits}
        queueReady={queueReady}
        pending={pending}
        aiNotice={aiNotice}
      />
    </section>
  );
}

function QueueBlock({
  queue,
  truckUnits,
  queueReady,
  pending,
  aiNotice,
}: {
  queue: OpenQueueItem[];
  truckUnits: string[];
  queueReady: boolean;
  pending: boolean;
  aiNotice: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Review queue</h2>
      {aiNotice ? <p className="text-sm">{aiNotice}</p> : null}
      {!queueReady ? (
        <p className="text-sm text-[var(--color-fg-muted)]">
          The review queue is not available until the v0.0.0.29 migration is applied.
        </p>
      ) : (
        <ReviewQueueList
          queue={queue}
          truckUnits={truckUnits}
          pending={pending}
          onApprove={(item, values) => {
            setError(null);
            void approveQueuedImportAction({ id: item.id, ...values }).then((saved) => {
              if (!saved.ok) setError(saved.error);
              else startTransition(() => router.refresh());
            });
          }}
          onDismiss={(item) => {
            setError(null);
            void dismissQueuedImportAction(item.id).then((saved) => {
              if (!saved.ok) setError(saved.error);
              else startTransition(() => router.refresh());
            });
          }}
        />
      )}
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

