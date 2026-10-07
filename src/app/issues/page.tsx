import { Suspense } from "react";
import { IssuesClient } from "@/components/issues/issues-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { loadIssuesPage } from "@/lib/issues/queries";

export const dynamic = "force-dynamic";

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

async function IssuesContent({
  week,
  severity,
  status,
}: {
  week: string | undefined;
  severity: string | undefined;
  status: string | undefined;
}) {
  const data = await loadIssuesPage(week);
  return <IssuesClient key={data.weekStart} data={data} severity={severity} status={status} />;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; severity?: string; status?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignedInShell title="Issues">
      <Suspense fallback={<PageSkeleton />}>
        <IssuesContent week={params.week} severity={params.severity} status={params.status} />
      </Suspense>
    </SignedInShell>
  );
}
