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
    <footer className="border-t border-[var(--color-border)] px-5 py-2 text-xs text-[var(--color-fg-muted)]">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p>{health.summary}</p>
        <p className="font-medium tracking-tight text-[var(--color-fg)]">
          {formatFooterLabel(version || APP_VERSION)}
        </p>
      </div>
    </footer>
  );
}
