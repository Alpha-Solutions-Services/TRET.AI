"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { tryPercentStringToBp } from "@/lib/fees/percent";
import { createClient } from "@/lib/supabase/server";
import type { ImportSourceId } from "@/lib/vektor/adapters";
import { VEKTOR_CSV_PRESET } from "@/lib/vektor/csv-loads";
import { loadImportRegistry } from "@/lib/vektor/import-registry";
import { probeVektorConnection, withVektorMcp } from "@/lib/vektor/mcp/live";
import { readTokenEncryptionKey, TOKEN_ENCRYPTION_ENV } from "@/lib/vektor/oauth/crypto";
import { refreshStoredAccessToken } from "@/lib/vektor/oauth/live-refresh";
import { NeedsSignInError, safeErrorMessage } from "@/lib/vektor/oauth/needs-sign-in";
import { getValidAccessToken } from "@/lib/vektor/oauth/refresh";
import {
  asRpcClient,
  createSupabaseTokenStore,
} from "@/lib/vektor/oauth/supabase-store";

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export type VektorSettingsStatus = {
  migrationReady: boolean;
  status: "connected" | "needs_sign_in";
  verified: boolean;
};

export async function getImportSourceSettings(): Promise<{
  selected: ImportSourceId | null;
  vektor: VektorSettingsStatus;
  adapters: Array<{
    id: ImportSourceId;
    label: string;
    selectable: boolean;
    configured: boolean;
    message: string;
  }>;
}> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return {
      selected: null,
      vektor: { migrationReady: false, status: "needs_sign_in", verified: false },
      adapters: [],
    };
  }

  const supabase = await createClient();
  const registry = await loadImportRegistry(supabase);
  return {
    selected: registry.selected,
    vektor: {
      migrationReady: registry.vektor.migrationReady,
      status: registry.vektor.status,
      verified: registry.mcpVerified,
    },
    adapters: registry.adapters.map((adapter) => {
      const status = adapter.status();
      return {
        id: status.id,
        label: status.label,
        selectable: status.selectable,
        configured: status.configured,
        message: status.message,
      };
    }),
  };
}

export async function setImportSourceAction(
  source: ImportSourceId | "",
): Promise<SettingsActionResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false, error: "You must be signed in." };
  }

  const supabase = await createClient();
  const current = await getImportSourceSettings();

  if (source === "") {
    await supabase.from("import_settings").upsert({
      key: "import_source",
      value_text: null,
      updated_at: new Date().toISOString(),
    });
    revalidatePath("/settings");
    revalidatePath("/imports");
    return { ok: true };
  }

  const target = current.adapters.find((adapter) => adapter.id === source);
  if (!target?.selectable) {
    return {
      ok: false,
      error: target?.message ?? "That import source cannot be selected.",
    };
  }

  await supabase.from("import_settings").upsert({
    key: "import_source",
    value_text: source,
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/settings");
  revalidatePath("/imports");
  return { ok: true };
}

export async function disconnectVektorAction(): Promise<SettingsActionResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false, error: "You must be signed in." };
  }
  const supabase = await createClient();
  const { error } = await asRpcClient(supabase).rpc("vektor_mcp_disconnect");
  if (error) {
    if (/vektor_mcp_disconnect|does not exist|schema cache/i.test(error.message)) {
      return {
        ok: false,
        error: "Apply the v0.0.0.5 database migration before disconnecting Vektor.",
      };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }
  revalidatePath("/settings");
  revalidatePath("/imports");
  return { ok: true };
}

export async function testVektorConnectionAction(): Promise<SettingsActionResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false, error: "You must be signed in." };
  }
  const supabase = await createClient();
  const registry = await loadImportRegistry(supabase);
  if (!registry.vektor.migrationReady) {
    return {
      ok: false,
      error: "Apply the v0.0.0.5 database migration, then click Connect Vektor.",
    };
  }
  if (!registry.vektor.hasTokens || registry.vektor.needsSignIn) {
    return { ok: false, error: "Vektor connection needs sign-in" };
  }
  try {
    readTokenEncryptionKey();
  } catch {
    return {
      ok: false,
      error: `Set ${TOKEN_ENCRYPTION_ENV} on the server, then click Connect Vektor again.`,
    };
  }
  const store = createSupabaseTokenStore(asRpcClient(supabase), readTokenEncryptionKey());
  try {
    const accessToken = await getValidAccessToken({
      store,
      refresh: (refreshToken) => refreshStoredAccessToken(store, refreshToken),
    });
    const connection = await store.read();
    await withVektorMcp({
      accessToken,
      clientInformation: connection.clientInformation,
      run: (tools) => probeVektorConnection(tools),
    });
    await supabase.from("import_settings").upsert({
      key: "mcp_verified",
      value_text: "true",
      updated_at: new Date().toISOString(),
    });
    revalidatePath("/settings");
    revalidatePath("/imports");
    return { ok: true };
  } catch (err) {
    if (err instanceof NeedsSignInError) {
      await supabase.from("import_settings").upsert({
        key: "mcp_verified",
        value_text: "false",
        updated_at: new Date().toISOString(),
      });
      revalidatePath("/settings");
      return { ok: false, error: "Vektor connection needs sign-in" };
    }
    return { ok: false, error: safeErrorMessage(err) };
  }
}

export async function saveVektorCsvPresetAction(): Promise<SettingsActionResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false, error: "You must be signed in." };
  const supabase = await createClient();
  const { error } = await supabase.from("import_settings").upsert({
    key: "csv_column_mapping",
    value_text: JSON.stringify(VEKTOR_CSV_PRESET),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/imports");
  return { ok: true };
}

export async function setLegacyManagementFeeAction(percent: string): Promise<SettingsActionResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false, error: "You must be signed in." };
  const parsed = tryPercentStringToBp(percent);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_legacy_management_fee_bp", { p_fee_bp: parsed.bp });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/ins-outs");
  return { ok: true };
}
