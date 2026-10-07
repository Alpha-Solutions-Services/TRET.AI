import { Suspense } from "react";
import { InsOutsClient } from "@/components/ins-outs/ins-outs-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { buildLegacyEarnings } from "@/lib/legacy/fees";
import { loadLegacyFeeState } from "@/lib/legacy/queries";
import { loadInsOutsWeek } from "@/lib/sheets/load-week";
import { resolveWeekStart } from "@/lib/statements/queries";

export const dynamic = "force-dynamic";

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

async function InsOutsContent({ week }: { week: string | undefined }) {
  const weekStart = resolveWeekStart(week);
  const bounds = weekBoundsForDate(weekStart);
  const [loaded, fees] = await Promise.all([
    loadInsOutsWeek(bounds.start, bounds.end),
    loadLegacyFeeState(bounds.start),
  ]);
  const earnings = buildLegacyEarnings({
    trucks: loaded.rows,
    orgFeeBp: fees.orgFeeBp,
    truckWeeks: fees.truckWeeks,
    loadFees: fees.loadFees,
  });
  return (
    <InsOutsClient
      weekStart={bounds.start}
      weekEnd={bounds.end}
      rows={loaded.rows}
      error={loaded.error}
      sheetEnvMissing={loaded.sheetEnvMissing}
      mismatchCount={loaded.mismatchCount}
      mismatchError={loaded.mismatchError}
      legacy={{
        earnings,
        ready: fees.ready,
        error: fees.error,
        orgFeeBp: fees.orgFeeBp,
      }}
    />
  );
}

export default async function InsOutsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignedInShell title="Ins and Outs">
      <Suspense fallback={<PageSkeleton />}>
        <InsOutsContent week={params.week} />
      </Suspense>
    </SignedInShell>
  );
}
