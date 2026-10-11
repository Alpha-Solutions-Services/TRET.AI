import { Suspense } from "react";
import { DailyCheckClient } from "@/components/daily-check/daily-check-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { summarizeDailyCheck } from "@/lib/reports/daily-check";
import { resolveWeekStart } from "@/lib/statements/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function DailyCheckContent({ week }: { week: string | undefined }) {
  const weekStart = resolveWeekStart(week);
  const supabase = await createClient();
  const [loads, fuel, tolls, issues, approved] = await Promise.all([
    supabase.from("loads").select("id, vektor_status").gte("delivery_date", weekStart).lte("delivery_date", addDays(weekStart, 6)),
    supabase.from("fuel_transactions").select("id").eq("week_start", weekStart),
    supabase.from("toll_transactions").select("id").eq("week_start", weekStart),
    supabase.from("issues").select("rule, message, status").eq("status", "open"),
    supabase.from("issues").select("id").eq("rule", "daily_check").eq("ref", weekStart).limit(1),
  ]);
  const loadRows = loads.data ?? [];
  const fuelRows = fuel.data ?? [];
  const summary = summarizeDailyCheck({
    loads: loadRows.map((row) => ({
      change: /cancel/i.test(row.vektor_status ?? "") ? "cancelled" : "new",
    })),
    fuel: [
      ...fuelRows.map(() => ({ status: "added" as const })),
      ...(issues.data ?? []).filter((row) => row.rule === "unlinked_fuel").map(() => ({ status: "unlinked" as const })),
    ],
    tollsAdded: tolls.data?.length ?? 0,
    receiptsFound: (issues.data ?? []).filter((row) => row.rule === "receipt").length,
    truckMismatches: (issues.data ?? [])
      .filter((row) => row.rule === "truck_unmatched")
      .map((row) => row.message),
  });
  const error = loads.error?.message ?? fuel.error?.message ?? tolls.error?.message ?? null;
  return (
    <DailyCheckClient
      weekStart={weekStart}
      summary={summary}
      error={error}
      approved={Boolean(approved.data && approved.data.length > 0)}
    />
  );
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function DailyCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignedInShell title="Daily check">
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <DailyCheckContent week={params.week} />
      </Suspense>
    </SignedInShell>
  );
}
