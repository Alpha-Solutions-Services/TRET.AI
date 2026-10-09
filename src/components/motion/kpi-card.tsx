"use client";

import { CountUp } from "@/components/motion/count-up";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";

/** React Vibe metric card. Glow uses the category color. Count-up uses the real integer. */
export function KpiCard({
  label,
  value,
  detail,
  color,
  target = null,
  format,
  status = null,
}: {
  label: string;
  value: string;
  detail?: string;
  color: string;
  target?: number | null;
  format?: (value: number) => string;
  status?: StatusTone | null;
}) {
  return (
    <div
      className="material rounded-2xl border px-6 py-5"
      style={{
        borderColor: `color-mix(in srgb, ${color} 70%, var(--color-border))`,
        boxShadow: `0 0 22px color-mix(in srgb, ${color} 42%, transparent), inset 0 0 0 1px color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      <p className="flex items-center gap-2 text-xs tracking-wide text-[var(--color-fg-muted)]">
        {status ? <StatusDot tone={status} glow /> : null}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight" style={{ color }}>
        {format ? <CountUp text={value} target={target} format={format} /> : <span className="num">{value}</span>}
      </p>
      {detail ? <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{detail}</p> : null}
    </div>
  );
}
