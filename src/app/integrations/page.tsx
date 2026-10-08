import { Suspense } from "react";
import { AiStatusCard } from "@/components/integrations/ai-status";
import { FileQuickbooksClient } from "@/components/integrations/file-quickbooks-client";
import { IntegrationsClient } from "@/components/integrations/integrations-client";
import { ConnectionMap } from "@/components/motion/connection-map";
import { Waveform } from "@/components/motion/waveform";
import {
  quickbooksApiTone,
  quickbooksFileTone,
  sheetsTone,
  vektorTone,
} from "@/components/motion/tones";
import { SignedInShell } from "@/components/signed-in-shell";
import { checkAccess } from "@/lib/auth/access";
import { readAiStatus } from "@/lib/llm-gateway/gemini";
import { isAdminRole } from "@/lib/quickbooks/admin";
import { quickbooksApiEnabled } from "@/lib/quickbooks/api-flag";
import { loadFileQuickbooksHome } from "@/lib/quickbooks/file-home";
import { loadIntegrationsHome } from "@/lib/quickbooks/live";
import { sheetsAccountHealth } from "@/lib/sheets/private-key";
import { createClient } from "@/lib/supabase/server";
import { asRpcClient, readVektorPublicStatus } from "@/lib/vektor/oauth/supabase-store";

export const dynamic = "force-dynamic";

async function IntegrationsContent({ notice }: { notice: string | null }) {
  const access = await checkAccess();
  const isAdmin = access.status === "allowed" && isAdminRole(access.role);
  const status = await readAiStatus(process.env);
  const supabase = await createClient();
  let vektor: ReturnType<typeof vektorTone> = "not_set";
  try {
    const pub = await readVektorPublicStatus(asRpcClient(supabase));
    vektor = vektorTone(pub.status);
  } catch {
    vektor = "not_set";
  }
  const sheets = sheetsTone(sheetsAccountHealth().summary);
  if (!quickbooksApiEnabled()) {
    const home = await loadFileQuickbooksHome();
    return (
      <div className="space-y-8">
        <ConnectionMap
          vektor={vektor}
          sheets={sheets}
          quickbooks={quickbooksFileTone(home.accounts)}
          gemini={status}
        />
        <AiStatusCard status={status} />
        <FileQuickbooksClient home={home} isAdmin={isAdmin} />
      </div>
    );
  }
  const home = await loadIntegrationsHome(supabase, isAdmin);
  return (
    <div className="space-y-8">
      <ConnectionMap
        vektor={vektor}
        sheets={sheets}
        quickbooks={quickbooksApiTone(home.connection?.status)}
        gemini={status}
      />
      <AiStatusCard status={status} />
      <IntegrationsClient home={home} notice={notice} />
    </div>
  );
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
          <div className="h-16" aria-busy="true">
            <Waveform label="Checking AI status" />
          </div>
        }
      >
        <IntegrationsContent notice={params.quickbooks ?? null} />
      </Suspense>
    </SignedInShell>
  );
}
