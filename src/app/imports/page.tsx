import { Suspense } from "react";
import { ImportsClient } from "@/components/imports/imports-client";
import { Waveform } from "@/components/motion/waveform";
import { SignedInShell } from "@/components/signed-in-shell";
import { createClient } from "@/lib/supabase/server";
import { loadImportRegistry } from "@/lib/vektor/import-registry";

export const dynamic = "force-dynamic";

async function ImportsContent() {
  const supabase = await createClient();
  // Prefer source column (additive migration); fall back until go.
  const withSource = await supabase
    .from("import_runs")
    .select(
      "id, started_at, finished_at, status, source, kind, range_from, range_to, rows_fetched, rows_promoted, rows_rejected, rows_updated, error_summary",
    )
    .order("started_at", { ascending: false })
    .limit(50);
  let data = withSource.data;
  let error = withSource.error;
  if (error && /kind/i.test(error.message)) {
    const withoutKind = await supabase
      .from("import_runs")
      .select(
        "id, started_at, finished_at, status, source, range_from, range_to, rows_fetched, rows_promoted, rows_rejected, rows_updated, error_summary",
      )
      .order("started_at", { ascending: false })
      .limit(50);
    data = (withoutKind.data ?? []).map((row) => ({ ...row, kind: null }));
    error = withoutKind.error;
  }
  if (error && /source/i.test(error.message)) {
    const fallback = await supabase
      .from("import_runs")
      .select(
        "id, started_at, finished_at, status, range_from, range_to, rows_fetched, rows_promoted, rows_rejected, rows_updated, error_summary",
      )
      .order("started_at", { ascending: false })
      .limit(50);
    data = (fallback.data ?? []).map((r) => ({ ...r, source: null, kind: null }));
    error = fallback.error;
  }
  if (error) {
    return (
      <p className="text-sm text-[var(--color-danger)]" role="alert">
        Could not load import runs. If you just deployed, apply the v0.0.0.4 migration first.
        ({error.message})
      </p>
    );
  }
  const registry = await loadImportRegistry(supabase);
  return <ImportsClient runs={data ?? []} source={registry.selected} />;
}

export default function ImportsPage() {
  return (
    <SignedInShell title="Imports">
      <Suspense
        fallback={
          <div className="h-16" aria-busy="true">
            <Waveform label="Loading imports" />
          </div>
        }
      >
        <ImportsContent />
      </Suspense>
    </SignedInShell>
  );
}
