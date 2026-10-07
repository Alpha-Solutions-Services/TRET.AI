import { Suspense } from "react";
import { LoadsClient } from "@/components/loads/loads-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function LoadsContent() {
  const supabase = await createClient();
  const { data: loads, error } = await supabase
    .from("loads")
    .select(
      "id, load_id, manifest_friendly_id, delivery_date, week_start, pickup_date, driver_name, broker_name, origin_city, origin_state, destination_city, destination_state, loaded_distance_mi, deadhead_miles, rate_cents, truck_unit_number",
    )
    .order("delivery_date", { ascending: false })
    .limit(2000);

  if (error) {
    return (
      <p className="text-sm text-[var(--color-danger)]" role="alert">
        Could not load loads. Apply the v0.0.0.4 migration if this table is missing.
        ({error.message})
      </p>
    );
  }

  const { data: trucks } = await supabase
    .from("trucks")
    .select("unit_number")
    .order("unit_number");

  const truckUnits = [...new Set((trucks ?? []).map((t) => t.unit_number))];

  return <LoadsClient loads={loads ?? []} truckUnits={truckUnits} />;
}

export default function LoadsPage() {
  return (
    <SignedInShell title="Loads">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <LoadsContent />
      </Suspense>
    </SignedInShell>
  );
}
