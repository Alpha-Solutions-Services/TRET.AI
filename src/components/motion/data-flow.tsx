"use client";

import type { FlowCounts } from "@/components/motion/counts";
import { StatusDot } from "@/components/ui/status-dot";

const LEFT = [
  { label: "Vektor", y: 46 },
  { label: "Fuel", y: 120 },
  { label: "Tolls", y: 194 },
] as const;

/** Incoming curves follow React Vibe Converge. MIT. https://reactvibe.com/docs/motion/converge */
function convergePath(startY: number): string {
  const startX = 132;
  const endX = 292;
  const endY = 120;
  const radius = 90;
  return `M ${startX} ${startY} C ${startX + radius} ${startY}, ${endX - radius * 0.66} ${endY}, ${endX} ${endY}`;
}

/** Import counts. Paths are static. MIT layout from React Vibe, without a looping pulse. */
export function DataFlow({ counts }: { counts: FlowCounts }) {
  const paths = [...LEFT.map((node) => convergePath(node.y)), "M 428 120 C 490 120, 520 120, 548 120"];

  return (
    <section className="material rounded-xl border border-[var(--color-border)] px-4 py-4" aria-label="Import flow">
      <h2 className="mb-2 text-sm font-medium">Import flow</h2>
      <div className="w-full">
        <svg
          viewBox="0 0 720 240"
          className="h-auto w-full"
          role="img"
          aria-label="Vektor, fuel, and tolls flow into TRET, then into Google Sheets"
        >
          {paths.map((d) => (
            <g key={d}>
              <path d={d} stroke="var(--color-fg)" strokeWidth="1.25" fill="none" opacity="0.85" />
            </g>
          ))}
          {LEFT.map((node) => (
            <g key={node.label}>
              <rect x="8" y={node.y - 20} width="116" height="40" rx="12" fill="var(--color-field)" stroke="var(--color-border)" />
              <text x="66" y={node.y + 5} textAnchor="middle" fill="var(--color-fg)" fontSize="14">
                {node.label}
              </text>
            </g>
          ))}
          <rect x="292" y="92" width="136" height="56" rx="14" fill="var(--color-field)" stroke="var(--color-fg)" />
          <text x="360" y="125" textAnchor="middle" fill="var(--color-fg)" fontSize="16">
            TRET
          </text>
          <rect x="548" y="96" width="160" height="48" rx="12" fill="var(--color-field)" stroke="var(--color-border)" />
          <text x="628" y="125" textAnchor="middle" fill="var(--color-fg)" fontSize="14">
            Google Sheets
          </text>
        </svg>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Count label="New" value={counts.rowsNew} tone="ok" />
        <Count label="Duplicate" value={counts.duplicate} tone="warn" />
        <Count label="Flagged" value={counts.flagged} tone="warn" />
      </dl>
      <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{counts.caption}</p>
    </section>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 py-2">
      <dt className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
        <StatusDot tone={tone} />
        {label}
      </dt>
      <dd className="num mt-1 text-lg font-medium text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}
