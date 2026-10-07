import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { isAdminRole } from "@/lib/quickbooks/admin";
import { readQuickbooksConfig } from "@/lib/quickbooks/config";
import { beginConnect, plainError } from "@/lib/quickbooks/live";
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

  try {
    const supabase = await createClient();
    const authorizationUrl = await beginConnect(supabase, config);
    const response = NextResponse.redirect(authorizationUrl);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err) {
    if (err instanceof QuickbooksSchemaError) return back(request, "needs_migration");
    const message = plainError(err);
    if (/not ready|does not exist|schema cache/i.test(message)) return back(request, "needs_migration");
    return back(request, "failed");
  }
}
