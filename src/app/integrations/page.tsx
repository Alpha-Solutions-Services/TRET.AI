import { Suspense } from "react";
import { IntegrationsClient } from "@/components/integrations/integrations-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { checkAccess } from "@/lib/auth/access";
import { isAdminRole } from "@/lib/quickbooks/admin";
import { loadIntegrationsHome } from "@/lib/quickbooks/live";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function IntegrationsContent({ notice }: { notice: string | null }) {
  const access = await checkAccess();
  const isAdmin = access.status === "allowed" && isAdminRole(access.role);
  const supabase = await createClient();
  const home = await loadIntegrationsHome(supabase, isAdmin);
  return <IntegrationsClient home={home} notice={notice} />;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ quickbooks?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignedInShell title="Integrations">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <IntegrationsContent notice={params.quickbooks ?? null} />
      </Suspense>
    </SignedInShell>
  );
}
