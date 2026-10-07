import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isAdminRole } from "@/lib/quickbooks/admin";
import { qboAmountToSignedCents } from "@/lib/quickbooks/amounts";
import { fetchAllEntities, postJournal } from "@/lib/quickbooks/client";
import { missingQuickbooksEnv, readQuickbooksConfig } from "@/lib/quickbooks/config";
import { buildWeekJournal } from "@/lib/quickbooks/journal";
import { buildImportPreview, suggestCategory, type CategoryMapping } from "@/lib/quickbooks/map";
import { basicAuthHeader, buildAuthorizeUrl, exchangeAuthCode, refreshAccessToken } from "@/lib/quickbooks/oauth";
import { parseAccounts, parseExpenseEntities, parseQueryEntities } from "@/lib/quickbooks/parse";
import { assertDateRange, entityQuery } from "@/lib/quickbooks/query";
import { getValidAccessToken, type QuickbooksTokenStore, type StoredQuickbooks } from "@/lib/quickbooks/session";

const FULL_ENV = {
  INTUIT_CLIENT_ID: "client-id",
  INTUIT_CLIENT_SECRET: "client-secret",
  INTUIT_REDIRECT_URI: "https://tret.ai.alphasolutions.software/api/quickbooks/oauth/callback",
  INTUIT_ENVIRONMENT: "sandbox",
  QUICKBOOKS_TOKEN_ENCRYPTION_KEY: "test-key",
};

const purchaseBody = {
  QueryResponse: {
    Purchase: [
      {
        Id: "100",
        TxnDate: "2026-10-02",
        DocNumber: "101",
        EntityRef: { value: "55", name: "Vektor", type: "Vendor" },
        Line: [
          {
            Id: "1",
            Amount: 50.25,
            Description: "Monthly fee",
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: { AccountRef: { value: "80", name: "Software" } },
          },
        ],
      },
      {
        Id: "101",
        TxnDate: "2026-10-04",
        TotalAmt: -12.0,
        EntityRef: { value: "55", name: "Vektor" },
        Line: [
          {
            Id: "1",
            Amount: -12,
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: { AccountRef: { value: "80", name: "Software" } },
          },
        ],
      },
    ],
  },
};

const billBody = {
  QueryResponse: {
    Bill: {
      Id: "200",
      TxnDate: "2026-10-03",
      VendorRef: { value: "61", name: "Clinic" },
      Line: [
        {
          Id: "1",
          Amount: "40.00",
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { value: "90", name: "Drug tests" } },
        },
      ],
    },
  },
};

function memoryStore(initial: StoredQuickbooks): QuickbooksTokenStore & { saved: number; marked: number } {
  let row = { ...initial };
  const store = {
    saved: 0,
    marked: 0,
    async read() {
      return { ...row };
    },
    async saveTokens(tokens: {
      realmId: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
      refreshExpiresAt: Date;
      environment: "sandbox" | "production";
    }) {
      store.saved += 1;
      row = {
        ...row,
        realmId: tokens.realmId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        environment: tokens.environment,
        status: "connected",
        refreshLockedUntil: null,
      };
    },
    async tryBeginRefresh() {
      if (row.refreshLockedUntil) return false;
      row = { ...row, refreshLockedUntil: new Date(Date.now() + 30_000) };
      return true;
    },
    async releaseRefresh() {
      row = { ...row, refreshLockedUntil: null };
    },
    async markNeedsSignIn() {
      store.marked += 1;
      row = { ...row, status: "needs_sign_in", refreshLockedUntil: null };
    },
  };
  return store;
}

describe("QuickBooks setup", () => {
  it("returns null instead of throwing when env is missing", () => {
    expect(readQuickbooksConfig({})).toBeNull();
    expect(missingQuickbooksEnv({})).toEqual([
      "INTUIT_CLIENT_ID",
      "INTUIT_CLIENT_SECRET",
      "INTUIT_REDIRECT_URI",
      "INTUIT_ENVIRONMENT",
      "QUICKBOOKS_TOKEN_ENCRYPTION_KEY",
    ]);
  });

  it("rejects an environment that is not sandbox or production", () => {
    expect(readQuickbooksConfig({ ...FULL_ENV, INTUIT_ENVIRONMENT: "live" })).toBeNull();
    expect(missingQuickbooksEnv({ ...FULL_ENV, INTUIT_ENVIRONMENT: "live" })).toEqual(["INTUIT_ENVIRONMENT"]);
  });

  it("reads a complete sandbox setup", () => {
    expect(readQuickbooksConfig(FULL_ENV)?.environment).toBe("sandbox");
  });

  it("treats owner and admin as admins", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("Admin")).toBe(true);
    expect(isAdminRole("staff")).toBe(false);
  });
});

describe("QuickBooks OAuth", () => {
  it("builds the Intuit authorize URL", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client id",
        redirectUri: FULL_ENV.INTUIT_REDIRECT_URI,
        state: "state-value",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(url.searchParams.get("client_id")).toBe("client id");
    expect(url.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(url.searchParams.get("redirect_uri")).toBe(FULL_ENV.INTUIT_REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("exchanges a code with HTTP basic auth", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: basicAuthHeader("client-id", "client-secret"),
      });
      expect(String(init?.body)).toContain("grant_type=authorization_code");
      return new Response(
        JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          x_refresh_token_expires_in: 100,
          token_type: "bearer",
        }),
        { status: 200 },
      );
    });
    const tokens = await exchangeAuthCode({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: FULL_ENV.INTUIT_REDIRECT_URI,
      code: "auth-code",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(tokens.accessToken).toBe("access");
    expect(tokens.refreshToken).toBe("refresh");
  });

  it("refreshes and keeps a rotated refresh token", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(String(init?.body)).toContain("grant_type=refresh_token");
      expect(String(init?.body)).toContain("refresh_token=old-refresh");
      return new Response(
        JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }),
        { status: 200 },
      );
    });
    const tokens = await refreshAccessToken({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "old-refresh",
      fetchImpl: fetchImpl as typeof fetch,
      now: Date.parse("2026-10-07T00:00:00Z"),
    });
    expect(tokens.accessToken).toBe("new-access");
    expect(tokens.refreshToken).toBe("new-refresh");
  });
});

describe("QuickBooks import", () => {
  it("parses Purchase and Bill lines into cents and skips credits", () => {
    const purchases = parseExpenseEntities("Purchase", parseQueryEntities(purchaseBody, "Purchase"));
    const bills = parseExpenseEntities("Bill", parseQueryEntities(billBody, "Bill"));
    expect(purchases[0]).toMatchObject({
      sourceId: "Purchase:100:1",
      amountCents: 5025,
      vendorId: "55",
      accountId: "80",
      skipReason: null,
    });
    expect(purchases[1]?.skipReason).toBe("Credit amounts are not imported");
    expect(bills[0]).toMatchObject({ sourceId: "Bill:200:1", amountCents: 4000, vendorName: "Clinic" });
  });

  it("prefers a saved vendor map over an account map and flags duplicates", () => {
    const drafts = parseExpenseEntities("Purchase", parseQueryEntities(purchaseBody, "Purchase"));
    const maps: CategoryMapping[] = [
      { id: "1", sourceKind: "account", sourceId: "80", sourceName: "Software", category: "Sintra AI" },
      { id: "2", sourceKind: "vendor", sourceId: "55", sourceName: "Vektor", category: "Vektor Fee" },
    ];
    expect(suggestCategory(drafts[0]!, maps)).toBe("Vektor Fee");
    const preview = buildImportPreview(drafts, maps, new Set(["Purchase:100:1"]));
    expect(preview[0]).toMatchObject({ category: "Vektor Fee", alreadySaved: true });
    expect(preview[1]?.alreadySaved).toBe(false);
  });

  it("rejects a date range that is not a calendar range", () => {
    expect(() => assertDateRange("2026-10-08", "2026-10-01")).toThrow(/start date/);
    expect(entityQuery("Purchase", { from: "2026-10-01", to: "2026-10-07", startPosition: 1 })).toContain(
      "TxnDate >= '2026-10-01'",
    );
  });

  it("reads account names from a mocked query", () => {
    const accounts = parseAccounts(
      parseQueryEntities(
        { QueryResponse: { Account: [{ Id: "35", Name: "Checking", AccountType: "Bank", Active: true }] } },
        "Account",
      ),
    );
    expect(accounts).toEqual([{ id: "35", name: "Checking", accountType: "Bank" }]);
  });

  it("pages mocked query responses", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify(purchaseBody), { status: 200 });
    });
    const result = await fetchAllEntities(
      { environment: "sandbox", realmId: "12345", accessToken: "token", fetchImpl: fetchImpl as typeof fetch },
      "Purchase",
      { from: "2026-10-01", to: "2026-10-07" },
    );
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(false);
    const called = String((fetchImpl.mock.calls as unknown as unknown[][])[0]?.[0]);
    expect(called).toContain("/v3/company/12345/query");
    expect(called).toContain("minorversion=75");
    expect(called).not.toContain("token");
  });
});

describe("QuickBooks journal", () => {
  const accounts = {
    feeDebitAccountId: "35",
    feeDebitAccountName: "Checking",
    feeCreditAccountId: "86",
    feeCreditAccountName: "Fee income",
    tolsonDebitAccountId: "40",
    tolsonDebitAccountName: "Tolson expense",
    tolsonCreditAccountId: "41",
    tolsonCreditAccountName: "Tolson payable",
  };

  it("writes dollar amounts from integer cents and balances the entry", () => {
    const journal = buildWeekJournal({
      weekStart: "2026-10-05",
      incomeCents: 1010,
      tolsonCents: 500,
      accounts,
    });
    expect(journal).not.toBeNull();
    expect(journal?.body).toContain('"Amount":10.10');
    expect(journal?.body).toContain('"Amount":5.00');
    expect(journal?.body).not.toMatch(/10\.100000/);
    const debits = journal?.lines.filter((line) => line.postingType === "Debit") ?? [];
    const credits = journal?.lines.filter((line) => line.postingType === "Credit") ?? [];
    expect(debits.reduce((sum, line) => sum + line.amountCents, 0)).toBe(1510);
    expect(credits.reduce((sum, line) => sum + line.amountCents, 0)).toBe(1510);
  });

  it("does not build an entry when both amounts are zero", () => {
    expect(
      buildWeekJournal({ weekStart: "2026-10-05", incomeCents: 0, tolsonCents: 0, accounts }),
    ).toBeNull();
  });

  it("posts the journal body and returns the QuickBooks id", async () => {
    const journal = buildWeekJournal({ weekStart: "2026-10-05", incomeCents: 100, tolsonCents: 0, accounts });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(String(init?.body)).toContain('"Amount":1.00');
      return new Response(JSON.stringify({ JournalEntry: { Id: "88" } }), { status: 200 });
    });
    const id = await postJournal(
      { environment: "production", realmId: "999", accessToken: "token", fetchImpl: fetchImpl as typeof fetch },
      journal?.body ?? "",
    );
    expect(id).toBe("88");
  });
});

describe("QuickBooks token refresh", () => {
  it("returns a current access token without calling refresh", async () => {
    const refresh = vi.fn();
    const store = memoryStore({
      realmId: "123",
      accessToken: "still-good",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      environment: "sandbox",
      status: "connected",
      refreshLockedUntil: null,
    });
    const token = await getValidAccessToken({
      store,
      clientId: "id",
      clientSecret: "secret",
      environment: "sandbox",
      refresh,
    });
    expect(token.accessToken).toBe("still-good");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and stores the new refresh token", async () => {
    const store = memoryStore({
      realmId: "123",
      accessToken: "old",
      refreshToken: "old-refresh",
      expiresAt: new Date(Date.now() - 1000),
      environment: "sandbox",
      status: "connected",
      refreshLockedUntil: null,
    });
    const token = await getValidAccessToken({
      store,
      clientId: "id",
      clientSecret: "secret",
      environment: "sandbox",
      refresh: async () => ({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: new Date(Date.now() + 3600_000),
        refreshExpiresAt: new Date(Date.now() + 86400_000),
        tokenType: "bearer",
      }),
    });
    expect(token.accessToken).toBe("new-access");
    expect(store.saved).toBe(1);
    expect((await store.read()).refreshToken).toBe("new-refresh");
  });

  it("marks the connection when refresh fails", async () => {
    const store = memoryStore({
      realmId: "123",
      accessToken: null,
      refreshToken: "old-refresh",
      expiresAt: null,
      environment: "sandbox",
      status: "connected",
      refreshLockedUntil: null,
    });
    await expect(
      getValidAccessToken({
        store,
        clientId: "id",
        clientSecret: "secret",
        environment: "sandbox",
        refresh: async () => {
          throw new Error("QuickBooks needs to be connected again");
        },
      }),
    ).rejects.toThrow(/connected again/);
    expect(store.marked).toBe(1);
  });
});

describe("QuickBooks amounts", () => {
  it("converts dollar values to cents without binary float leftovers", () => {
    expect(qboAmountToSignedCents(10.1)).toBe(1010);
    expect(qboAmountToSignedCents("10.10")).toBe(1010);
    expect(qboAmountToSignedCents("10.005")).toBe(1001);
    expect(qboAmountToSignedCents(-12)).toBe(-1200);
  });
});

describe("QuickBooks copy", () => {
  it("does not use dash punctuation in the integrations page", () => {
    const text = readFileSync("src/components/integrations/integrations-client.tsx", "utf8");
    expect(text).not.toContain("—");
    expect(text).not.toContain("–");
  });
});
