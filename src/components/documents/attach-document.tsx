"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadReceiptAction, uploadTonuRateConAction } from "@/app/documents/actions";
import type { TruckDocumentRow } from "@/lib/documents/store";
import { centsToDollarString } from "@/lib/money/cents";

export function DocumentPhotos({ documents }: { documents: readonly TruckDocumentRow[] }) {
  if (documents.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-3">
      {documents.map((doc) => (
        <li key={doc.id} className="max-w-40 text-xs text-[var(--color-fg-muted)]">
          {doc.contentType.startsWith("image/") ? (
            <Image
              src={`/api/documents/${doc.id}`}
              alt={doc.fileName}
              width={96}
              height={96}
              unoptimized
              className="h-24 w-24 rounded border border-[var(--color-border)] object-cover"
            />
          ) : (
            <a className="font-medium text-[var(--color-accent)] underline" href={`/api/documents/${doc.id}`}>
              {doc.fileName}
            </a>
          )}
          <p className="mt-1">
            {doc.vendor ? `${doc.vendor} ` : ""}
            {doc.amountCents != null ? `$${centsToDollarString(doc.amountCents)}` : doc.fileName}
          </p>
          {doc.note ? <p>{doc.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function TonuRateConUpload({
  loadId,
  truckUnit,
  freightCents,
}: {
  loadId: string;
  truckUnit: string;
  freightCents: number;
}) {
  return (
    <UploadForm
      action={uploadTonuRateConAction}
      label="Upload rate confirmation"
      fields={{ loadId, truckUnit, freightCents: String(freightCents) }}
    />
  );
}

export function ReceiptUpload({
  kind,
  truckUnit,
  loadId,
  expenseId,
  weekStart,
  label,
}: {
  kind: "fuel_receipt" | "expense_receipt";
  truckUnit: string;
  loadId?: string;
  expenseId?: string;
  weekStart?: string;
  label: string;
}) {
  return (
    <UploadForm
      action={uploadReceiptAction}
      label={label}
      fields={{
        kind,
        truckUnit,
        loadId: loadId ?? "",
        expenseId: expenseId ?? "",
        weekStart: weekStart ?? "",
      }}
    />
  );
}

function UploadForm({
  action,
  label,
  fields,
}: {
  action: (form: FormData) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
  label: string;
  fields: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formEl = event.currentTarget;
        const form = new FormData(formEl);
        setError(null);
        setMessage(null);
        startTransition(async () => {
          const result = await action(form);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setMessage(result.message);
          formEl.reset();
          router.refresh();
        });
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input
        name="file"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
        aria-label={label}
        className="max-w-full text-xs"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-2 text-xs font-medium"
      >
        {pending ? "Reading…" : label}
      </button>
      {error ? (
        <p className="text-xs text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-xs">{message}</p> : null}
    </form>
  );
}
