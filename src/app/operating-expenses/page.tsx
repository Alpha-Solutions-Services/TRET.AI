import { Suspense } from "react";
import { OperatingExpensesClient } from "@/components/operating-expenses/operating-expenses-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { listOperatingExpenses } from "@/lib/operating-expenses/queries";

export const dynamic = "force-dynamic";

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

async function OperatingExpensesContent() {
  const list = await listOperatingExpenses();
  return <OperatingExpensesClient list={list} />;
}

export default function OperatingExpensesPage() {
  return (
    <SignedInShell title="Operating expenses">
      <Suspense fallback={<PageSkeleton />}>
        <OperatingExpensesContent />
      </Suspense>
    </SignedInShell>
  );
}
