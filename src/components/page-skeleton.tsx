export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="min-h-[28rem] space-y-4" role="status" aria-live="polite" aria-busy="true">
      <p className="text-base font-medium text-[var(--color-fg)]">{label}</p>
      <div className="h-8 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-field)]" />
      <div className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-field)]" />
      <div className="h-64 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-field)]" />
    </div>
  );
}
