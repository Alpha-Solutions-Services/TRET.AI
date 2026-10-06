/**
 * Server-side Vektor HTTP client. Token never logged, never sent to the browser.
 * List filters use lowercase status (delivered). Response enums use STATUS_*.
 *
 * Base URL path is OPEN until confirmed against Vektor REST docs; set VEKTOR_API_BASE_URL.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

export class VektorClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VektorClientError";
  }
}

export type VektorClientConfig = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createVektorClient(config: VektorClientConfig) {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  async function request(
    path: string,
    init?: RequestInit,
  ): Promise<unknown> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.token}`,
            ...(init?.headers ?? {}),
          },
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) {
          lastError = new VektorClientError(
            `Vektor temporary error HTTP ${res.status}`,
            res.status,
          );
          await sleep(250 * 2 ** attempt);
          continue;
        }
        if (!res.ok) {
          throw new VektorClientError(
            `Vektor request failed HTTP ${res.status}`,
            res.status,
          );
        }
        return await res.json();
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof VektorClientError && err.status && err.status < 500) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        await sleep(250 * 2 ** attempt);
      }
    }
    throw lastError ?? new VektorClientError("Vektor request failed");
  }

  return {
    /**
     * Fetch delivered manifests for an inclusive date range.
     * Path OPEN — override via options when API is confirmed.
     */
    async listDeliveredManifests(input: {
      from: string;
      to: string;
      page?: number;
      perPage?: number;
      pathTemplate?: string;
    }): Promise<unknown> {
      const page = input.page ?? 1;
      const perPage = Math.min(input.perPage ?? 25, 25);
      // Filter names lowercase: status=delivered
      const path =
        input.pathTemplate ??
        `/manifests?status=delivered&from=${encodeURIComponent(input.from)}&to=${encodeURIComponent(input.to)}&page=${page}&perPage=${perPage}`;
      return request(path);
    },

    async getDriver(driverId: string): Promise<unknown> {
      return request(`/drivers/${encodeURIComponent(driverId)}`);
    },

    async getBroker(brokerId: string): Promise<unknown> {
      return request(`/brokers/${encodeURIComponent(brokerId)}`);
    },
  };
}

export function getVektorEnvConfig(
  env: Record<string, string | undefined> = process.env,
): VektorClientConfig | null {
  const baseUrl = (env.VEKTOR_API_BASE_URL ?? "").trim();
  const token = (env.VEKTOR_API_TOKEN ?? "").trim();
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}
