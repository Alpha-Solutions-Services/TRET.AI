"use client";

import { useState } from "react";
import { copyableErrorText, presentCopyableError } from "@/lib/sheets/present-error";

export function CopyableError({
  headline,
  detail,
}: {
  headline: string;
  detail?: string | null;
}) {
  const presented = presentCopyableError(headline, detail);
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(copyableErrorText(presented.headline, presented.detail));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="inline-flex max-w-md flex-col items-start gap-1 text-left">
      <button
        type="button"
        onClick={onCopy}
        className="pressable rounded-md text-left text-sm font-medium text-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        data-error-detail={presented.detail}
      >
        {presented.headline}
      </button>
      {presented.detail !== presented.headline ? (
        <span className="text-xs text-[var(--color-fg-muted)]">{presented.detail}</span>
      ) : null}
      <button type="button" onClick={onCopy} className="pressable text-xs font-medium text-[var(--color-accent)]">
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
