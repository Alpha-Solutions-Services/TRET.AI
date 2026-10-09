import { Suspense } from "react";
import { OperatingExpensesClient } from "@/components/operating-expenses/operating-expenses-client";
import { TolsonPayments } from "@/components/operating-expenses/tolson-payments";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonthUtc, parseMonth } from "@/lib/legacy/expenses";
import { loadTolsonWeek } from "@/lib/legacy/tolson-payments";
import { listOperatingExpenses } from "@/lib/operating-expenses/queries";
import { resolveWeekStart } from "@/lib/statements/queries";

export const dynamic = "force-dynamic";

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

async function OperatingExpensesContent({ month, week }: { month: string; week?: string }) {
  const weekStart = resolveWeekStart(week);
  const [list, tolson] = await Promise.all([listOperatingExpenses(month), loadTolsonWeek(weekStart)]);
  return (
    <div className="space-y-8">
      <TolsonPayments balance={tolson} />
      <OperatingExpensesClient list={list} month={month} />
    </div>
  );
}

export default async function OperatingExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.month) ?? currentMonthUtc();
  return (
    <SignedInShell title="Legacy expenses">
      <Suspense fallback={<PageSkeleton />}>
        <OperatingExpensesContent month={month} week={params.week} />
      </Suspense>
    </SignedInShell>
  );
}
