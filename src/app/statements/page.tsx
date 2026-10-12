import { Suspense } from "react";
import { PageLoadError } from "@/components/page-load-error";
import { PageRecovery } from "@/components/page-recovery";
import { StatementsClient } from "@/components/statements/statements-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { loadStatements, resolveWeekStart } from "@/lib/statements/queries";

export const dynamic = "force-dynamic";

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

async function StatementsContent({ week }: { week: string | undefined }) {
  const weekStart = resolveWeekStart(week);
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
  const params = await searchParams;
  return (
    <SignedInShell title="Statements">
      <Suspense fallback={<PageSkeleton />}>
        <StatementsContent week={params.week} />
      </Suspense>
    </SignedInShell>
  );
}
