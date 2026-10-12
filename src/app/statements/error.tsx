"use client";

export default function StatementsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-4">
      <h1 className="text-lg font-medium">Statements did not load.</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">The sheet read did not finish. Try again.</p>
      <button
        type="button"
        className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}