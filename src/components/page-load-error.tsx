export function PageLoadError({ message }: { message: string }) {
  return (
    <div role="alert" className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-4">
      <h1 className="text-lg font-medium">This page did not load.</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">{message}</p>
      <a
        href=""
        className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium"
      >
        Try again
      </a>
    </div>
  );
}
