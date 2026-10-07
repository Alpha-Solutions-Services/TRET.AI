"use client";

import { APP_VERSION, formatFooterLabel } from "@/lib/app-version";

export function AppFooter({
  version,
  health,
}: {
  version: string;
  health: { summary: string };
}) {
  return (
    <footer className="border-t border-[var(--color-border)] px-8 py-4 text-xs text-[var(--color-fg-muted)]">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p>{health.summary}</p>
        <p className="font-medium tracking-tight text-[var(--color-fg)]">
          {formatFooterLabel(version || APP_VERSION)}
        </p>
      </div>
    </footer>
  );
}
