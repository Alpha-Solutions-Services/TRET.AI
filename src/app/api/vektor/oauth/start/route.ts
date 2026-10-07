import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { beginVektorAuthorization, oauthRedirectUri } from "@/lib/vektor/oauth/flow";
import { readTokenEncryptionKey, TOKEN_ENCRYPTION_ENV } from "@/lib/vektor/oauth/crypto";
import {
  asRpcClient,
  createSupabaseTokenStore,
  readVektorPublicStatus,
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

  const supabase = await createClient();
  const status = await readVektorPublicStatus(asRpcClient(supabase));
  if (!status.migrationReady) {
    return settingsRedirect(request, "needs_migration");
  }

  let encryptionKey: string;
  try {
    encryptionKey = readTokenEncryptionKey();
  } catch {
    return settingsRedirect(request, "needs_key");
  }

  try {
    const store = createSupabaseTokenStore(asRpcClient(supabase), encryptionKey);
    const authorizationUrl = await beginVektorAuthorization({
      redirectUri: oauthRedirectUri(request.url),
      store,
    });
    const response = NextResponse.redirect(authorizationUrl);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes(TOKEN_ENCRYPTION_ENV)) {
      return settingsRedirect(request, "needs_key");
    }
    if (/does not exist|schema cache/i.test(message)) {
      return settingsRedirect(request, "needs_migration");
    }
    return settingsRedirect(request, "failed");
  }
}
