"use client";

import { useId } from "react";
import { useReducedMotion } from "framer-motion";
import type { FlowCounts } from "@/components/motion/counts";
import { StatusDot, TrafficDots } from "@/components/ui/status-dot";

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

function pulseColor(counts: FlowCounts): string {
  if (counts.flagged > 0 || counts.duplicate > 0) return "var(--color-warn)";
  if (counts.rowsNew > 0) return "var(--color-ok)";
  return "var(--color-fg)";
}

/** React Vibe Data Flow, adapted. MIT. https://reactvibe.com/docs/motion/data-flow */
export function DataFlow({ counts }: { counts: FlowCounts }) {
  const reduced = useReducedMotion();
  const filterId = `flow-glow-${useId().replace(/:/g, "")}`;
  const paths = [...LEFT.map((node) => convergePath(node.y)), "M 428 120 C 490 120, 520 120, 548 120"];
  const pulse = pulseColor(counts);

  return (
    <section className="material rounded-xl border border-[var(--color-border)] px-4 py-4" aria-label="Import flow">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <TrafficDots />
        Import flow
      </div>
      <div className="h-60 w-full overflow-x-auto">
        <svg
          viewBox="0 0 720 240"
          className="h-60 min-w-[640px]"
          role="img"
          aria-label="Vektor, fuel, and tolls flow into TRET, then into Google Sheets"
        >
          <defs>
            <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="1.6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {paths.map((d, index) => (
            <g key={d}>
              <path d={d} stroke="var(--color-fg)" strokeWidth="1.25" fill="none" opacity="0.85" />
              {reduced ? null : (
                <rect width="14" height="2.5" rx="1" fill={pulse} filter={`url(#${filterId})`}>
                  <animateMotion
                    dur={`${3.2 + index * 0.35}s`}
                    repeatCount="indefinite"
                    path={d}
                    rotate="auto"
                    begin={`${index * 0.25}s`}
                  />
                </rect>
              )}
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
        <StatusDot tone={tone} glow={value > 0} />
        {label}
      </dt>
      <dd className="num mt-1 text-lg font-medium text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}
