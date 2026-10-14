import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "danger";

/** A connected or busy check pulses. A missing check stays still. */
export function statusDotIsLive(tone: StatusTone | "connected" | "busy" | "not_set"): boolean {
  return tone === "ok" || tone === "connected" || tone === "warn" || tone === "busy";
}

export function StatusDot({ tone, glow = false, live = false }: { tone: StatusTone; glow?: boolean; live?: boolean }) {
  return (
    <span
      className={cn("status-dot", `status-dot-${tone}`, glow && "status-dot-glow", live && "rv-pulse")}
      aria-hidden="true"
    />
  );
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
