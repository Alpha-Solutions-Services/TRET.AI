"use client";

import type { HubFeed } from "@/lib/overview/hub-feeds";
import { StatusDot, statusDotIsLive, type StatusTone } from "@/components/ui/status-dot";
import type { ConnectionTone } from "@/components/motion/tones";

/**
 * Connection status for the week. Labels stay fully visible.
 * A live check pulses. One accent on hover. No inner scrollbar or glow.
 */
export function HubFlow({ feeds }: { feeds: HubFeed[] }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-4" aria-label="Connections">
      <h2 className="text-base font-medium">Hub</h2>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Vektor, Sheets, Fuel, Tolls, and Gemini into TRET.</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {feeds.map((feed) => (
          <li
            key={feed.label}
            className="press-card min-w-[8.5rem] flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2 text-center"
          >
            <p className="flex items-center justify-center gap-2 text-sm font-medium">
              <StatusDot tone={dotTone(feed.tone)} live={statusDotIsLive(feed.tone)} />
              {feed.label}
            </p>
            <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{feed.caption}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-center" aria-hidden="true">
        <div className="h-4 w-px bg-[var(--color-accent)]" />
      </div>
      <p className="press-card mx-auto mt-2 w-fit rounded-full border border-[var(--color-accent)] px-6 py-2 text-sm font-semibold">
        TRET
      </p>
    </section>
  );
}

function dotTone(tone: ConnectionTone): StatusTone {
  if (tone === "connected") return "ok";
  if (tone === "busy") return "warn";
  return "danger";
}
