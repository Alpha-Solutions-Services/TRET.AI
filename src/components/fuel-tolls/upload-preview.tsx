"use client";

import { useState } from "react";
import type { OpenQueueItem } from "@/lib/fuel-tolls/file/messages";
import type { ImportPreviewRow } from "@/lib/fuel-tolls/file/types";
import { centsToDollarString } from "@/lib/money/cents";

function money(cents: number | null): string {
  if (cents == null) return "";
  if (cents < 0) return `-$${centsToDollarString(-cents)}`;
  return `$${centsToDollarString(cents)}`;
}

function statusLabel(status: ImportPreviewRow["status"]): string {
  if (status === "new") return "New";
  if (status === "duplicate") return "Duplicate";
  return "Flagged";
}

export function UploadPreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-field)]">
      <table className="min-w-full text-left text-sm">
        <caption className="px-3 py-3 text-left font-medium">Upload preview</caption>
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
          <tr>
            <th className="px-3 py-3 font-medium">Truck</th>
            <th className="px-3 py-3 font-medium">Week</th>
            <th className="px-3 py-3 font-medium">Linked load or trip</th>
            <th className="px-3 py-3 font-medium">Target sheet</th>
            <th className="px-3 py-3 font-medium">Cells</th>
            <th className="px-3 py-3 font-medium">Amount</th>
            <th className="px-3 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.kind}-${row.sourceRow}`} className="border-b border-[var(--color-border)] align-top">
              <td className="px-3 py-2">{row.truck ?? "Unknown"}</td>
              <td className="px-3 py-2">{row.weekLabel ?? ""}</td>
              <td className="px-3 py-2">{row.link ?? "None"}</td>
              <td className="px-3 py-2">{row.targetSheet ?? ""}</td>
              <td className="px-3 py-2">
                {row.cells.length === 0
                  ? ""
                  : row.cells.map((cell) => `${cell.header} ${cell.a1} = ${cell.value || "(blank)"}`).join("; ")}
              </td>
              <td className="px-3 py-2">{money(row.amountCents)}</td>
              <td className="px-3 py-2">
                <span>{statusLabel(row.status)}</span>
                {row.aiSuggested ? <span className="ml-2 font-medium">AI suggested</span> : null}
                {row.reason ? <span className="mt-1 block text-[var(--color-fg-muted)]">{row.reason}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewQueueList({
  queue,
  truckUnits,
  pending,
  onApprove,
  onDismiss,
}: {
  queue: OpenQueueItem[];
  truckUnits: string[];
  pending: boolean;
  onApprove: (item: OpenQueueItem, values: { unitNumber: string; loadId: string; tripId: string }) => void;
  onDismiss: (item: OpenQueueItem) => void;
}) {
  if (queue.length === 0) {
    return <p className="text-sm text-[var(--color-fg-muted)]">No flagged rows.</p>;
  }
  return (
    <ul className="space-y-3">
      {queue.map((item) => (
        <QueueItem
          key={item.id}
          item={item}
          truckUnits={truckUnits}
          pending={pending}
          onApprove={onApprove}
          onDismiss={onDismiss}
        />
      ))}
    </ul>
  );
}

function QueueItem({
  item,
  truckUnits,
  pending,
  onApprove,
  onDismiss,
}: {
  item: OpenQueueItem;
  truckUnits: string[];
  pending: boolean;
  onApprove: (item: OpenQueueItem, values: { unitNumber: string; loadId: string; tripId: string }) => void;
  onDismiss: (item: OpenQueueItem) => void;
}) {
  const [unitNumber, setUnitNumber] = useState(item.unitNumber ?? "");
  const [loadId, setLoadId] = useState(item.loadId ?? "");
  const [tripId, setTripId] = useState(item.tripId ?? "");
  const units = [...new Set([item.unitNumber, ...truckUnits].filter((unit): unit is string => Boolean(unit)))];

  return (
    <li className="rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] p-3 text-sm">
      <p>
        <span className="font-medium">{item.kind === "fuel" ? "Fuel" : "Toll"}</span>
        {item.aiSuggested ? <span className="ml-2 font-medium">AI suggested</span> : null}
      </p>
      <p className="mt-1 text-[var(--color-fg-muted)]">{item.reason}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Truck</span>
          <select
            value={unitNumber}
            onChange={(event) => setUnitNumber(event.target.value)}
            className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3"
          >
            <option value="">Pick a truck</option>
            {units.map((unit) => (
              <option key={unit} value={unit}>
                Truck {unit}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Load ID</span>
          <input
            value={loadId}
            onChange={(event) => setLoadId(event.target.value)}
            placeholder="TBH--1192"
            className="h-10 rounded-md border border-[var(--color-border)] px-3"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--color-fg-muted)]">Trip Group ID</span>
          <input
            value={tripId}
            onChange={(event) => setTripId(event.target.value)}
            placeholder="M-1195"
            className="h-10 rounded-md border border-[var(--color-border)] px-3"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => onApprove(item, { unitNumber, loadId, tripId })}
          className="inline-flex h-10 items-center rounded-md bg-[var(--color-accent)] px-3 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onDismiss(item)}
          className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}
