import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchFuelAndTollsFromTools } from "@/lib/vektor/mcp/fetch-fuel-tolls";
import { withVektorMcp } from "@/lib/vektor/mcp/live";
import { readTokenEncryptionKey } from "@/lib/vektor/oauth/crypto";
import { getValidAccessToken } from "@/lib/vektor/oauth/refresh";
import { refreshStoredAccessToken } from "@/lib/vektor/oauth/live-refresh";
import {
  asRpcClient,
  createSupabaseTokenStore,
} from "@/lib/vektor/oauth/supabase-store";

export async function fetchFuelAndTollsLive(
  supabase: SupabaseClient<Database>,
  range: { from: string; to: string },
) {
  const rpc = asRpcClient(supabase);
  const store = createSupabaseTokenStore(rpc, readTokenEncryptionKey());
  const accessToken = await getValidAccessToken({
    store,
    refresh: (refreshToken) => refreshStoredAccessToken(store, refreshToken),
  });
  const connection = await store.read();
  return withVektorMcp({
    accessToken,
    clientInformation: connection.clientInformation,
    run: ({ callTool, listToolNames }) =>
      fetchFuelAndTollsFromTools({ ...range, callTool, listToolNames }),
  });
}
