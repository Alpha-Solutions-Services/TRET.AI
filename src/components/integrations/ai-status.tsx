import type { AiStatus } from "@/lib/llm-gateway/gemini";

export function AiStatusCard({ status }: { status: AiStatus }) {
  return (
    <section className="material rounded-xl border border-[var(--color-border)] px-5 py-5">
      <h2 className="text-lg font-semibold">AI status</h2>
      <p className="mt-2 text-sm" role="status">
        {status}
      </p>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">A test call only. The key is not shown.</p>
    </section>
  );
}
