import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAdapters,
  getSelectableAdapter,
  type ImportSourceAdapter,
  type ImportSourceId,
} from "@/lib/vektor/adapters";
import { fetchManifestsFromTools } from "@/lib/vektor/mcp/fetch-manifests";
import { withVektorMcp } from "@/lib/vektor/mcp/live";
import { readTokenEncryptionKey } from "@/lib/vektor/oauth/crypto";
import { getValidAccessToken } from "@/lib/vektor/oauth/refresh";
import { refreshStoredAccessToken } from "@/lib/vektor/oauth/live-refresh";
import {
  asRpcClient,
  createSupabaseTokenStore,
  readVektorPublicStatus,
  type VektorPublicStatus,
} from "@/lib/vektor/oauth/supabase-store";
import type { Database } from "@/lib/supabase/database.types";

export async function loadImportRegistry(
  supabase: SupabaseClient<Database>,
  opts?: { withLiveFetch?: boolean },
): Promise<{
  adapters: ImportSourceAdapter[];
  selected: ImportSourceId | null;
  adapter: ImportSourceAdapter | null;
  vektor: VektorPublicStatus;
  mcpVerified: boolean;
}> {
  const { data: rows } = await supabase
    .from("import_settings")
    .select("key, value_text")
    .in("key", ["import_source", "mcp_verified", "csv_column_mapping"]);
  const map = new Map((rows ?? []).map((row) => [row.key, row.value_text]));
  let csvMapping: Record<string, string> | null = null;
  if (map.get("csv_column_mapping")) {
    try {
      csvMapping = JSON.parse(map.get("csv_column_mapping")!) as Record<string, string>;
    } catch {
      csvMapping = null;
    }
  }
  const vektor = await readVektorPublicStatus(asRpcClient(supabase));
  const mcpVerified = map.get("mcp_verified") === "true" && !vektor.needsSignIn;
  let mcpFetchManifests: ImportSourceAdapter["fetchManifests"] | undefined;
  if (opts?.withLiveFetch && vektor.hasTokens && !vektor.needsSignIn && mcpVerified) {
    const rpc = asRpcClient(supabase);
    mcpFetchManifests = async (input) => {
      const store = createSupabaseTokenStore(rpc, readTokenEncryptionKey());
      const accessToken = await getValidAccessToken({
        store,
        refresh: (refreshToken) => refreshStoredAccessToken(store, refreshToken),
      });
      const connection = await store.read();
      return withVektorMcp({
        accessToken,
        clientInformation: connection.clientInformation,
        run: ({ callTool, listTools }) =>
          fetchManifestsFromTools({ ...input, callTool, listTools }),
      });
    };
  }
  const adapters = createAdapters({
    mcpVerified,
    mcpHasTokens: vektor.hasTokens,
    mcpNeedsSignIn: vektor.needsSignIn,
    mcpFetchManifests,
    csvColumnMapping: csvMapping,
    apiBaseUrl: process.env.VEKTOR_API_BASE_URL ?? "",
    apiToken: process.env.VEKTOR_API_TOKEN ?? "",
  });
  const selected = (map.get("import_source") as ImportSourceId | null) ?? null;
  return {
    adapters,
    selected,
    adapter: getSelectableAdapter(adapters, selected),
    vektor,
    mcpVerified,
  };
}
