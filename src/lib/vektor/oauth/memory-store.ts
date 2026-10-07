import type { OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  emptyConnection,
  type PendingAuth,
  type StoredConnection,
  type TokenWrite,
  type VektorTokenStore,
} from "./store";

type PendingRow = PendingAuth & { expiresAt: number };

/** In-memory store for tests. Not used in the app. */
export class MemoryTokenStore implements VektorTokenStore {
  private row: StoredConnection = emptyConnection();
  private pending = new Map<string, PendingRow>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async read(): Promise<StoredConnection> {
    return { ...this.row };
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    this.row = { ...this.row, clientInformation: info };
  }

  async saveTokensAtomic(tokens: TokenWrite): Promise<void> {
    this.row = {
      ...this.row,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope ?? this.row.scope,
      tokenType: tokens.tokenType ?? this.row.tokenType ?? "Bearer",
      status: "connected",
      refreshLockedUntil: null,
    };
  }

  async tryBeginRefresh(leaseMs: number): Promise<boolean> {
    const until = this.row.refreshLockedUntil?.getTime() ?? 0;
    if (until > this.now()) return false;
    this.row = {
      ...this.row,
      refreshLockedUntil: new Date(this.now() + leaseMs),
    };
    return true;
  }

  async releaseRefresh(): Promise<void> {
    this.row = { ...this.row, refreshLockedUntil: null };
  }

  async markNeedsSignIn(): Promise<void> {
    this.row = {
      ...this.row,
      status: "needs_sign_in",
      refreshLockedUntil: null,
    };
  }

  async disconnect(): Promise<void> {
    const clientInformation = this.row.clientInformation;
    this.row = { ...emptyConnection(), clientInformation };
    this.pending.clear();
  }

  async savePending(
    state: string,
    codeVerifier: string,
    redirectUri: string,
    expiresAt: Date,
  ): Promise<void> {
    this.pending.set(state, {
      codeVerifier,
      redirectUri,
      expiresAt: expiresAt.getTime(),
    });
  }

  async takePending(state: string): Promise<PendingAuth | null> {
    const row = this.pending.get(state);
    this.pending.delete(state);
    if (!row) return null;
    if (row.expiresAt <= this.now()) return null;
    return { codeVerifier: row.codeVerifier, redirectUri: row.redirectUri };
  }
}
