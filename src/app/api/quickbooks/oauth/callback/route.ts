import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { isAdminRole } from "@/lib/quickbooks/admin";
import { readQuickbooksConfig } from "@/lib/quickbooks/config";
import { finishConnect } from "@/lib/quickbooks/live";
import { QuickbooksSchemaError } from "@/lib/quickbooks/store";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function back(request: Request, reason: string): NextResponse {
  const url = new URL("/integrations", request.url);
  url.searchParams.set("quickbooks", reason);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!isAdminRole(access.role)) return back(request, "not_admin");

  const config = readQuickbooksConfig();
  if (!config) return back(request, "not_setup");

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return back(request, "denied");
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const realmId = url.searchParams.get("realmId") ?? "";
  if (!code || !state || !realmId) return back(request, "failed");

  try {
    const supabase = await createClient();
    await finishConnect({ supabase, config, code, state, realmId });
    return back(request, "connected");
  } catch (err) {
    if (err instanceof QuickbooksSchemaError) return back(request, "needs_migration");
    const message = err instanceof Error ? err.message : "";
    if (/expired/i.test(message)) return back(request, "expired");
    if (/does not exist|schema cache|not ready/i.test(message)) return back(request, "needs_migration");
    return back(request, "failed");
  }
}
