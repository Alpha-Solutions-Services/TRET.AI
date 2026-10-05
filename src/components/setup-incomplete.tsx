export function SetupIncomplete() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 text-[var(--color-fg)]">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Setup incomplete</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          This application is not ready yet. Please try again later.
        </p>
      </div>
    </div>
  );
}
