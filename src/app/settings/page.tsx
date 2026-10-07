import { Suspense } from "react";
import { getImportSourceSettings } from "@/app/settings/actions";
import { missingGoogleServiceAccountEnv } from "@/lib/sheets/read";
import { SettingsClient } from "@/components/settings/settings-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

async function SettingsContent({ notice }: { notice?: string | null }) {
  const initial = await getImportSourceSettings();
  return (
    <SettingsClient
      initial={initial}
      notice={notice}
      sheetEnvMissing={missingGoogleServiceAccountEnv()}
    />
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ vektor?: string }>;
}) {
  const params = await searchParams;
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
        <SettingsContent notice={params.vektor ?? null} />
      </Suspense>
    </SignedInShell>
  );
}
