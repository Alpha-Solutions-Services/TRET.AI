import {
  discoverOAuthServerInfo,
  refreshAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { VEKTOR_MCP_URL } from "./flow";
import { NeedsSignInError } from "./needs-sign-in";
import type { TokenWrite, VektorTokenStore } from "./store";

export async function refreshStoredAccessToken(
  store: VektorTokenStore,
  refreshToken: string,
): Promise<TokenWrite> {
  const row = await store.read();
  if (!row.clientInformation) {
    throw new NeedsSignInError();
  }
  const info = await discoverOAuthServerInfo(VEKTOR_MCP_URL);
  const tokens = await refreshAuthorization(info.authorizationServerUrl, {
    metadata: info.authorizationServerMetadata,
    clientInformation: row.clientInformation,
    refreshToken,
    resource: info.resourceMetadata?.resource,
  });
  if (!tokens.access_token) {
    throw new NeedsSignInError();
  }
  const expiresIn = tokens.expires_in ?? 3600;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: tokens.scope ?? row.scope,
    tokenType: tokens.token_type || "Bearer",
  };
}
