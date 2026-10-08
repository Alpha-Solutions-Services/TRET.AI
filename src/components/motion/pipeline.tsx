"use client";

import { useReducedMotion } from "framer-motion";

const STEPS = ["Parse", "Match", "Review", "Sheets"] as const;

/** React Vibe Pipeline, adapted. MIT. https://reactvibe.com/docs/motion/pipeline */
export function Pipeline() {
  const reduced = useReducedMotion();
  const path = "M 70 28 H 610";
  return (
    <section className="material rounded-xl border border-[var(--color-border)] px-4 py-4" aria-label="Import steps">
      <div className="h-28 w-full overflow-x-auto">
        <svg viewBox="0 0 680 112" className="h-28 min-w-[560px]" role="img" aria-label="Parse, match, review, then sheets">
          <path d={path} stroke="var(--color-border)" strokeWidth="1.5" fill="none" />
          {reduced ? null : (
            <>
              <rect width="10" height="3" rx="1.5" fill="var(--color-accent)">
                <animateMotion dur="3.4s" repeatCount="indefinite" path={path} rotate="auto" />
              </rect>
              <rect width="10" height="3" rx="1.5" fill="var(--color-accent)">
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
