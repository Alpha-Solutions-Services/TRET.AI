import type { QuickbooksEnvironment } from "@/lib/quickbooks/config";
import { refreshAccessToken, type IntuitTokens } from "@/lib/quickbooks/oauth";

const SKEW_MS = 120_000;

export type StoredQuickbooks = {
  realmId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  environment: QuickbooksEnvironment | null;
  status: "connected" | "needs_sign_in";
  refreshLockedUntil: Date | null;
};

export type QuickbooksTokenWrite = {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  environment: QuickbooksEnvironment;
};

export type QuickbooksTokenStore = {
  read(): Promise<StoredQuickbooks>;
  saveTokens(tokens: QuickbooksTokenWrite): Promise<void>;
  tryBeginRefresh(leaseMs: number): Promise<boolean>;
  releaseRefresh(): Promise<void>;
  markNeedsSignIn(): Promise<void>;
};

function stillValid(expiresAt: Date | null, now: number): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now > SKEW_MS;
}

/**
 * Returns a usable access token. Refreshes under the store lock when the access token is near expiry.
 * Intuit rotates the refresh token, so both tokens are saved together.
 */
export async function getValidAccessToken(opts: {
  store: QuickbooksTokenStore;
  clientId: string;
  clientSecret: string;
  environment: QuickbooksEnvironment;
  refresh?: (refreshToken: string) => Promise<IntuitTokens>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  force?: boolean;
}): Promise<{ accessToken: string; realmId: string }> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const refresh =
    opts.refresh ??
    ((refreshToken: string) =>
      refreshAccessToken({
        clientId: opts.clientId,
        clientSecret: opts.clientSecret,
        refreshToken,
        now: now(),
      }));

  const initial = await opts.store.read();
  if (initial.environment && initial.environment !== opts.environment) {
    throw new Error("The server environment does not match the company you connected. Connect again.");
  }
  if (
    !opts.force &&
    initial.status === "connected" &&
    initial.accessToken &&
    initial.realmId &&
    stillValid(initial.expiresAt, now())
  ) {
    return { accessToken: initial.accessToken, realmId: initial.realmId };
  }
  if (!initial.refreshToken || !initial.realmId) {
    await opts.store.markNeedsSignIn();
    throw new Error("QuickBooks needs to be connected again");
  }

  const locked = await opts.store.tryBeginRefresh(30_000);
  if (!locked) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(25 * (attempt + 1));
      const waited = await opts.store.read();
      if (
        waited.status === "connected" &&
        waited.accessToken &&
        waited.realmId &&
        stillValid(waited.expiresAt, now()) &&
        !waited.refreshLockedUntil
      ) {
        return { accessToken: waited.accessToken, realmId: waited.realmId };
      }
    }
    throw new Error("QuickBooks is refreshing. Try again in a moment.");
  }

  try {
    const current = await opts.store.read();
    if (
      !opts.force &&
      current.accessToken &&
      current.realmId &&
      stillValid(current.expiresAt, now()) &&
      current.status === "connected"
    ) {
      await opts.store.releaseRefresh();
      return { accessToken: current.accessToken, realmId: current.realmId };
    }
    if (!current.refreshToken || !current.realmId) {
      throw new Error("QuickBooks needs to be connected again");
    }
    const next = await refresh(current.refreshToken);
    await opts.store.saveTokens({
      realmId: current.realmId,
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresAt: next.expiresAt,
      refreshExpiresAt: next.refreshExpiresAt,
      environment: opts.environment,
    });
    return { accessToken: next.accessToken, realmId: current.realmId };
  } catch (err) {
    try {
      await opts.store.markNeedsSignIn();
    } catch {
      await opts.store.releaseRefresh();
    }
    if (err instanceof Error && err.message) throw err;
    throw new Error("QuickBooks needs to be connected again");
  }
}
