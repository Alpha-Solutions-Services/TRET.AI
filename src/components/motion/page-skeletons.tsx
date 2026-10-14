import { Skeleton } from "@/components/ui/skeleton";

function ConnectionShapes() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-28" />
      <div className="flex flex-wrap gap-2">
        {["Vektor", "Sheets", "QuickBooks", "Gemini"].map((label) => (
          <Skeleton key={label} className="h-16 min-w-[8.5rem] flex-1 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mx-auto h-10 w-24 rounded-full" />
    </div>
  );
}

/** Connection cards, while that block is still loading. */
export function ConnectionsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading connections">
      <ConnectionShapes />
    </div>
  );
}

/** Connections and AI status, while Integrations is still loading. */
export function IntegrationsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Checking AI status">
      <ConnectionShapes />
      <div className="space-y-2 rounded-xl border border-[var(--color-border)] px-5 py-5">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-56" />
      </div>
    </div>
  );
}

/** Import flow and counters, while Imports is still loading. */
export function ImportsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading imports">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <Skeleton className="mx-auto h-14 w-28 rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    </div>
  );
}

/** A short block shaped like the rows a job is about to fill. */
export function WorkSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label={label}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-4/5 rounded-lg" />
    </div>
  );
}
