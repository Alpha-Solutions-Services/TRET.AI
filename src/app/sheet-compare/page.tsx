import { Suspense } from "react";
import { SheetCompareClient } from "@/components/sheets/sheet-compare-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { loadSheetCompare } from "@/lib/sheets/compare-load";
import { resolveWeekStart } from "@/lib/statements/queries";

export const dynamic = "force-dynamic";

async function CompareContent({ week, unit }: { week: string | undefined; unit: string | undefined }) {
  const weekStart = resolveWeekStart(week);
  const bounds = weekBoundsForDate(weekStart);
  const data = await loadSheetCompare({ weekStart: bounds.start, weekEnd: bounds.end, unit });
  return <SheetCompareClient {...data} />;
}

export default async function SheetComparePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; unit?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignedInShell title="Sheet vs Vektor">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <CompareContent week={params.week} unit={params.unit} />
      </Suspense>
    </SignedInShell>
  );
}
