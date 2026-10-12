import { Suspense } from "react";
import { PageLoadError } from "@/components/page-load-error";
import { PageRecovery } from "@/components/page-recovery";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatementsClient } from "@/components/statements/statements-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { loadStatements, resolveWeekStart } from "@/lib/statements/queries";

export const dynamic = "force-dynamic";

async function StatementsContent({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const weekStart = resolveWeekStart(params.week);
  try {
    const data = await loadStatements(weekStart);
    return (
      <PageRecovery>
        <StatementsClient key={data.weekStart} data={data} />
      </PageRecovery>
    );
  } catch {
    try {
      const data = await loadStatements(weekStart);
      return (
        <PageRecovery>
          <StatementsClient key={data.weekStart} data={data} />
        </PageRecovery>
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "This page did not load.";
      return <PageLoadError message={message} />;
    }
  }
}

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  return (
    <SignedInShell title="Statements">
      <Suspense fallback={<PageSkeleton label="Loading statements." />}>
        <StatementsContent searchParams={searchParams} />
      </Suspense>
    </SignedInShell>
  );
}
