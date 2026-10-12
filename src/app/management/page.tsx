import { Suspense } from "react";
import { ManagementClient } from "@/components/dashboard/management-client";
import { PageLoadError } from "@/components/page-load-error";
import { PageRecovery } from "@/components/page-recovery";
import { PageSkeleton } from "@/components/page-skeleton";
import { SignedInShell } from "@/components/signed-in-shell";
import { buildLegacyEarnings } from "@/lib/legacy/fees";
import { loadLegacyFeeState, loadManagementCardSummary } from "@/lib/legacy/queries";
import { listOperatingExpenses } from "@/lib/operating-expenses/queries";
import { loadOverview } from "@/lib/overview/queries";

export const dynamic = "force-dynamic";

async function loadManagement(week: string | undefined) {
  try {
    return { ok: true as const, data: await loadOverview(week) };
  } catch (err) {
    try {
      return { ok: true as const, data: await loadOverview(week) };
    } catch (again) {
      const message = again instanceof Error ? again.message : err instanceof Error ? err.message : "This page did not load.";
      return { ok: false as const, message };
    }
  }
}

async function ManagementContent({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const loaded = await loadManagement(params.week);
  if (!loaded.ok) return <PageLoadError message={loaded.message} />;
  const data = loaded.data;
  const month = data.weekStart.slice(0, 7);
  let fees: Awaited<ReturnType<typeof loadLegacyFeeState>>;
  let cards: Awaited<ReturnType<typeof loadManagementCardSummary>>;
  let expenses: Awaited<ReturnType<typeof listOperatingExpenses>>;
  try {
    [fees, cards, expenses] = await Promise.all([
      loadLegacyFeeState(data.weekStart),
      loadManagementCardSummary(data.weekStart, data.insOuts, data.operatingExpenses),
      listOperatingExpenses(month),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "This page did not load.";
    return <PageLoadError message={message} />;
  }
  const earnings = buildLegacyEarnings({
    trucks: data.insOuts,
    orgFeeBp: fees.orgFeeBp,
    truckWeeks: fees.truckWeeks,
    loadFees: fees.loadFees,
  });
  return (
    <PageRecovery>
      <ManagementClient
        data={data}
        earnings={earnings}
        feeReady={fees.ready}
        feeError={fees.error}
        orgFeeBp={fees.orgFeeBp}
        cards={cards}
        expenses={expenses}
      />
    </PageRecovery>
  );
}

export default async function ManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  return (
    <SignedInShell title="Management">
      <Suspense fallback={<PageSkeleton label="Loading management." />}>
        <ManagementContent searchParams={searchParams} />
      </Suspense>
    </SignedInShell>
  );
}
