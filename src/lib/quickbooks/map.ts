import { canonicalLegacyCategory } from "@/lib/legacy/expenses";
import type { ExpenseDraft } from "@/lib/quickbooks/parse";

export type MapKind = "vendor" | "account";

export type CategoryMapping = {
  id: string;
  sourceKind: MapKind;
  sourceId: string;
  sourceName: string;
  category: string;
};

export type PreviewRow = ExpenseDraft & {
  category: string | null;
  alreadySaved: boolean;
};

export function suggestCategory(row: ExpenseDraft, maps: CategoryMapping[]): string | null {
  if (row.vendorId) {
    const vendor = maps.find((map) => map.sourceKind === "vendor" && map.sourceId === row.vendorId);
    const category = vendor ? canonicalLegacyCategory(vendor.category) : null;
    if (category) return category;
  }
  if (row.accountId) {
    const account = maps.find((map) => map.sourceKind === "account" && map.sourceId === row.accountId);
    const category = account ? canonicalLegacyCategory(account.category) : null;
    if (category) return category;
  }
  return null;
}

export function buildImportPreview(
  drafts: ExpenseDraft[],
  maps: CategoryMapping[],
  existingSourceIds: ReadonlySet<string>,
): PreviewRow[] {
  return drafts.map((row) => ({
    ...row,
    category: row.skipReason ? null : suggestCategory(row, maps),
    alreadySaved: existingSourceIds.has(row.sourceId),
  }));
}

export type RememberChoice = "vendor" | "account" | "none";

export function mappingFromSelection(
  row: ExpenseDraft,
  category: string,
  remember: RememberChoice,
): { sourceKind: MapKind; sourceId: string; sourceName: string; category: string } | null {
  const canonical = canonicalLegacyCategory(category);
  if (!canonical || remember === "none") return null;
  if (remember === "vendor") {
    if (!row.vendorId) return null;
    return {
      sourceKind: "vendor",
      sourceId: row.vendorId,
      sourceName: row.vendorName,
      category: canonical,
    };
  }
  if (!row.accountId) return null;
  return {
    sourceKind: "account",
    sourceId: row.accountId,
    sourceName: row.accountName,
    category: canonical,
  };
}
