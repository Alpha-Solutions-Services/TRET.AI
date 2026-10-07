import { Suspense } from "react";
import { CopyableError } from "@/components/copyable-error";
import { HealthSkeleton } from "@/components/health-skeleton";
import { SignedInShell } from "@/components/signed-in-shell";
import { sheetsAccountHealth } from "@/lib/sheets/private-key";
import { createClient } from "@/lib/supabase/server";
import { readAppVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

async function HealthContent() {
  const version = readAppVersion();
  const sheets = sheetsAccountHealth();
  let databaseStatus: "OK" | "FAILED" = "FAILED";

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("allowed_users").select("email").limit(1);
    databaseStatus = error ? "FAILED" : "OK";
  } catch {
    databaseStatus = "FAILED";
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-[var(--color-fg-muted)]">App version</dt>
          <dd className="font-medium">{version}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--color-fg-muted)]">Database connection</dt>
          <dd className="font-medium">{databaseStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--color-fg-muted)]">Sheet account</dt>
          <dd className="font-medium">{sheets.summary}</dd>
        </div>
      </dl>
      {sheets.formatDetail ? (
        <CopyableError
          headline="Google private key on the server is the wrong format"
          detail={sheets.formatDetail}
        />
      ) : null}
    </section>
  );
}

export default function HealthPage() {
  return (
    <SignedInShell title="Health">
      <Suspense fallback={<HealthSkeleton />}>
        <HealthContent />
      </Suspense>
    </SignedInShell>
  );
}
