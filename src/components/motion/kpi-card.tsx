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
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-field)] px-6 py-5" data-accent={color}>
      <p className="flex items-center gap-2 text-xs tracking-wide text-[var(--color-fg-muted)]">
        {status ? <StatusDot tone={status} /> : null}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {format ? <CountUp text={value} target={target} format={format} /> : <span className="num">{value}</span>}
      </p>
      {detail ? <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{detail}</p> : null}
    </div>
  );
}
