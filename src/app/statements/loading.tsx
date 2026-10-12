import { Skeleton } from "@/components/ui/skeleton";

export default function StatementsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="text-sm text-[var(--color-fg-muted)]">Loading statements.</p>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
