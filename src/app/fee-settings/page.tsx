import { Suspense } from "react";
import { FeeSettingsClient } from "@/components/fee-settings/fee-settings-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { FEE_SETTINGS_MIGRATION } from "@/lib/fees/fee-settings";
import { loadFeeSettings } from "@/lib/fees/load";

export const dynamic = "force-dynamic";

async function Content() {
  const loaded = await loadFeeSettings();
  return (
    <FeeSettingsClient
      rows={loaded.rows}
      ready={loaded.ready}
      error={loaded.error}
      migrationMessage={loaded.ready ? null : FEE_SETTINGS_MIGRATION}
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
