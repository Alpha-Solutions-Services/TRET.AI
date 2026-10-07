import { Suspense } from "react";
import { FuelClient } from "@/components/fuel/fuel-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function FuelContent() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fuel_transactions")
    .select(
      "id, vektor_transaction_id, unit_number, transacted_date, week_start, product, card, gallons_milli, amount_cents, retail_amount_cents",
    )
    .order("transacted_date", { ascending: false })
    .limit(5000);

  if (error) {
    const missing = isMissingSchemaError(error);
    return (
      <p className="text-sm text-red-700" role="alert">
        {missing
          ? "Fuel is not available until the v0.0.0.7 migration is applied."
          : `Could not load fuel. (${error.message})`}
      </p>
    );
  }

  const { data: trucks } = await supabase
    .from("trucks")
    .select("unit_number")
    .order("unit_number");
  const truckUnits = [...new Set((trucks ?? []).map((truck) => truck.unit_number))];
  return <FuelClient rows={data ?? []} truckUnits={truckUnits} />;
}

export default function FuelPage() {
  return (
    <SignedInShell title="Fuel">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <FuelContent />
      </Suspense>
    </SignedInShell>
  );
}
