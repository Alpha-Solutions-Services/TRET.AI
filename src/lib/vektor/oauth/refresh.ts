import { NeedsSignInError } from "./needs-sign-in";
import type { TokenWrite, VektorTokenStore } from "./store";

const SKEW_MS = 60_000;

function tokenStillValid(
  expiresAt: Date | null,
  now: number,
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now > SKEW_MS;
}

/**
 * Returns a usable access token, refreshing at most once under the store lock.
 * A rotated refresh token is saved in the same write as the new access token.
 */
export async function getValidAccessToken(opts: {
  store: VektorTokenStore;
  refresh: (refreshToken: string) => Promise<TokenWrite>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const initial = await opts.store.read();
  if (
    initial.status === "connected" &&
    initial.accessToken &&
    tokenStillValid(initial.expiresAt, now())
  ) {
    return initial.accessToken;
  }
  if (!initial.refreshToken) {
    await opts.store.markNeedsSignIn();
    throw new NeedsSignInError();
  }

  const locked = await opts.store.tryBeginRefresh(30_000);
  if (!locked) {
    for (let i = 0; i < 8; i++) {
      await sleep(25 * (i + 1));
      const waited = await opts.store.read();
      if (
        waited.status === "connected" &&
        waited.accessToken &&
        tokenStillValid(waited.expiresAt, now()) &&
        !waited.refreshLockedUntil
      ) {
        return waited.accessToken;
      }
    }
    throw new NeedsSignInError();
  }

  try {
    const current = await opts.store.read();
    if (
      current.accessToken &&
      tokenStillValid(current.expiresAt, now()) &&
      current.status === "connected"
    ) {
      await opts.store.releaseRefresh();
      return current.accessToken;
    }
    if (!current.refreshToken) {
      throw new NeedsSignInError();
    }
    const next = await opts.refresh(current.refreshToken);
    if (!next.accessToken || !next.refreshToken) {
      throw new NeedsSignInError();
    }
    await opts.store.saveTokensAtomic(next);
    return next.accessToken;
  } catch (err) {
    try {
      await opts.store.markNeedsSignIn();
    } catch {
      await opts.store.releaseRefresh();
    }
    if (err instanceof NeedsSignInError) throw err;
    throw new NeedsSignInError();
  }
}
