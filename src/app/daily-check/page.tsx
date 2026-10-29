import { Suspense } from "react";
import { DailyCheckClient } from "@/components/daily-check/daily-check-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { compareDailyCheck } from "@/lib/reports/daily-check";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { loadActiveTruckInsOuts } from "@/lib/sheets/load-week";
import { resolveWeekStart } from "@/lib/statements/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function DailyCheckContent({ week }: { week: string | undefined }) {
  const weekStart = resolveWeekStart(week);
  const weekEnd = weekBoundsForDate(weekStart).end;
  const supabase = await createClient();
  const [loads, fuel, tolls, issues, approved, sheets] = await Promise.all([
    supabase
      .from("loads")
      .select("load_id, truck_unit_number, rate_cents, vektor_status")
      .gte("delivery_date", weekStart)
      .lte("delivery_date", weekEnd),
    supabase.from("fuel_transactions").select("unit_number, amount_cents").eq("week_start", weekStart),
    supabase.from("toll_transactions").select("unit_number, amount_cents").eq("week_start", weekStart),
    supabase.from("issues").select("rule, message, status").eq("status", "open"),
    supabase.from("issues").select("id").eq("rule", "daily_check").eq("ref", weekStart).limit(1),
    loadActiveTruckInsOuts(weekStart, weekEnd).catch((err: unknown) => ({
      rows: [],
      error: null as string | null,
      confirmationError: err instanceof Error ? err.message : "TONU confirmations could not be loaded.",
    })),
  ]);
  const summary = compareDailyCheck({
    sheet: (sheets.rows ?? [])
      .filter((row) => row.readable)
      .map((row) => ({
        unitNumber: row.unitNumber,
        loads: row.ledgerLoads
          .filter((load) => load.rateCents != null)
          .map((load) => ({ loadId: load.loadId, grossCents: load.rateCents ?? 0 })),
        grossCents: row.insCents,
        fuelCents: row.categories.find((item) => item.category === "Fuel")?.cents ?? 0,
        tollCents: row.categories.find((item) => item.category === "Toll fees")?.cents ?? 0,
      })),
    loads: (loads.data ?? []).map((row) => ({
      unitNumber: row.truck_unit_number,
      loadId: row.load_id,
      grossCents: row.rate_cents,
      cancelled: /cancel/i.test(row.vektor_status ?? ""),
    })),
    fuel: (fuel.data ?? []).map((row) => ({
      unitNumber: row.unit_number,
      amountCents: row.amount_cents,
      linked: Boolean(row.unit_number),
    })),
    tolls: (tolls.data ?? []).map((row) => ({
      unitNumber: row.unit_number,
      amountCents: row.amount_cents,
    })),
    receiptsFound: (issues.data ?? []).filter((row) => row.rule === "receipt").length,
  });
  const sheetError = sheets.confirmationError ?? sheets.error;
  if (sheetError) summary.truckMismatches.unshift(sheetError);
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
