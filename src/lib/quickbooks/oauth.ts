export const INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";

export type IntuitTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  tokenType: string;
};

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
  error?: string;
};

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(INTUIT_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPE);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function tokensFromJson(body: TokenJson, now: number, previousRefresh?: string): IntuitTokens {
  if (!body.access_token || !(body.refresh_token || previousRefresh)) {
    throw new Error("QuickBooks did not return tokens");
  }
  const expiresIn = body.expires_in ?? 3600;
  const refreshIn = body.x_refresh_token_expires_in ?? 8_726_400;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || previousRefresh || "",
    expiresAt: new Date(now + expiresIn * 1000),
    refreshExpiresAt: new Date(now + refreshIn * 1000),
    tokenType: body.token_type || "bearer",
  };
}

async function postToken(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch,
): Promise<IntuitTokens> {
  const response = await fetchImpl(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as TokenJson;
  if (!response.ok || json.error) {
    throw new Error("QuickBooks did not finish sign-in");
  }
  return tokensFromJson(json, Date.now());
}

export async function exchangeAuthCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<IntuitTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  return postToken(body, input.clientId, input.clientSecret, input.fetchImpl ?? fetch);
}

export async function refreshAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<IntuitTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(input.clientId, input.clientSecret),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as TokenJson;
  if (!response.ok || json.error || !json.access_token) {
    throw new Error("QuickBooks needs to be connected again");
  }
  return tokensFromJson(json, input.now ?? Date.now(), input.refreshToken);
}
