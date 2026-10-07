import { Suspense } from "react";
import { getImportSourceSettings } from "@/app/settings/actions";
import { SettingsClient } from "@/components/settings/settings-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

async function SettingsContent() {
  const initial = await getImportSourceSettings();
  return <SettingsClient initial={initial} />;
}

export default function SettingsPage() {
  return (
    <SignedInShell title="Settings">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <SettingsContent />
      </Suspense>
    </SignedInShell>
  );
}
