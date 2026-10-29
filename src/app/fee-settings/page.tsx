import { Suspense } from "react";
import { FeeSettingsClient } from "@/components/fee-settings/fee-settings-client";
import { SignedInShell } from "@/components/signed-in-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { FEE_SETTINGS_MIGRATION } from "@/lib/fees/fee-settings";
import { loadFeeSettings } from "@/lib/fees/load";
import { DEFAULT_TARP_CENTS, TARP_SETTING_KEY } from "@/lib/loads/tarps";
import { centsToDollarString } from "@/lib/money/cents";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function tarpDollars(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("import_settings")
      .select("value_int")
      .eq("key", TARP_SETTING_KEY)
      .maybeSingle();
    const cents = data?.value_int ?? DEFAULT_TARP_CENTS;
    return centsToDollarString(cents >= 0 ? cents : DEFAULT_TARP_CENTS);
  } catch {
    return centsToDollarString(DEFAULT_TARP_CENTS);
  }
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
