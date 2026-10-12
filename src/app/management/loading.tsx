import { Skeleton } from "@/components/ui/skeleton";

export default function ManagementLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="text-sm text-[var(--color-fg-muted)]">Loading management.</p>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
