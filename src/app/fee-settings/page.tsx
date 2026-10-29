import { Suspense } from "react";
import { FeeSettingsClient } from "@/components/fee-settings/fee-settings-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { FEE_SETTINGS_MIGRATION } from "@/lib/fees/fee-settings";
import { loadFeeSettings } from "@/lib/fees/load";
import { readTarpCentsPerLoad } from "@/lib/loads/tarp-rate";
import { centsToDollarString } from "@/lib/money/cents";

export const dynamic = "force-dynamic";

async function tarpDollars(): Promise<string> {
  return centsToDollarString(await readTarpCentsPerLoad());
}

async function Content() {
  const [loaded, tarp] = await Promise.all([loadFeeSettings(), tarpDollars()]);
  return (
    <FeeSettingsClient
      rows={loaded.rows}
      ready={loaded.ready}
      error={loaded.error}
      migrationMessage={loaded.ready ? null : FEE_SETTINGS_MIGRATION}
      tarpDollars={tarp}
    />
  );
}

export default function FeeSettingsPage() {
  return (
    <SignedInShell title="Fee settings">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <Content />
      </Suspense>
    </SignedInShell>
  );
}
