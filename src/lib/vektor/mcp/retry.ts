const RETRYABLE = /timeout|timed out|429|502|503|504|ECONNRESET|fetch failed|network/i;
const NOT_RETRYABLE = /needs sign-in|unauthorized|not allowlisted|invalid_grant|401/i;

export function isRetryableMcpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (NOT_RETRYABLE.test(msg)) return false;
  return RETRYABLE.test(msg);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;
    baseMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const baseMs = opts?.baseMs ?? 200;
  const sleep = opts?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isRetryableMcpError(err) || attempt === attempts - 1) {
        throw err;
      }
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw last;
}

export async function withTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("MCP request timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
