import { Waveform } from "@/components/motion/waveform";
import { StatusDot, TrafficDots, type StatusTone } from "@/components/ui/status-dot";
import type { AiStatus } from "@/lib/llm-gateway/gemini";

function aiTone(status: AiStatus): StatusTone {
  if (status === "OK") return "ok";
  if (status === "Busy") return "warn";
  return "danger";
}

export function AiStatusCard({ status }: { status: AiStatus }) {
  return (
    <section className="material rounded-xl border border-[var(--color-border)] px-5 py-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <TrafficDots />
        AI status
      </h2>
      <p className="mt-2 flex items-center gap-2 text-sm" role="status">
        <StatusDot tone={aiTone(status)} glow />
        {status}
      </p>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">A test call only. The key is not shown.</p>
      <div className="h-16">{status === "Busy" ? <Waveform label="AI busy" /> : null}</div>
    </section>
  );
}
