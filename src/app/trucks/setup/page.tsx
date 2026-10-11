import { Suspense } from "react";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { loadIdentities } from "@/lib/fuel-tolls/file/context";
import { truckLabel } from "@/lib/fuel-tolls/file/mappings";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function SetupTable() {
  const supabase = await createClient();
  const rows = await loadIdentities(supabase);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Truck setup</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          One row per truck. Fuel cards, plates, and Bestpass tags. A fill or a toll matches these before it is written.
        </p>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-field)]">
        <table className="w-full text-left text-sm">
          <caption className="px-3 py-3 text-left font-medium">Cards, plates, and tags</caption>
          <thead className="border-b border-[var(--color-border)] text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Truck</th>
              <th className="px-3 py-2 font-medium">Fuel cards</th>
              <th className="px-3 py-2 font-medium">Plates</th>
              <th className="px-3 py-2 font-medium">Bestpass tags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.unitNumber} className="border-b border-[var(--color-border)]">
                <td className="px-3 py-2 font-medium">{truckLabel(row.unitNumber)}</td>
                <td className="px-3 py-2 tabular-nums">{row.cards.join(", ") || "None"}</td>
                <td className="px-3 py-2">
                  {row.plates.map((plate) => (plate.state ? `${plate.plate} ${plate.state}` : plate.plate)).join(", ") || "None"}
                </td>
                <td className="px-3 py-2">{row.tags.join(", ") || "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TruckSetupPage() {
  return (
    <SignedInShell title="Truck setup">
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SetupTable />
      </Suspense>
    </SignedInShell>
  );
}
