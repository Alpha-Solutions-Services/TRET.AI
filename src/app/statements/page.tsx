import { Suspense } from "react";
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
  const data = await loadStatements(weekStart);
  return <StatementsClient key={data.weekStart} data={data} />;
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
