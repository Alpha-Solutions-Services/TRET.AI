import { Suspense } from "react";
import { TollsClient } from "@/components/tolls/tolls-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function TollsContent() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("toll_transactions")
    .select(
      "id, vektor_transaction_id, unit_number, vektor_truck_id, transacted_date, week_start, amount_cents, location",
    )
    .order("transacted_date", { ascending: false })
    .limit(5000);

  if (error) {
    const missing = isMissingSchemaError(error);
    return (
      <p className="text-sm text-[var(--color-danger)]" role="alert">
        {missing
          ? "Tolls are not available until the v0.0.0.7 migration is applied."
          : `Could not load tolls. (${error.message})`}
      </p>
    );
  }

  const { data: trucks } = await supabase
    .from("trucks")
    .select("unit_number")
    .order("unit_number");
  const truckUnits = [...new Set((trucks ?? []).map((truck) => truck.unit_number))];
  return <TollsClient rows={data ?? []} truckUnits={truckUnits} />;
}

export default function TollsPage() {
  return (
    <SignedInShell title="Tolls">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <TollsContent />
      </Suspense>
    </SignedInShell>
  );
}
