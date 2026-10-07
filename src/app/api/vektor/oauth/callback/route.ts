import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { completeVektorAuthorization } from "@/lib/vektor/oauth/flow";
import { readTokenEncryptionKey } from "@/lib/vektor/oauth/crypto";
import {
  asRpcClient,
  createSupabaseTokenStore,
} from "@/lib/vektor/oauth/supabase-store";

export const dynamic = "force-dynamic";

function settingsRedirect(request: Request, reason: string): NextResponse {
  const url = new URL("/settings", request.url);
  url.searchParams.set("vektor", reason);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return settingsRedirect(request, "denied");
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return settingsRedirect(request, "failed");
  }

  try {
    const supabase = await createClient();
    const store = createSupabaseTokenStore(asRpcClient(supabase), readTokenEncryptionKey());
    await completeVektorAuthorization({ code, state, store });
    return settingsRedirect(request, "connected");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "SIGN_IN_EXPIRED") {
      return settingsRedirect(request, "expired");
    }
    if (/does not exist|schema cache/i.test(message)) {
      return settingsRedirect(request, "needs_migration");
    }
    if (/VEKTOR_TOKEN_ENCRYPTION_KEY/.test(message)) {
      return settingsRedirect(request, "needs_key");
    }
    return settingsRedirect(request, "failed");
  }
}
