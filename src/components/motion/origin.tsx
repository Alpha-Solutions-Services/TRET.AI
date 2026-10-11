"use client";

import { type ConnectionTone } from "@/components/motion/tones";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";

export type OriginNode = {
  label: string;
  tone: ConnectionTone;
  caption: string;
};

/** Connection status. Labels stay fully visible. No inner scrollbar or glow. */
export function OriginMap({ nodes }: { nodes: OriginNode[] }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] px-4 py-4" aria-label="Connections">
      <h2 className="text-sm font-medium">Connections</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {nodes.map((node) => (
          <li key={node.label} className={nodeClass()}>
            <p className="flex items-center justify-center gap-2 text-sm font-medium">
              <StatusDot tone={dotTone(node.tone)} />
              {node.label}
            </p>
            <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{node.caption}</p>
          </li>
        ))}
      </ul>
      <p className="mx-auto mt-3 w-fit rounded-full border border-[var(--color-accent)] px-4 py-2 text-sm font-semibold">TRET</p>
    </section>
  );
}

export function captionFor(tone: ConnectionTone, override?: string): string {
  return override ?? (tone === "connected" ? "Connected" : tone === "busy" ? "Busy" : "Not set");
}

function dotTone(tone: ConnectionTone | undefined): StatusTone {
  if (tone === "connected") return "ok";
  if (tone === "busy") return "warn";
  return "danger";
}

function nodeClass(): string {
  return "min-w-[8.5rem] flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-field)] px-3 py-2 text-center";
}
