import { Suspense } from "react";
import { OperatingExpensesClient } from "@/components/operating-expenses/operating-expenses-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonthUtc, parseMonth } from "@/lib/legacy/expenses";
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

async function OperatingExpensesContent({ month }: { month: string }) {
  const list = await listOperatingExpenses(month);
  return <OperatingExpensesClient list={list} month={month} />;
}

export default async function OperatingExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.month) ?? currentMonthUtc();
  return (
    <SignedInShell title="Legacy expenses">
      <Suspense fallback={<PageSkeleton />}>
        <OperatingExpensesContent month={month} />
      </Suspense>
    </SignedInShell>
  );
}
