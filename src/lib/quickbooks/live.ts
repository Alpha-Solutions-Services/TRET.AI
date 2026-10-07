import { randomBytes } from "node:crypto";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { canonicalLegacyCategory } from "@/lib/legacy/expenses";
import { loadManagementCardSummary } from "@/lib/legacy/queries";
import { loadOverview } from "@/lib/overview/queries";
import { fetchAccounts, fetchAllEntities, postJournal } from "@/lib/quickbooks/client";
import {
  missingQuickbooksEnv,
  readQuickbooksConfig,
  type QuickbooksConfig,
  type QuickbooksEnvironment,
} from "@/lib/quickbooks/config";
import { buildWeekJournal, postingAccountsComplete, type PostingAccounts } from "@/lib/quickbooks/journal";
import {
  buildImportPreview,
  mappingFromSelection,
  type CategoryMapping,
  type PreviewRow,
  type RememberChoice,
} from "@/lib/quickbooks/map";
import { buildAuthorizeUrl, exchangeAuthCode } from "@/lib/quickbooks/oauth";
import { parseExpenseEntities, type ExpenseDraft } from "@/lib/quickbooks/parse";
import { assertDateRange, assertRealmId } from "@/lib/quickbooks/query";
import { getValidAccessToken } from "@/lib/quickbooks/session";
import {
  createQuickbooksTokenStore,
  deleteCategoryMapping,
  disconnectQuickbooks,
  existingSourceIds,
  importExpense,
  insertPushHistory,
  listCategoryMappings,
  listPushHistory,
  QuickbooksSchemaError,
  readPostingAccounts,
  readPublicConnection,
  saveOauthPending,
  savePostingAccounts,
  takeOauthPending,
  upsertCategoryMapping,
  type AppDb,
  type PublicConnection,
  type PushHistoryRow,
} from "@/lib/quickbooks/store";

export type IntegrationsHome = {
  isAdmin: boolean;
  setupReady: boolean;
  missingEnv: string[];
  environment: QuickbooksEnvironment | null;
  migrationReady: boolean;
  connection: PublicConnection | null;
  mappings: CategoryMapping[];
  accounts: PostingAccounts;
  history: PushHistoryRow[];
  loadError: string | null;
};

function plainError(err: unknown): string {
  if (err instanceof QuickbooksSchemaError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "QuickBooks could not be reached";
}

export async function loadIntegrationsHome(supabase: AppDb, isAdmin: boolean): Promise<IntegrationsHome> {
  const config = readQuickbooksConfig();
  const base: IntegrationsHome = {
    isAdmin,
    setupReady: config != null,
    missingEnv: config ? [] : missingQuickbooksEnv(),
    environment: config?.environment ?? null,
    migrationReady: false,
    connection: null,
    mappings: [],
    accounts: {
      feeDebitAccountId: "",
      feeDebitAccountName: "",
      feeCreditAccountId: "",
      feeCreditAccountName: "",
      tolsonDebitAccountId: "",
      tolsonDebitAccountName: "",
      tolsonCreditAccountId: "",
      tolsonCreditAccountName: "",
    },
    history: [],
    loadError: null,
  };
  if (!isAdmin || !config) return base;
  try {
    const [connection, mappings, accounts, history] = await Promise.all([
      readPublicConnection(supabase),
      listCategoryMappings(supabase),
      readPostingAccounts(supabase),
      listPushHistory(supabase),
    ]);
    return {
      ...base,
      migrationReady: true,
      connection,
      mappings,
      accounts,
      history,
    };
  } catch (err) {
    if (err instanceof QuickbooksSchemaError) {
      return { ...base, loadError: null, migrationReady: false };
    }
    return { ...base, migrationReady: true, loadError: plainError(err) };
  }
}

async function caller(supabase: AppDb, config: QuickbooksConfig, force = false) {
  const store = createQuickbooksTokenStore(supabase, config.encryptionKey);
  const token = await getValidAccessToken({
    store,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    environment: config.environment,
    force,
  });
  return {
    environment: config.environment,
    realmId: token.realmId,
    accessToken: token.accessToken,
  };
}

async function withCaller<T>(supabase: AppDb, config: QuickbooksConfig, run: (ready: Awaited<ReturnType<typeof caller>>) => Promise<T>): Promise<T> {
  try {
    return await run(await caller(supabase, config));
  } catch (err) {
    if (err instanceof Error && err.message === "QuickBooks needs to be connected again") {
      return run(await caller(supabase, config, true));
    }
    throw err;
  }
}

export async function beginConnect(supabase: AppDb, config: QuickbooksConfig): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  await saveOauthPending(supabase, state, config.redirectUri, new Date(Date.now() + 10 * 60 * 1000));
  return buildAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
  });
}

export async function finishConnect(input: {
  supabase: AppDb;
  config: QuickbooksConfig;
  code: string;
  state: string;
  realmId: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const redirectUri = await takeOauthPending(input.supabase, input.state);
  if (!redirectUri) throw new Error("That sign-in session expired. Connect again.");
  const realmId = assertRealmId(input.realmId);
  const tokens = await exchangeAuthCode({
    clientId: input.config.clientId,
    clientSecret: input.config.clientSecret,
    redirectUri,
    code: input.code,
    fetchImpl: input.fetchImpl,
  });
  const store = createQuickbooksTokenStore(input.supabase, input.config.encryptionKey);
  await store.saveTokens({
    realmId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
    environment: input.config.environment,
  });
}

export async function pullExpensePreview(
  supabase: AppDb,
  config: QuickbooksConfig,
  from: string,
  to: string,
): Promise<{ rows: PreviewRow[]; truncated: boolean }> {
  const range = assertDateRange(from, to);
  return withCaller(supabase, config, async (ready) => {
    const [purchases, bills] = await Promise.all([
      fetchAllEntities(ready, "Purchase", range),
      fetchAllEntities(ready, "Bill", range),
    ]);
    const drafts: ExpenseDraft[] = [
      ...parseExpenseEntities("Purchase", purchases.rows),
      ...parseExpenseEntities("Bill", bills.rows),
    ];
    const maps = await listCategoryMappings(supabase);
    const saved = await existingSourceIds(
      supabase,
      drafts.map((row) => row.sourceId),
    );
    return {
      rows: buildImportPreview(drafts, maps, saved),
      truncated: purchases.truncated || bills.truncated,
    };
  });
}

export type ImportSelection = {
  sourceId: string;
  category: string;
  remember: RememberChoice;
};

export async function confirmExpenseImport(
  supabase: AppDb,
  config: QuickbooksConfig,
  from: string,
  to: string,
  selections: ImportSelection[],
): Promise<{ saved: number; skipped: number }> {
  const chosen = new Map(selections.map((row) => [row.sourceId, row]));
  const preview = await pullExpensePreview(supabase, config, from, to);
  let saved = 0;
  let skipped = 0;
  for (const row of preview.rows) {
    const selection = chosen.get(row.sourceId);
    if (!selection) continue;
    if (row.skipReason || row.alreadySaved) {
      skipped += 1;
      continue;
    }
    const category = canonicalLegacyCategory(selection.category);
    if (!category) throw new Error("Choose a category for each selected row.");
    const mapping = mappingFromSelection(row, category, selection.remember);
    if (mapping) await upsertCategoryMapping(supabase, mapping);
    const inserted = await importExpense(supabase, {
      expenseDate: row.txnDate,
      category,
      amountCents: row.amountCents,
      note: row.note,
      sourceId: row.sourceId,
    });
    if (inserted) saved += 1;
    else skipped += 1;
  }
  return { saved, skipped };
}

export async function loadAccountChoices(
  supabase: AppDb,
  config: QuickbooksConfig,
): Promise<{ id: string; name: string; accountType: string }[]> {
  return withCaller(supabase, config, async (ready) => {
    const result = await fetchAccounts(ready);
    return result.accounts;
  });
}

export async function saveAccountChoices(supabase: AppDb, accounts: PostingAccounts): Promise<void> {
  if (!postingAccountsComplete(accounts)) {
    throw new Error("Pick all four accounts before saving.");
  }
  await savePostingAccounts(supabase, accounts);
}

export async function removeCategoryMapping(supabase: AppDb, id: string): Promise<void> {
  if (!id) throw new Error("Mapping is required.");
  await deleteCategoryMapping(supabase, id);
}

export type PushPreview = {
  weekStart: string;
  weekEnd: string;
  incomeCents: number;
  tolsonCents: number;
  lines: { postingType: "Debit" | "Credit"; accountName: string; amountCents: number; description: string }[];
  alreadyPosted: boolean;
  blocked: string | null;
};

export async function previewWeekPush(supabase: AppDb, weekRaw: string): Promise<PushPreview> {
  const weekStart = weekBoundsForDate(weekRaw).start;
  const overview = await loadOverview(weekStart);
  const cards = await loadManagementCardSummary(weekStart, overview.insOuts, overview.operatingExpenses);
  const accounts = await readPostingAccounts(supabase);
  const history = await listPushHistory(supabase);
  const blocked = overview.error || overview.insOutsError;
  let lines: PushPreview["lines"] = [];
  let blockMessage: string | null = blocked;
  if (!blocked) {
    if (cards.incomeCents === 0 && cards.tolsonPayableCents === 0) {
      blockMessage = "Nothing to post for this week. Income and Tolson payable are both $0.00.";
    } else if (!postingAccountsComplete(accounts)) {
      blockMessage = "Pick all four accounts and save them before posting.";
    } else {
      const journal = buildWeekJournal({
        weekStart,
        incomeCents: cards.incomeCents,
        tolsonCents: cards.tolsonPayableCents,
        accounts,
      });
      lines = journal?.lines ?? [];
    }
  }
  return {
    weekStart,
    weekEnd: overview.weekEnd,
    incomeCents: cards.incomeCents,
    tolsonCents: cards.tolsonPayableCents,
    lines,
    alreadyPosted: history.some((row) => row.weekStart === weekStart),
    blocked: blockMessage,
  };
}

export async function confirmWeekPush(
  supabase: AppDb,
  config: QuickbooksConfig,
  weekRaw: string,
  postedBy: string,
): Promise<{ qboId: string; weekStart: string; logged: boolean }> {
  const preview = await previewWeekPush(supabase, weekRaw);
  if (preview.blocked) throw new Error(preview.blocked);
  const accounts = await readPostingAccounts(supabase);
  const journal = buildWeekJournal({
    weekStart: preview.weekStart,
    incomeCents: preview.incomeCents,
    tolsonCents: preview.tolsonCents,
    accounts,
  });
  if (!journal) throw new Error("Nothing to post for this week. Income and Tolson payable are both $0.00.");
  const qboId = await withCaller(supabase, config, (ready) => postJournal(ready, journal.body));
  try {
    await insertPushHistory(supabase, {
      weekStart: preview.weekStart,
      qboId,
      incomeCents: preview.incomeCents,
      tolsonCents: preview.tolsonCents,
      postedBy,
    });
  } catch {
    return { qboId, weekStart: preview.weekStart, logged: false };
  }
  return { qboId, weekStart: preview.weekStart, logged: true };
}

export async function disconnectCompany(supabase: AppDb): Promise<void> {
  await disconnectQuickbooks(supabase);
}

export { plainError };
