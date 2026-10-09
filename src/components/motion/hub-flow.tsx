"use client";

import { useId } from "react";
import { categoryColor } from "@/lib/charts/palette";
import type { HubFeed } from "@/lib/overview/hub-feeds";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import type { ConnectionTone } from "@/components/motion/tones";

/**
 * React Vibe Hub Flow and Converge, adapted. MIT.
 * Paths run from Vektor, Sheets, Fuel, Tolls, and Gemini into TRET.
 * Particle color is categorical. The dot is the only status color.
 */
export function HubFlow({ feeds }: { feeds: HubFeed[] }) {
  const filterId = `hub-glow-${useId().replace(/:/g, "")}`;
  const width = 1000;
  const height = 340;
  const hubX = 500;
  const hubTargetY = 228;
  const n = Math.max(feeds.length, 1);
  const xs = feeds.map((_, index) => (n === 1 ? hubX : 80 + (index * (width - 160)) / (n - 1)));

  return (
    <section
      className="material overflow-hidden rounded-2xl border border-[var(--color-border)] px-4 py-4"
      aria-label="Connections"
    >
      <h2 className="text-sm font-medium">Hub</h2>
      <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
        Vektor, Sheets, Fuel, Tolls, and Gemini into TRET.
      </p>
      <div className="relative mt-3 h-[300px] w-full overflow-x-auto">
        <div className="relative h-[300px] min-w-[760px]">
          <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            {feeds.map((feed, index) => {
              const x = xs[index] ?? hubX;
              const d = `M ${x} 78 C ${x} 150, ${hubX} 150, ${hubX} ${hubTargetY}`;
              const color = categoryColor(index);
              return (
                <g key={feed.label}>
                  <path d={d} stroke={color} strokeWidth="1.6" fill="none" opacity="0.85" />
                  <rect
                    className="rv-particle"
                    width="16"
                    height="3"
                    rx="1.5"
                    fill={color}
                    filter={`url(#${filterId})`}
                  >
                    <animateMotion
                      dur="3.2s"
                      repeatCount="indefinite"
                      path={d}
                      rotate="auto"
                      begin={`${index * 0.35}s`}
                    />
                  </rect>
                </g>
              );
            })}
          </svg>
          <div
            className="rv-pulse pointer-events-none absolute left-1/2 top-[62%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
            style={{ background: categoryColor(0), opacity: 0.22 }}
          />
          <div
            className="absolute left-1/2 top-[62%] flex h-14 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-[var(--color-field)] text-sm font-semibold"
            style={{
              borderColor: categoryColor(0),
              boxShadow: `0 0 28px color-mix(in srgb, ${categoryColor(0)} 45%, transparent)`,
            }}
          >
            TRET
          </div>
          {feeds.map((feed, index) => (
            <div
              key={feed.label}
              className="absolute w-[132px] -translate-x-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-field)] px-2 py-2 text-center"
              style={{ left: `${((xs[index] ?? hubX) / width) * 100}%`, top: 0 }}
            >
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium">
                <StatusDot tone={dotTone(feed.tone)} glow />
                {feed.label}
              </p>
              <p className="text-xs text-[var(--color-fg-muted)]">{feed.caption}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function dotTone(tone: ConnectionTone): StatusTone {
  if (tone === "connected") return "ok";
  if (tone === "busy") return "warn";
  return "danger";
}
