"use client";

import { useId } from "react";
import { useReducedMotion } from "framer-motion";
import { type ConnectionTone } from "@/components/motion/tones";

export type OriginNode = {
  label: string;
  tone: ConnectionTone;
  caption: string;
};

/** React Vibe Origin, adapted. MIT. https://reactvibe.com/docs/motion/origin */
export function OriginMap({ nodes }: { nodes: OriginNode[] }) {
  const reduced = useReducedMotion();
  const filterId = `origin-glow-${useId().replace(/:/g, "")}`;
  const spots = [90, 270, 450, 630];
  const paths = spots.map(
    (x) => `M 360 92 C 360 140, ${x} 150, ${x} 176`,
  );

  return (
    <section className="material rounded-xl border border-[var(--color-border)] px-4 py-4" aria-label="Connections">
      <div className="h-[280px] w-full overflow-x-auto">
        <div className="relative h-[280px] min-w-[720px]">
          <svg viewBox="0 0 720 280" className="absolute inset-0 h-full w-full" aria-hidden="true">
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
                    <animateMotion dur="3.2s" repeatCount="indefinite" path={d} rotate="auto" begin={`${index * 0.2}s`} />
                  </rect>
                )}
              </g>
            ))}
          </svg>
          <div
            className="absolute left-[316px] top-[36px] flex h-16 w-24 items-center justify-center rounded-2xl border border-[var(--color-accent)] bg-[var(--color-field)] text-sm font-medium shadow-[0_0_16px_var(--color-glow)]"
          >
            TRET
          </div>
          {nodes.slice(0, 4).map((node, index) => (
            <div
              key={node.label}
              className={nodeClass(node.tone)}
              style={{ left: spots[index]! - 68, top: 176 }}
            >
              <p className="text-sm font-medium">{node.label}</p>
              <p className="text-xs text-[var(--color-fg-muted)]">{node.caption}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function captionFor(tone: ConnectionTone, override?: string): string {
  return override ?? (tone === "connected" ? "Connected" : tone === "busy" ? "Busy" : "Not set");
}

function nodeClass(tone: ConnectionTone): string {
  const base =
    "absolute flex h-[72px] w-[136px] flex-col items-center justify-center rounded-xl border bg-[var(--color-field)] px-2 text-center";
  if (tone === "connected") {
    return `${base} border-[var(--color-accent)] shadow-[0_0_16px_var(--color-glow)]`;
  }
  if (tone === "busy") {
    return `${base} rv-busy border-[var(--color-warn-fg)]`;
  }
  return `${base} border-[var(--color-border)]`;
}
