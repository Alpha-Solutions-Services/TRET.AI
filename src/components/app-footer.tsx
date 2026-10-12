"use client";

import { useEffect, useRef } from "react";
import { APP_VERSION, formatFooterLabel } from "@/lib/app-version";

export function AppFooter({
  version,
  health,
}: {
  version: string;
  health: { summary: string; showInFooter: boolean };
}) {
  const footerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = footerRef.current;
    if (!node) return;
    const write = () => {
      document.documentElement.style.setProperty("--app-footer-height", `${node.offsetHeight}px`);
    };
    write();
    const observer = new ResizeObserver(write);
    observer.observe(node);
    return () => observer.disconnect();
  }, [health.showInFooter, health.summary, version]);
  return (
    <footer
      ref={footerRef}
      className="relative z-0 mt-auto shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-8 py-4 text-xs text-[var(--color-fg-muted)]"
    >
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {health.showInFooter ? <p>{health.summary}</p> : null}
        <p className="ml-auto font-medium tracking-tight text-[var(--color-fg)]">
          {formatFooterLabel(version || APP_VERSION)}
        </p>
      </div>
    </footer>
  );
}
