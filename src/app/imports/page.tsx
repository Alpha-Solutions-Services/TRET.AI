import { Suspense } from "react";
import { ImportsClient } from "@/components/imports/imports-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function ImportsContent() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_runs")
    .select(
      "id, started_at, finished_at, status, range_from, range_to, rows_fetched, rows_promoted, rows_rejected, rows_updated, error_summary",
    )
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) {
    return (
      <p className="text-sm text-red-700" role="alert">
        Could not load import runs. If you just deployed, apply the v0.0.0.4 migration first.
        ({error.message})
      </p>
    );
  }
  return <ImportsClient runs={data ?? []} />;
}

export default function ImportsPage() {
  return (
    <SignedInShell title="Imports">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      >
        <ImportsContent />
      </Suspense>
    </SignedInShell>
  );
}
