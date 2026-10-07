import { Suspense } from "react";
import { OverviewClient } from "@/components/overview/overview-client";
import { OverviewSkeleton } from "@/components/overview-skeleton";
import { SignedInShell } from "@/components/signed-in-shell";
import { loadManagementCardSummary } from "@/lib/legacy/queries";
import { loadOverview } from "@/lib/overview/queries";

export const dynamic = "force-dynamic";

async function OverviewContent({ week }: { week: string | undefined }) {
  const data = await loadOverview(week);
  const cards = await loadManagementCardSummary(data.weekStart, data.insOuts, data.operatingExpenses);
  return <OverviewClient key={data.weekStart} data={data} cards={cards} />;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignedInShell title="Dashboard">
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent week={params.week} />
      </Suspense>
    </SignedInShell>
  );
}
