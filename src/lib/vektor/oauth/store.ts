import type { OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";

export type ConnectionStatus = "connected" | "needs_sign_in";

export type StoredConnection = {
  clientInformation: OAuthClientInformationMixed | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  status: ConnectionStatus;
  refreshLockedUntil: Date | null;
};

export type TokenWrite = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string | null;
  tokenType?: string | null;
};

export type PendingAuth = {
  codeVerifier: string;
  redirectUri: string;
};

/**
 * Token and PKCE storage. Implementations must not log secrets.
 * The Supabase implementation stores ciphertext only.
 */
export interface VektorTokenStore {
  read(): Promise<StoredConnection>;
  saveClientInformation(info: OAuthClientInformationMixed): Promise<void>;
  saveTokensAtomic(tokens: TokenWrite): Promise<void>;
  tryBeginRefresh(leaseMs: number): Promise<boolean>;
  releaseRefresh(): Promise<void>;
  markNeedsSignIn(): Promise<void>;
  disconnect(): Promise<void>;
  savePending(
    state: string,
    codeVerifier: string,
    redirectUri: string,
    expiresAt: Date,
  ): Promise<void>;
  takePending(state: string): Promise<PendingAuth | null>;
}

export function emptyConnection(): StoredConnection {
  return {
    clientInformation: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scope: null,
    tokenType: null,
    status: "needs_sign_in",
    refreshLockedUntil: null,
  };
}
