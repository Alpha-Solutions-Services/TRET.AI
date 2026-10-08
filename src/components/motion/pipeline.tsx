"use client";

import { useReducedMotion } from "framer-motion";
import { TrafficDots } from "@/components/ui/status-dot";

const STEPS = ["Parse", "Match", "Review", "Sheets"] as const;

/** React Vibe Pipeline, adapted. MIT. https://reactvibe.com/docs/motion/pipeline */
export function Pipeline({ pending = false }: { pending?: boolean }) {
  const reduced = useReducedMotion();
  const path = "M 70 28 H 610";
  const pulse = pending ? "var(--color-warn)" : "var(--color-fg)";
  return (
    <section className="material rounded-xl border border-[var(--color-border)] px-4 py-4" aria-label="Import steps">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <TrafficDots />
        Import steps
      </div>
      <div className="h-28 w-full overflow-x-auto">
        <svg viewBox="0 0 680 112" className="h-28 min-w-[560px]" role="img" aria-label="Parse, match, review, then sheets">
          <path d={path} stroke="var(--color-fg)" strokeWidth="1.25" fill="none" opacity="0.85" />
          {reduced ? null : (
            <>
              <rect width="14" height="2.5" rx="1" fill={pulse}>
                <animateMotion dur="3.4s" repeatCount="indefinite" path={path} rotate="auto" />
              </rect>
              <rect width="14" height="2.5" rx="1" fill={pulse}>
                <animateMotion dur="3.4s" repeatCount="indefinite" path={path} rotate="auto" begin="1.7s" />
              </rect>
            </>
          )}
          {STEPS.map((step, index) => {
            const x = 70 + index * 180;
            return (
              <g key={step}>
                <rect x={x - 58} y={52} width="116" height="40" rx="12" fill="var(--color-field)" stroke="var(--color-border)" />
                <text x={x} y={77} textAnchor="middle" fill="var(--color-fg)" fontSize="14">
                  {step}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
