import { Suspense } from "react";
import { OverviewSkeleton } from "@/components/overview-skeleton";
import { SignedInShell } from "@/components/signed-in-shell";

export const dynamic = "force-dynamic";

function OverviewContent() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="max-w-prose text-[var(--color-fg-muted)]">
        Nothing to show on this page yet. Open Statements for the weekly figures.
      </p>
    </section>
  );
}

export default function HomePage() {
  return (
    <SignedInShell title="Overview">
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </SignedInShell>
  );
}
