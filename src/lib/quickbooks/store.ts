import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptString, encryptString } from "@/lib/vektor/oauth/crypto";
import type { QuickbooksEnvironment } from "@/lib/quickbooks/config";
import type { PostingAccounts } from "@/lib/quickbooks/journal";
import { emptyPostingAccounts } from "@/lib/quickbooks/journal";
import type { CategoryMapping, MapKind } from "@/lib/quickbooks/map";
import type { QuickbooksTokenStore, QuickbooksTokenWrite, StoredQuickbooks } from "@/lib/quickbooks/session";
import type { Database, Json } from "@/lib/supabase/database.types";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";

export type AppDb = SupabaseClient<Database>;

export class QuickbooksSchemaError extends Error {
  constructor() {
    super("QuickBooks storage is not ready yet. Apply the database update, then reload this page.");
    this.name = "QuickbooksSchemaError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function rpc(
  supabase: AppDb,
  fn: keyof Database["public"]["Functions"],
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    if (isMissingSchemaError(error)) throw new QuickbooksSchemaError();
    throw new Error(error.message);
  }
  return data as Json;
}

export function createQuickbooksTokenStore(supabase: AppDb, encryptionKey: string): QuickbooksTokenStore {
  return {
    async read(): Promise<StoredQuickbooks> {
      const data = asRecord(await rpc(supabase, "quickbooks_read_connection"));
      if (!data) {
        return {
          realmId: null,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          environment: null,
          status: "needs_sign_in",
          refreshLockedUntil: null,
        };
      }
      const accessRaw = asString(data.access_token_enc);
      const refreshRaw = asString(data.refresh_token_enc);
      const environment = data.environment === "production" || data.environment === "sandbox" ? data.environment : null;
      const expires = asString(data.expires_at);
      const locked = asString(data.refresh_locked_until);
      return {
        realmId: asString(data.realm_id),
        accessToken: accessRaw ? decryptString(accessRaw, encryptionKey, "QuickBooks") : null,
        refreshToken: refreshRaw ? decryptString(refreshRaw, encryptionKey, "QuickBooks") : null,
        expiresAt: expires ? new Date(expires) : null,
        environment,
        status: data.connection_status === "connected" ? "connected" : "needs_sign_in",
        refreshLockedUntil: locked ? new Date(locked) : null,
      };
    },

    async saveTokens(tokens: QuickbooksTokenWrite): Promise<void> {
      await rpc(supabase, "quickbooks_save_tokens", {
        p_realm_id: tokens.realmId,
        p_access_token_enc: encryptString(tokens.accessToken, encryptionKey),
        p_refresh_token_enc: encryptString(tokens.refreshToken, encryptionKey),
        p_expires_at: tokens.expiresAt.toISOString(),
        p_refresh_expires_at: tokens.refreshExpiresAt.toISOString(),
        p_environment: tokens.environment,
      });
    },

    async tryBeginRefresh(leaseMs: number): Promise<boolean> {
      const data = await rpc(supabase, "quickbooks_try_begin_refresh", {
        p_lease_seconds: Math.max(1, Math.ceil(leaseMs / 1000)),
      });
      return data === true;
    },

    async releaseRefresh(): Promise<void> {
      await rpc(supabase, "quickbooks_release_refresh");
    },

    async markNeedsSignIn(): Promise<void> {
      await rpc(supabase, "quickbooks_mark_needs_sign_in");
    },
  };
}

export type PublicConnection = {
  status: "connected" | "needs_sign_in";
  realmId: string | null;
  environment: QuickbooksEnvironment | null;
};

export async function readPublicConnection(supabase: AppDb): Promise<PublicConnection> {
  const data = asRecord(await rpc(supabase, "quickbooks_public_status"));
  const environment = data?.environment === "production" || data?.environment === "sandbox" ? data.environment : null;
  return {
    status: data?.connection_status === "connected" ? "connected" : "needs_sign_in",
    realmId: asString(data?.realm_id),
    environment,
  };
}

export async function saveOauthPending(
  supabase: AppDb,
  state: string,
  redirectUri: string,
  expiresAt: Date,
): Promise<void> {
  await rpc(supabase, "quickbooks_oauth_save_pending", {
    p_state: state,
    p_redirect_uri: redirectUri,
    p_expires_at: expiresAt.toISOString(),
  });
}

export async function takeOauthPending(supabase: AppDb, state: string): Promise<string | null> {
  const data = asRecord(await rpc(supabase, "quickbooks_oauth_take_pending", { p_state: state }));
  return asString(data?.redirect_uri);
}

export async function disconnectQuickbooks(supabase: AppDb): Promise<void> {
  await rpc(supabase, "quickbooks_disconnect");
}

export async function listCategoryMappings(supabase: AppDb): Promise<CategoryMapping[]> {
  const { data, error } = await supabase
    .from("quickbooks_category_map")
    .select("id, source_kind, source_id, source_name, category")
    .order("source_name", { ascending: true });
  if (error) {
    if (isMissingSchemaError(error)) throw new QuickbooksSchemaError();
    throw new Error(error.message);
  }
  return (data ?? []).flatMap((row) => {
    if (row.source_kind !== "vendor" && row.source_kind !== "account") return [];
    return [
      {
        id: row.id,
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        sourceName: row.source_name,
        category: row.category,
      },
    ];
  });
}

export async function upsertCategoryMapping(
  supabase: AppDb,
  input: { sourceKind: MapKind; sourceId: string; sourceName: string; category: string },
): Promise<void> {
  const { error } = await supabase.from("quickbooks_category_map").upsert(
    {
      source_kind: input.sourceKind,
      source_id: input.sourceId,
      source_name: input.sourceName,
      category: input.category,
    },
    { onConflict: "source_kind,source_id" },
  );
  if (error) {
    if (isMissingSchemaError(error)) throw new QuickbooksSchemaError();
    throw new Error(error.message);
  }
}

export async function deleteCategoryMapping(supabase: AppDb, id: string): Promise<void> {
  const { error } = await supabase.from("quickbooks_category_map").delete().eq("id", id);
  if (error) {
    if (isMissingSchemaError(error)) throw new QuickbooksSchemaError();
    throw new Error(error.message);
  }
}

export async function readPostingAccounts(supabase: AppDb): Promise<PostingAccounts> {
  const { data, error } = await supabase.from("quickbooks_posting_accounts").select("*").eq("id", 1).maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) throw new QuickbooksSchemaError();
    throw new Error(error.message);
  }
  if (!data) return emptyPostingAccounts();
  return {
    feeDebitAccountId: data.fee_debit_account_id ?? "",
    feeDebitAccountName: data.fee_debit_account_name ?? "",
    feeCreditAccountId: data.fee_credit_account_id ?? "",
    feeCreditAccountName: data.fee_credit_account_name ?? "",
    tolsonDebitAccountId: data.tolson_debit_account_id ?? "",
    tolsonDebitAccountName: data.tolson_debit_account_name ?? "",
    tolsonCreditAccountId: data.tolson_credit_account_id ?? "",
    tolsonCreditAccountName: data.tolson_credit_account_name ?? "",
  };
}

export async function savePostingAccounts(supabase: AppDb, accounts: PostingAccounts): Promise<void> {
  const { error } = await supabase
    .from("quickbooks_posting_accounts")
    .update({
      fee_debit_account_id: accounts.feeDebitAccountId,
      fee_debit_account_name: accounts.feeDebitAccountName,
      fee_credit_account_id: accounts.feeCreditAccountId,
      fee_credit_account_name: accounts.feeCreditAccountName,
      tolson_debit_account_id: accounts.tolsonDebitAccountId,
      tolson_debit_account_name: accounts.tolsonDebitAccountName,
      tolson_credit_account_id: accounts.tolsonCreditAccountId,
      tolson_credit_account_name: accounts.tolsonCreditAccountName,
    })
    .eq("id", 1);
  if (error) {
    if (isMissingSchemaError(error)) throw new QuickbooksSchemaError();
    throw new Error(error.message);
  }
}

export type PushHistoryRow = {
  id: string;
  weekStart: string;
  qboId: string;
  incomeCents: number;
  tolsonCents: number;
  postedBy: string;
  createdAt: string;
};

export async function listPushHistory(supabase: AppDb): Promise<PushHistoryRow[]> {
  const { data, error } = await supabase
    .from("quickbooks_push_log")
    .select("id, week_start, qbo_id, income_cents, tolson_cents, posted_by, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingSchemaError(error)) throw new QuickbooksSchemaError();
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    weekStart: row.week_start,
    qboId: row.qbo_id,
    incomeCents: row.income_cents,
    tolsonCents: row.tolson_cents,
    postedBy: row.posted_by,
    createdAt: row.created_at,
  }));
}

export async function insertPushHistory(
  supabase: AppDb,
  input: { weekStart: string; qboId: string; incomeCents: number; tolsonCents: number; postedBy: string },
): Promise<void> {
  const { error } = await supabase.from("quickbooks_push_log").insert({
    week_start: input.weekStart,
    qbo_id: input.qboId,
    income_cents: input.incomeCents,
    tolson_cents: input.tolsonCents,
    posted_by: input.postedBy,
  });
  if (error) {
    if (isMissingSchemaError(error)) throw new QuickbooksSchemaError();
    throw new Error(error.message);
  }
}

export async function existingSourceIds(supabase: AppDb, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const data = await rpc(supabase, "quickbooks_existing_source_ids", { p_ids: ids });
  if (!Array.isArray(data)) return new Set();
  return new Set(data.filter((id): id is string => typeof id === "string"));
}

export async function importExpense(
  supabase: AppDb,
  input: {
    expenseDate: string;
    category: string;
    amountCents: number;
    note: string;
    sourceId: string;
  },
): Promise<boolean> {
  const data = asRecord(
    await rpc(supabase, "import_quickbooks_operating_expense", {
      p_expense_date: input.expenseDate,
      p_category: input.category,
      p_amount_cents: input.amountCents,
      p_note: input.note,
      p_qbo_source_id: input.sourceId,
    }),
  );
  return data?.inserted === true;
}
