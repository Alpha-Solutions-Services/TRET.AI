import { Suspense } from "react";
import { ManagementClient } from "@/components/dashboard/management-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { buildLegacyEarnings } from "@/lib/legacy/fees";
import { loadLegacyFeeState } from "@/lib/legacy/queries";
import { loadOverview } from "@/lib/overview/queries";

export const dynamic = "force-dynamic";

async function ManagementContent({ week }: { week: string | undefined }) {
  const data = await loadOverview(week);
  const fees = await loadLegacyFeeState(data.weekStart);
  const earnings = buildLegacyEarnings({
    trucks: data.insOuts,
    orgFeeBp: fees.orgFeeBp,
    truckWeeks: fees.truckWeeks,
    loadFees: fees.loadFees,
  });
  return (
    <ManagementClient
      data={data}
      earnings={earnings}
      feeReady={fees.ready}
      feeError={fees.error}
      orgFeeBp={fees.orgFeeBp}
    />
  );
}

export default async function ManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignedInShell title="Management">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <ManagementContent week={params.week} />
      </Suspense>
    </SignedInShell>
  );
}
