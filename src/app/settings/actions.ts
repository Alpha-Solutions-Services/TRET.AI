"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import {
  createAdapters,
  getSelectableAdapter,
  type ImportSourceId,
} from "@/lib/vektor/adapters";

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function getImportSourceSettings(): Promise<{
  selected: ImportSourceId | null;
  adapters: Array<{
    id: ImportSourceId;
    label: string;
    selectable: boolean;
    configured: boolean;
    message: string;
  }>;
}> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { selected: null, adapters: [] };
  }

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("import_settings")
    .select("key, value_text")
    .in("key", ["import_source", "mcp_verified", "csv_column_mapping"]);

  const map = new Map((rows ?? []).map((r) => [r.key, r.value_text]));
  const selected = (map.get("import_source") as ImportSourceId | null) ?? null;
  const mcpVerified = map.get("mcp_verified") === "true";
  let csvMapping: Record<string, string> | null = null;
  const rawMap = map.get("csv_column_mapping");
  if (rawMap) {
    try {
      csvMapping = JSON.parse(rawMap) as Record<string, string>;
    } catch {
      csvMapping = null;
    }
  }

  const adapters = createAdapters({
    mcpVerified,
    mcpHasTokens: false, // encrypted token store OPEN until spike OAuth lands in app
    csvColumnMapping: csvMapping,
    apiBaseUrl: process.env.VEKTOR_API_BASE_URL ?? "",
    apiToken: process.env.VEKTOR_API_TOKEN ?? "",
  });

  return {
    selected,
    adapters: adapters.map((a) => {
      const st = a.status();
      return {
        id: st.id,
        label: st.label,
        selectable: st.selectable,
        configured: st.configured,
        message: st.message,
      };
    }),
  };
}

export async function setImportSourceAction(
  source: ImportSourceId | "",
): Promise<SettingsActionResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false, error: "You must be signed in." };
  }

  const supabase = await createClient();
  const current = await getImportSourceSettings();

  if (source === "") {
    await supabase
      .from("import_settings")
      .upsert({ key: "import_source", value_text: null, updated_at: new Date().toISOString() });
    revalidatePath("/settings");
    revalidatePath("/imports");
    return { ok: true };
  }

  const target = current.adapters.find((a) => a.id === source);
  if (!target?.selectable) {
    return {
      ok: false,
      error: target?.message ?? "That import source cannot be selected.",
    };
  }

  // Switching sources never deletes data — only updates the setting.
  await supabase
    .from("import_settings")
    .upsert({
      key: "import_source",
      value_text: source,
      updated_at: new Date().toISOString(),
    });

  revalidatePath("/settings");
  revalidatePath("/imports");
  return { ok: true };
}

/** Used by import action — resolve selectable adapter or null. */
export async function resolveSelectedAdapter() {
  const settings = await getImportSourceSettings();
  const adapters = createAdapters({
    mcpVerified:
      settings.adapters.find((a) => a.id === "mcp")?.message.includes("Ready") ??
      false,
    mcpHasTokens: false,
    csvColumnMapping: null,
    apiBaseUrl: process.env.VEKTOR_API_BASE_URL ?? "",
    apiToken: process.env.VEKTOR_API_TOKEN ?? "",
  });
  // Re-read flags properly
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("import_settings")
    .select("key, value_text")
    .in("key", ["import_source", "mcp_verified", "csv_column_mapping"]);
  const map = new Map((rows ?? []).map((r) => [r.key, r.value_text]));
  const mcpVerified = map.get("mcp_verified") === "true";
  let csvMapping: Record<string, string> | null = null;
  if (map.get("csv_column_mapping")) {
    try {
      csvMapping = JSON.parse(map.get("csv_column_mapping")!) as Record<
        string,
        string
      >;
    } catch {
      csvMapping = null;
    }
  }
  const live = createAdapters({
    mcpVerified,
    mcpHasTokens: false,
    csvColumnMapping: csvMapping,
    apiBaseUrl: process.env.VEKTOR_API_BASE_URL ?? "",
    apiToken: process.env.VEKTOR_API_TOKEN ?? "",
  });
  return getSelectableAdapter(
    live,
    (map.get("import_source") as ImportSourceId | null) ?? null,
  );
}
