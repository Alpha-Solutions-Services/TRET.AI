"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

export type ResolveIssueResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveIssueAction(issueId: string): Promise<ResolveIssueResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false, error: "You must be signed in." };
  }
  if (!UUID_RE.test(issueId)) {
    return { ok: false, error: "Issue not found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_issue", { p_issue_id: issueId });
  if (error) {
    if (isMissingSchemaError(error)) {
      return { ok: false, error: "Apply the v0.0.0.10 migration before resolving an issue." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/issues");
  revalidatePath("/");
  return { ok: true };
}
