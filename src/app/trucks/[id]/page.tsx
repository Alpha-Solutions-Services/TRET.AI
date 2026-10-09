import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SignedInShell } from "@/components/signed-in-shell";
import { TruckDetailClient } from "@/components/trucks/truck-detail-client";
import { Skeleton } from "@/components/ui/skeleton";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";
import { listFixedExpensesForTruck } from "@/lib/fixed-expenses/queries";
import { loadFeeSettings } from "@/lib/fees/load";
import { resolveWeekStart } from "@/lib/statements/queries";
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

async function TruckDetailContent({ id, week }: { id: string; week?: string }) {
  const weekStart = resolveWeekStart(week);
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

  const [cards, plates, tags] = await Promise.all([
    supabase.from("truck_fuel_cards").select("card_number").eq("truck_id", id),
    supabase.from("truck_plates").select("plate, plate_state").eq("truck_id", id),
    supabase.from("truck_toll_tags").select("tag_number").eq("truck_id", id),
  ]);
  const identityReady = ![cards.error, plates.error, tags.error].some(
    (error) => error && isMissingSchemaError(error),
  );
  const identityCards = (cards.data ?? []).map((row) => row.card_number).join("\n");
  const identityPlates = (plates.data ?? [])
    .map((row) => (row.plate_state ? `${row.plate} ${row.plate_state}` : row.plate))
    .join("\n");
  const identityTags = (tags.data ?? []).map((row) => row.tag_number).join("\n");
  const [queueRes, fees] = await Promise.all([
    supabase
      .from("sheet_write_queue")
      .select("id, kind, tab_title, column_header, week_start, a1, new_value, status, error")
      .eq("truck_id", id)
      .order("created_at", { ascending: false }),
    loadFeeSettings(),
  ]);

  return (
    <TruckDetailClient
      truck={truck}
      contracts={contracts}
      expenses={expenses}
      lastChanged={lastChanged}
      canDeleteLatest={canDeleteLatest}
      googleSheetReady={googleSheetReady}
      tolsonReady={tolsonReady}
      identityReady={identityReady}
      identityCards={identityCards}
      identityPlates={identityPlates}
      identityTags={identityTags}
      weekStart={weekStart}
      queue={queueRes.data ?? []}
      fee={fees.rows.find((row) => row.truckId === id) ?? null}
      feeReady={fees.ready}
    />
  );
}

export default async function TruckDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <SignedInShell title="Truck">
      <Suspense fallback={<DetailSkeleton />}>
        <TruckDetailContent id={id} week={query.week} />
      </Suspense>
    </SignedInShell>
  );
}
