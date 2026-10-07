import { randomBytes } from "node:crypto";
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
  type OAuthServerInfo,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { VektorTokenStore } from "./store";

export const VEKTOR_MCP_URL = "https://mcp.vektortms.com/mcp";

export function vektorClientMetadata(redirectUri: string): OAuthClientMetadata {
  return {
    redirect_uris: [redirectUri as OAuthClientMetadata["redirect_uris"][number]],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: "TRET.AI",
    scope: "read",
  } as OAuthClientMetadata;
}

export function oauthRedirectUri(requestUrl: string): string {
  const configured = (process.env.VEKTOR_OAUTH_REDIRECT_URI ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(requestUrl);
  return `${url.origin}/api/vektor/oauth/callback`;
}

function clientMatchesRedirect(
  info: OAuthClientInformationMixed,
  redirectUri: string,
): boolean {
  const uris = (info as { redirect_uris?: string[] }).redirect_uris;
  return Array.isArray(uris) && uris.includes(redirectUri);
}

function randomState(): string {
  return randomBytes(24).toString("base64url");
}

type DiscoverFn = (serverUrl: string) => Promise<OAuthServerInfo>;
type RegisterFn = (
  authorizationServerUrl: string,
  opts: {
    metadata?: OAuthServerInfo["authorizationServerMetadata"];
    clientMetadata: OAuthClientMetadata;
    scope?: string;
  },
) => Promise<OAuthClientInformationFull>;
type StartFn = typeof startAuthorization;
type ExchangeFn = typeof exchangeAuthorization;

/**
 * PKCE + dynamic client registration. Returns the browser authorization URL.
 * The code verifier is stored encrypted by the token store and is not part of the URL we log
 * (this function does not log).
 */
export async function beginVektorAuthorization(opts: {
  redirectUri: string;
  store: VektorTokenStore;
  discover?: DiscoverFn;
  register?: RegisterFn;
  start?: StartFn;
  createState?: () => string;
}): Promise<string> {
  const discover = opts.discover ?? ((url) => discoverOAuthServerInfo(url));
  const register = opts.register ?? registerClient;
  const start = opts.start ?? startAuthorization;
  const info = await discover(VEKTOR_MCP_URL);
  const metadata = info.authorizationServerMetadata;
  if (!metadata?.authorization_endpoint || !info.authorizationServerUrl) {
    throw new Error("Vektor authorization server metadata is missing");
  }

  const current = await opts.store.read();
  let client = current.clientInformation;
  if (!client || !clientMatchesRedirect(client, opts.redirectUri)) {
    client = await register(info.authorizationServerUrl, {
      metadata,
      clientMetadata: vektorClientMetadata(opts.redirectUri),
      scope: "read",
    });
    await opts.store.saveClientInformation(client);
  }

  const state = (opts.createState ?? randomState)();
  const started = await start(info.authorizationServerUrl, {
    metadata,
    clientInformation: client,
    redirectUrl: opts.redirectUri,
    scope: "read",
    state,
    resource: info.resourceMetadata?.resource,
  });
  await opts.store.savePending(
    state,
    started.codeVerifier,
    opts.redirectUri,
    new Date(Date.now() + 10 * 60 * 1000),
  );
  return started.authorizationUrl.toString();
}

export async function completeVektorAuthorization(opts: {
  code: string;
  state: string;
  store: VektorTokenStore;
  discover?: DiscoverFn;
  exchange?: ExchangeFn;
}): Promise<void> {
  if (!opts.code || !opts.state) {
    throw new Error("SIGN_IN_FAILED");
  }
  const pending = await opts.store.takePending(opts.state);
  if (!pending) {
    throw new Error("SIGN_IN_EXPIRED");
  }
  const row = await opts.store.read();
  if (!row.clientInformation) {
    throw new Error("SIGN_IN_FAILED");
  }
  const discover = opts.discover ?? ((url) => discoverOAuthServerInfo(url));
  const exchange = opts.exchange ?? exchangeAuthorization;
  const info = await discover(VEKTOR_MCP_URL);
  const tokens: OAuthTokens = await exchange(info.authorizationServerUrl, {
    metadata: info.authorizationServerMetadata,
    clientInformation: row.clientInformation,
    authorizationCode: opts.code,
    codeVerifier: pending.codeVerifier,
    redirectUri: pending.redirectUri,
    resource: info.resourceMetadata?.resource,
  });
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("SIGN_IN_FAILED");
  }
  const expiresIn = tokens.expires_in ?? 3600;
  await opts.store.saveTokensAtomic({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: tokens.scope ?? "read",
    tokenType: tokens.token_type || "Bearer",
  });
}
