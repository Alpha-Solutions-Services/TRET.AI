import type { OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import { decryptString, encryptString } from "./crypto";
import {
  emptyConnection,
  type PendingAuth,
  type StoredConnection,
  type TokenWrite,
  type VektorTokenStore,
} from "./store";

type RpcResult = { data: unknown; error: { message: string } | null };

export type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function callRpc(
  supabase: RpcClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export function asRpcClient(supabase: {
  rpc: (fn: never, args?: never) => PromiseLike<unknown>;
}): RpcClient {
  return {
    rpc: async (fn, args) => {
      const result = (await supabase.rpc(fn as never, args as never)) as {
        data: unknown;
        error: { message: string } | null;
      };
      return result;
    },
  };
}

export function createSupabaseTokenStore(
  supabase: RpcClient,
  encryptionKey: string,
): VektorTokenStore {
  return {
    async read(): Promise<StoredConnection> {
      const data = asRecord(await callRpc(supabase, "vektor_mcp_read_connection"));
      if (!data) return emptyConnection();
      const clientRaw = asString(data.client_information_enc);
      const accessRaw = asString(data.access_token_enc);
      const refreshRaw = asString(data.refresh_token_enc);
      let clientInformation: OAuthClientInformationMixed | null = null;
      if (clientRaw) {
        clientInformation = JSON.parse(
          decryptString(clientRaw, encryptionKey),
        ) as OAuthClientInformationMixed;
      }
      const expires = asString(data.expires_at);
      const locked = asString(data.refresh_locked_until);
      const status = data.connection_status === "connected" ? "connected" : "needs_sign_in";
      return {
        clientInformation,
        accessToken: accessRaw ? decryptString(accessRaw, encryptionKey) : null,
        refreshToken: refreshRaw ? decryptString(refreshRaw, encryptionKey) : null,
        expiresAt: expires ? new Date(expires) : null,
        scope: asString(data.scope),
        tokenType: asString(data.token_type),
        status,
        refreshLockedUntil: locked ? new Date(locked) : null,
      };
    },

    async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
      await callRpc(supabase, "vektor_mcp_save_client", {
        p_client_information_enc: encryptString(JSON.stringify(info), encryptionKey),
      });
    },

    async saveTokensAtomic(tokens: TokenWrite): Promise<void> {
      await callRpc(supabase, "vektor_mcp_save_tokens", {
        p_access_token_enc: encryptString(tokens.accessToken, encryptionKey),
        p_refresh_token_enc: encryptString(tokens.refreshToken, encryptionKey),
        p_expires_at: tokens.expiresAt.toISOString(),
        p_scope: tokens.scope ?? null,
        p_token_type: tokens.tokenType ?? "Bearer",
      });
    },

    async tryBeginRefresh(leaseMs: number): Promise<boolean> {
      const data = await callRpc(supabase, "vektor_mcp_try_begin_refresh", {
        p_lease_seconds: Math.max(1, Math.ceil(leaseMs / 1000)),
      });
      return data === true;
    },

    async releaseRefresh(): Promise<void> {
      await callRpc(supabase, "vektor_mcp_release_refresh");
    },

    async markNeedsSignIn(): Promise<void> {
      await callRpc(supabase, "vektor_mcp_mark_needs_sign_in");
    },

    async disconnect(): Promise<void> {
      await callRpc(supabase, "vektor_mcp_disconnect");
    },

    async savePending(
      state: string,
      codeVerifier: string,
      redirectUri: string,
      expiresAt: Date,
    ): Promise<void> {
      await callRpc(supabase, "vektor_oauth_save_pending", {
        p_state: state,
        p_code_verifier_enc: encryptString(codeVerifier, encryptionKey),
        p_redirect_uri: redirectUri,
        p_expires_at: expiresAt.toISOString(),
      });
    },

    async takePending(state: string): Promise<PendingAuth | null> {
      const data = await callRpc(supabase, "vektor_oauth_take_pending", {
        p_state: state,
      });
      const row = asRecord(data);
      const enc = row ? asString(row.code_verifier_enc) : null;
      const redirectUri = row ? asString(row.redirect_uri) : null;
      if (!enc || !redirectUri) return null;
      return {
        codeVerifier: decryptString(enc, encryptionKey),
        redirectUri,
      };
    },
  };
}

export type VektorPublicStatus = {
  migrationReady: boolean;
  hasTokens: boolean;
  needsSignIn: boolean;
  status: "connected" | "needs_sign_in";
};

export async function readVektorPublicStatus(
  supabase: RpcClient,
): Promise<VektorPublicStatus> {
  const { data, error } = await supabase.rpc("vektor_mcp_public_status");
  if (error) {
    const missing = /vektor_mcp_public_status|does not exist|schema cache/i.test(
      error.message,
    );
    if (missing) {
      return {
        migrationReady: false,
        hasTokens: false,
        needsSignIn: true,
        status: "needs_sign_in",
      };
    }
    throw new Error(error.message);
  }
  const row = asRecord(data);
  const hasRefresh = row?.has_refresh_token === true;
  const hasAccess = row?.has_access_token === true;
  const connected = row?.connection_status === "connected" && hasRefresh;
  return {
    migrationReady: true,
    hasTokens: hasRefresh || hasAccess,
    needsSignIn: !connected,
    status: connected ? "connected" : "needs_sign_in",
  };
}
