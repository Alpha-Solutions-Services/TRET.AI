import { Skeleton } from "@/components/ui/skeleton";

export function HealthSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading health">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-4 w-56" />
    </div>
  );
}
