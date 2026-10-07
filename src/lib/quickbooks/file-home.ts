import type { FileAccountNames } from "@/lib/quickbooks/file-journal";
import { emptyFileAccountNames } from "@/lib/quickbooks/file-journal";
import type { FileCategoryMap } from "@/lib/quickbooks/file-import";
import { createClient } from "@/lib/supabase/server";

export type FileQuickbooksHome = {
  accounts: FileAccountNames;
  maps: FileCategoryMap[];
};

function readAccounts(raw: string | null | undefined): FileAccountNames {
  const empty = emptyFileAccountNames();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<FileAccountNames>;
    return {
      feeDebitName: parsed.feeDebitName ?? "",
      feeCreditName: parsed.feeCreditName ?? "",
      tolsonDebitName: parsed.tolsonDebitName ?? "",
      tolsonCreditName: parsed.tolsonCreditName ?? "",
    };
  } catch {
    return empty;
  }
}

function readMaps(raw: string | null | undefined): FileCategoryMap[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FileCategoryMap[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row) =>
        row &&
        (row.kind === "vendor" || row.kind === "account") &&
        typeof row.name === "string" &&
        typeof row.category === "string",
    );
  } catch {
    return [];
  }
}

export async function loadFileQuickbooksHome(): Promise<FileQuickbooksHome> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("import_settings")
    .select("key, value_text")
    .in("key", ["qbo_file_accounts", "qbo_file_category_map"]);
  const map = new Map((data ?? []).map((row) => [row.key, row.value_text]));
  return {
    accounts: readAccounts(map.get("qbo_file_accounts")),
    maps: readMaps(map.get("qbo_file_category_map")),
  };
}
