import { describe, expect, it } from "vitest";
import { McpAdapter } from "./adapters/mcp-adapter";
import { loadFixtureLookups, loadFixtureManifest } from "./fixtures";
import { decidePromotion, runImportPipeline } from "./pipeline";
import { assertMcpToolAllowed } from "./mcp/allowlist";
import { buildManifestsGetArgs } from "./mcp/args";
import { IdCache } from "./mcp/cache";
import { fetchManifestsFromTools } from "./mcp/fetch-manifests";
import { withRetry } from "./mcp/retry";
import {
  expandFirstStopWindow,
  formatImportResultMessage,
  summarizeManifestWindow,
} from "./mcp/window";
import { encryptString, decryptString } from "./oauth/crypto";
import { beginVektorAuthorization, completeVektorAuthorization } from "./oauth/flow";
import { MemoryTokenStore } from "./oauth/memory-store";
import { NeedsSignInError } from "./oauth/needs-sign-in";
import { getValidAccessToken } from "./oauth/refresh";
import { createSupabaseTokenStore } from "./oauth/supabase-store";
import type { VektorManifest } from "./types";

const WEEK = { from: "2026-09-21", to: "2026-09-27" };
const UNITS = new Set(["02"]);

describe("token encryption", () => {
  it("round-trips and does not store the plaintext token", () => {
    const secret = "test-encryption-secret-value";
    const token = "access-token-plain-value";
    const enc = encryptString(token, secret);
    expect(enc).not.toContain(token);
    expect(decryptString(enc, secret)).toBe(token);
  });
});

describe("refresh lock", () => {
  it("saves the rotated refresh token in one write", async () => {
    const store = new MemoryTokenStore();
    await store.saveTokensAtomic({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: new Date(Date.now() - 1000),
    });
    let calls = 0;
    const token = await getValidAccessToken({
      store,
      refresh: async () => {
        calls += 1;
        return {
          accessToken: "new-access",
          refreshToken: "rotated-refresh",
          expiresAt: new Date(Date.now() + 3_600_000),
        };
      },
    });
    expect(calls).toBe(1);
    expect(token).toBe("new-access");
    const saved = await store.read();
    expect(saved.refreshToken).toBe("rotated-refresh");
    expect(saved.status).toBe("connected");
    expect(saved.refreshLockedUntil).toBeNull();
  });

  it("does not refresh again while another refresh holds the lock", async () => {
    const store = new MemoryTokenStore();
    await store.saveTokensAtomic({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await store.tryBeginRefresh(30_000)).toBe(true);
    expect(await store.tryBeginRefresh(30_000)).toBe(false);
    let calls = 0;
    const token = await getValidAccessToken({
      store,
      sleep: async () => {
        await store.saveTokensAtomic({
          accessToken: "new-access",
          refreshToken: "rotated-refresh",
          expiresAt: new Date(Date.now() + 3_600_000),
        });
      },
      refresh: async () => {
        calls += 1;
        throw new Error("second refresh");
      },
    });
    expect(calls).toBe(0);
    expect(token).toBe("new-access");
  });

  it("marks needs sign-in when refresh fails and does not return an empty import", async () => {
    const store = new MemoryTokenStore();
    await store.saveTokensAtomic({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      getValidAccessToken({
        store,
        refresh: async () => {
          throw new Error("invalid_grant");
        },
      }),
    ).rejects.toBeInstanceOf(NeedsSignInError);
    expect((await store.read()).status).toBe("needs_sign_in");
  });
});

describe("oauth begin", () => {
  it("stores the PKCE verifier and returns an authorization URL", async () => {
    const store = new MemoryTokenStore();
    const url = await beginVektorAuthorization({
      redirectUri: "https://tret.ai.alphasolutions.software/api/vektor/oauth/callback",
      store,
      createState: () => "state-1",
      discover: async () => ({
        authorizationServerUrl: "https://mcp.vektortms.com",
        authorizationServerMetadata: {
          issuer: "https://mcp.vektortms.com",
          authorization_endpoint: "https://mcp.vektortms.com/authorize",
          token_endpoint: "https://mcp.vektortms.com/token",
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
          registration_endpoint: "https://mcp.vektortms.com/register",
        },
        resourceMetadata: {
          resource: "https://mcp.vektortms.com/mcp",
          authorization_servers: ["https://mcp.vektortms.com"],
        },
      }),
      register: async () =>
        ({
          client_id: "client-1",
          redirect_uris: ["https://tret.ai.alphasolutions.software/api/vektor/oauth/callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          client_name: "TRET.AI",
        }) as never,
    });
    expect(url).toContain("https://mcp.vektortms.com/authorize");
    expect(url).toContain("code_challenge=");
    expect(url).toContain("state-1");
    expect(url).not.toContain("verifier");
    const pending = await store.takePending("state-1");
    expect(pending?.codeVerifier).toBeTruthy();
    expect(await store.takePending("state-1")).toBeNull();
  });

  it("completes the code exchange without returning tokens", async () => {
    const store = new MemoryTokenStore();
    await store.saveClientInformation({ client_id: "client-1" });
    await store.savePending(
      "state-1",
      "verifier-1",
      "https://tret.ai.alphasolutions.software/api/vektor/oauth/callback",
      new Date(Date.now() + 60_000),
    );
    await completeVektorAuthorization({
      code: "auth-code-1",
      state: "state-1",
      store,
      discover: async () => ({
        authorizationServerUrl: "https://mcp.vektortms.com",
        authorizationServerMetadata: {
          issuer: "https://mcp.vektortms.com",
          authorization_endpoint: "https://mcp.vektortms.com/authorize",
          token_endpoint: "https://mcp.vektortms.com/token",
          response_types_supported: ["code"],
        },
      }),
      exchange: async (_url, opts) => {
        expect(opts.authorizationCode).toBe("auth-code-1");
        expect(opts.codeVerifier).toBe("verifier-1");
        return {
          access_token: "access-1",
          refresh_token: "refresh-1",
          token_type: "Bearer",
          expires_in: 3600,
        };
      },
    });
    const saved = await store.read();
    expect(saved.status).toBe("connected");
    expect(saved.refreshToken).toBe("refresh-1");
  });
});

describe("supabase token store", () => {
  it("sends ciphertext, not the plaintext token", async () => {
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const store = createSupabaseTokenStore(
      {
        rpc: async (fn, args) => {
          calls.push({ fn, args });
          if (fn === "vektor_mcp_read_connection") {
            return { data: { connection_status: "needs_sign_in" }, error: null };
          }
          return { data: null, error: null };
        },
      },
      "test-encryption-secret-value",
    );
    await store.saveTokensAtomic({
      accessToken: "access-plain",
      refreshToken: "refresh-plain",
      expiresAt: new Date("2026-10-07T00:00:00.000Z"),
    });
    const save = calls.find((call) => call.fn === "vektor_mcp_save_tokens");
    const access = String(save?.args?.p_access_token_enc);
    const refresh = String(save?.args?.p_refresh_token_enc);
    expect(access).not.toContain("access-plain");
    expect(refresh).not.toContain("refresh-plain");
  });
});

describe("tool allowlist", () => {
  it("throws for a tool that is not on the read-only list", () => {
    expect(() => assertMcpToolAllowed("core_Manifests_Update")).toThrow(/not allowlisted/);
    expect(() => assertMcpToolAllowed("core_Manifests_Get")).not.toThrow();
  });
});

describe("date window and Sample A acceptance", () => {
  it("queries from-14 / to+7 and keeps delivery dates in 21–27 Sep", () => {
    expect(expandFirstStopWindow("2026-09-21", "2026-09-27")).toEqual({
      queryFrom: "2026-09-07",
      queryTo: "2026-10-04",
    });
  });

  it("imports manifest 1152 as Sample A and excludes 1146", async () => {
    const sampleA = loadFixtureManifest("sample-a-manifest-1152.json");
    const sampleB = loadFixtureManifest("sample-b-manifest-1101.json");
    const sampleC = loadFixtureManifest("sample-c-manifest-1146.json");
    const deliversInWeekFirstStopEarlier: VektorManifest = {
      ...sampleA,
      manifestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa2222",
      friendlyId: "2222",
      stops: [
        {
          orderStopType: "TYPE_START",
          appointmentStartAtLocal: "2026-09-10 08:00:00",
          appointmentType: "APPOINTMENT_TYPE_FIXED",
        },
        ...(sampleA.stops ?? []).filter((stop) => stop.orderStopType !== "TYPE_START"),
      ],
    };
    const firstStopInWeekDeliversLater: VektorManifest = {
      ...sampleA,
      manifestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa3333",
      friendlyId: "3333",
      stops: (sampleA.stops ?? []).map((stop) =>
        stop.orderStopType === "dropoff"
          ? {
              ...stop,
              checkedOutAt: "2026-10-02 12:00:00",
              arrivedAt: null,
              appointmentType: "APPOINTMENT_TYPE_NEED_TO_SET",
            }
          : stop,
      ),
    };

    const lookups = loadFixtureLookups("sample-a-manifest-1152.json");
    const calls: string[] = [];
    const manifestGets: Record<string, unknown>[] = [];
    const all = [sampleA, sampleB, sampleC, deliversInWeekFirstStopEarlier, firstStopInWeekDeliversLater];
    const fetched = await fetchManifestsFromTools({
      ...WEEK,
      callTool: async (name, args) => {
        calls.push(name);
        if (name === "core_Manifests_Get") manifestGets.push(args);
        if (name === "fleet_Trucks_GetByIDs") {
          return { trucks: Object.values(lookups.trucks ?? {}) };
        }
        if (name === "core_Manifests_OrderDetailsGet") {
          const id = String(args.manifest_id);
          const found = all.find((manifest) => manifest.manifestId === id);
          return { manifests: found ? [found] : [] };
        }
        return { manifests: all };
      },
    });

    expect(calls.filter((name) => name === "fleet_Trucks_GetByIDs")).toHaveLength(1);
    expect(manifestGets).toEqual([
      buildManifestsGetArgs({ queryFrom: "2026-09-07", queryTo: "2026-10-04", page: 1 }),
    ]);
    expect(fetched.report?.queryFrom).toBe("2026-09-07");
    expect(fetched.report?.queryTo).toBe("2026-10-04");
    expect(fetched.report?.deliveredByFirstStopDate).toBe(2);
    expect(fetched.report?.deliveredByDeliveryDate).toBe(2);
    expect(fetched.manifests.map((manifest) => manifest.friendlyId).sort()).toEqual(["1152", "2222"]);
    expect(fetched.manifests.some((manifest) => manifest.friendlyId === "1146")).toBe(false);

    const pipeline = runImportPipeline(fetched.manifests, {
      lookups: fetched.lookups,
      knownTruckUnits: UNITS,
      rangeFrom: WEEK.from,
      rangeTo: WEEK.to,
      previousFetched: null,
      settings: { rowCountDropBlockPct: 50 },
    });
    const promoted = pipeline.decisions.filter((decision) => decision.promote);
    expect(promoted.map((decision) => decision.mapped.manifestFriendlyId).sort()).toEqual([
      "1152",
      "2222",
    ]);
    const row = promoted.find((decision) => decision.mapped.manifestFriendlyId === "1152");
    expect(row?.mapped.rateCents).toBe(220_000);
    expect(row?.mapped.loadedDistanceMi).toBe(332);
    expect(row?.mapped.deadheadMiles).toBe(14);
    expect(row?.mapped.pickupDate).toBe("2026-09-25 16:38:52");
    expect(row?.mapped.deliveryDate).toBe("2026-09-26 12:29:26");
    expect(row?.mapped.weekStart).toBe("2026-09-21");
    expect(row?.mapped.weekEnd).toBe("2026-09-27");

    const excluded = decidePromotion(sampleC, {
      lookups,
      knownTruckUnits: UNITS,
      rangeFrom: WEEK.from,
      rangeTo: WEEK.to,
    });
    expect(excluded.promote).toBe(false);
    expect(excluded.mapped.manifestFriendlyId).toBe("1146");

    expect(
      formatImportResultMessage({
        source: "mcp",
        fetched: 0,
        promoted: 0,
        updated: 0,
        rejected: 0,
        report: fetched.report,
      }),
    ).toMatch(/did not silently record zero rows/);
  });
});

describe("retry", () => {
  it("backs off and then succeeds", async () => {
    const waits: number[] = [];
    let tries = 0;
    const value = await withRetry(
      async () => {
        tries += 1;
        if (tries < 3) throw new Error("503");
        return "ok";
      },
      {
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );
    expect(value).toBe("ok");
    expect(waits).toEqual([200, 400]);
  });
});

describe("id cache", () => {
  it("keeps the first value for an id", () => {
    const cache = new IdCache<string>();
    cache.remember("driver-1", "Ada");
    cache.remember("driver-1", "Other");
    expect(cache.get("driver-1")).toBe("Ada");
  });
});

describe("mcp verified gate", () => {
  it("stays unselectable until tokens exist and mcp_verified is true", async () => {
    expect(new McpAdapter().status().selectable).toBe(false);
    expect(new McpAdapter({ verified: true, hasTokens: true, needsSignIn: true }).status().message).toMatch(
      /Needs sign-in/,
    );
    const ready = new McpAdapter({
      verified: true,
      hasTokens: true,
      fetchManifests: async () => ({
        manifests: [loadFixtureManifest("sample-a-manifest-1152.json")],
        lookups: loadFixtureLookups("sample-a-manifest-1152.json"),
      }),
    });
    expect(ready.status().selectable).toBe(true);
    const result = await ready.fetchManifests(WEEK);
    expect(result.manifests[0]?.friendlyId).toBe("1152");
  });
});

describe("window counts explain first-stop vs delivery", () => {
  it("counts a load whose first stop is in range even when delivery is later", () => {
    const sampleA = loadFixtureManifest("sample-a-manifest-1152.json");
    const later: VektorManifest = {
      ...sampleA,
      manifestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa3333",
      friendlyId: "3333",
      stops: (sampleA.stops ?? []).map((stop) =>
        stop.orderStopType === "dropoff"
          ? { ...stop, checkedOutAt: "2026-10-02 12:00:00" }
          : stop,
      ),
    };
    const summary = summarizeManifestWindow([sampleA, later], "2026-09-21", "2026-09-27");
    expect(summary.report.deliveredByFirstStopDate).toBe(2);
    expect(summary.report.deliveredByDeliveryDate).toBe(1);
    expect(summary.kept).toHaveLength(1);
  });
});
