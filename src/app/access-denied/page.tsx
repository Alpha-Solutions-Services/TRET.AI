export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Access denied</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Your account is not allowed to use TRET.AI.
        </p>
      </div>
    </div>
  );
}
