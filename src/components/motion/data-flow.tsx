"use client";

import { useId } from "react";
import { useReducedMotion } from "framer-motion";
import type { FlowCounts } from "@/components/motion/counts";

const LEFT = [
  { label: "Vektor", y: 46 },
  { label: "Fuel", y: 120 },
  { label: "Tolls", y: 194 },
] as const;

/** React Vibe Data Flow, adapted. MIT. https://reactvibe.com/docs/motion/data-flow */
export function DataFlow({ counts }: { counts: FlowCounts }) {
  const reduced = useReducedMotion();
  const filterId = `flow-glow-${useId().replace(/:/g, "")}`;
  const paths = [
    ...LEFT.map((node) => `M 132 ${node.y} C 210 ${node.y}, 240 120, 292 120`),
    "M 428 120 C 490 120, 520 120, 548 120",
  ];

  return (
    <section className="material rounded-xl border border-[var(--color-border)] px-4 py-4" aria-label="Import flow">
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
              <path d={d} stroke="var(--color-border)" strokeWidth="1.5" fill="none" />
              {reduced ? null : (
                <rect width="12" height="3" rx="1.5" fill="var(--color-accent)" filter={`url(#${filterId})`}>
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
          <rect x="292" y="92" width="136" height="56" rx="14" fill="var(--color-field)" stroke="var(--color-accent)" />
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
        <Count label="New" value={counts.rowsNew} />
        <Count label="Duplicate" value={counts.duplicate} />
        <Count label="Flagged" value={counts.flagged} />
      </dl>
      <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{counts.caption}</p>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-field)] px-3 py-2">
      <dt className="text-xs text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="num mt-1 text-lg font-medium text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}
