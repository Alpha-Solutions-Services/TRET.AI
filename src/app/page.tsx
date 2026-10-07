import { Suspense } from "react";
import { OverviewClient } from "@/components/overview/overview-client";
import { OverviewSkeleton } from "@/components/overview-skeleton";
import { SignedInShell } from "@/components/signed-in-shell";
import { loadOverview } from "@/lib/overview/queries";

export const dynamic = "force-dynamic";

async function OverviewContent({ week }: { week: string | undefined }) {
  const data = await loadOverview(week);
  return <OverviewClient key={data.weekStart} data={data} />;
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
