import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "danger";

export function StatusDot({ tone, glow = false }: { tone: StatusTone; glow?: boolean }) {
  return <span className={cn("status-dot", `status-dot-${tone}`, glow && "status-dot-glow")} aria-hidden="true" />;
}

/** Decorative macOS style trio. It does not report a live status. */
export function TrafficDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="status-dot status-dot-danger" />
      <span className="status-dot status-dot-warn" />
      <span className="status-dot status-dot-ok" />
    </span>
  );
}
