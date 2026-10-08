"use client";

import { useReducedMotion } from "framer-motion";
import { StatusDot } from "@/components/ui/status-dot";

/** React Vibe Signal, adapted. MIT. The docs install react-icons. This copy uses no icon package. */
export function SignalHeader({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const label = count === 1 ? "1 truck connected" : `${count} trucks connected`;
  const moving = !reduced && count > 0;
  const left = [18, 36, 54].map((y) => `M 16 ${y} C 80 ${y}, 140 36, 220 36`);
  const right = [18, 36, 54].map((y) => `M 420 36 C 500 36, 560 ${y}, 624 ${y}`);
  return (
    <div className="relative h-[72px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-field)]" aria-label={label}>
      <svg viewBox="0 0 640 72" className="h-[72px] w-full" aria-hidden="true">
        {[...left, ...right].map((d, index) => (
          <g key={d}>
            <path d={d} stroke="var(--color-fg)" strokeWidth="1.25" fill="none" opacity="0.85" />
            {moving ? (
              <rect width="8" height="2.5" rx="1.2" fill="var(--color-ok)">
                <animateMotion dur={`${3.1 + (index % 3) * 0.4}s`} repeatCount="indefinite" path={d} rotate="auto" begin={`${index * 0.15}s`} />
              </rect>
            ) : null}
          </g>
        ))}
      </svg>
      <p className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-field)] px-3 py-1 text-sm">
        <StatusDot tone={count > 0 ? "ok" : "danger"} glow />
        {label}
      </p>
    </div>
  );
}
