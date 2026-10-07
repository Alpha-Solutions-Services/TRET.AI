import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SignedInShell } from "@/components/signed-in-shell";
import { TruckDetailClient } from "@/components/trucks/truck-detail-client";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { listFixedExpensesForTruck } from "@/lib/fixed-expenses/queries";
import {
  getTruck,
  latestChangeForTruck,
  listContractsForTruck,
} from "@/lib/trucks/queries";

export const dynamic = "force-dynamic";

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

async function TruckDetailContent({ id }: { id: string }) {
  const loaded = await getTruck(id);
  if (!loaded) notFound();
  const { truck, googleSheetReady, tolsonReady } = loaded;

  const [contracts, lastChanged, expenses] = await Promise.all([
    listContractsForTruck(id),
    latestChangeForTruck(id),
    listFixedExpensesForTruck(id),
  ]);

  const supabase = await createClient();
  let canDeleteLatest = true;
  try {
    const { data: hasStatements, error } = await supabase.rpc(
      "truck_has_weekly_statements",
      { p_truck_id: id },
    );
    if (!error && hasStatements) canDeleteLatest = false;
  } catch {
    canDeleteLatest = true;
  }

  return (
    <TruckDetailClient
      truck={truck}
      contracts={contracts}
      expenses={expenses}
      lastChanged={lastChanged}
      canDeleteLatest={canDeleteLatest}
      googleSheetReady={googleSheetReady}
      tolsonReady={tolsonReady}
    />
  );
}

export default async function TruckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <SignedInShell title="Truck">
      <Suspense fallback={<DetailSkeleton />}>
        <TruckDetailContent id={id} />
      </Suspense>
    </SignedInShell>
  );
}
