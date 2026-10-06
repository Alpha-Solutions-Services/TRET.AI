import { Suspense } from "react";
import { SignedInShell } from "@/components/signed-in-shell";
import { TrucksClient } from "@/components/trucks/trucks-client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  currentContract,
  listContractsForTruck,
  listTrucks,
  summarizeRules,
} from "@/lib/trucks/queries";

export const dynamic = "force-dynamic";

function TrucksSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

async function TrucksContent() {
  const trucks = await listTrucks();
  const feeSummaries: Record<string, string> = {};
  await Promise.all(
    trucks.map(async (truck) => {
      const contracts = await listContractsForTruck(truck.id);
      const current = currentContract(contracts);
      feeSummaries[truck.id] = current
        ? summarizeRules(current.fee_rules)
        : "No fee rules yet";
    }),
  );
  return <TrucksClient trucks={trucks} feeSummaries={feeSummaries} />;
}

export default function TrucksPage() {
  return (
    <SignedInShell title="Trucks">
      <Suspense fallback={<TrucksSkeleton />}>
        <TrucksContent />
      </Suspense>
    </SignedInShell>
  );
}
