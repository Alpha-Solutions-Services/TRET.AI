"use client";

import { usePathname } from "next/navigation";
import { usePageGuidance } from "@/components/page-guidance";
import { APP_VERSION, formatFooterLabel } from "@/lib/app-version";
import { routeGuidance } from "@/lib/footer-copy";

export function AppFooter({
  version,
  health,
}: {
  version: string;
  health: { summary: string };
}) {
  const pathname = usePathname() ?? "/";
  const pageNote = usePageGuidance();
  const guidance = pageNote || routeGuidance(pathname);

  return (
    <footer className="material fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] px-5 py-3 text-sm text-[var(--color-fg-muted)]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-1">
        <p>{guidance}</p>
        <p>{health.summary}</p>
        <p className="font-medium tracking-tight text-[var(--color-fg)]">
          {formatFooterLabel(version || APP_VERSION)}
        </p>
      </div>
    </footer>
  );
}
