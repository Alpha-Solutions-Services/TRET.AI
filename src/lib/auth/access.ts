import { createClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/allowed-users";

export type AccessCheckResult =
  | { status: "anonymous" }
  | { status: "allowed"; email: string; role: string }
  | { status: "denied"; email: string };

/**
 * Server-side allowlist check. Never trust the UI alone.
 * Uses the RLS-protected allowed_users table: a missing row means denied.
 */
export async function checkAccess(): Promise<AccessCheckResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { status: "anonymous" };
  }

  const email = normalizeEmail(user.email);

  const { data, error } = await supabase
    .from("allowed_users")
    .select("email, role")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    return { status: "denied", email };
  }

  return { status: "allowed", email: data.email, role: data.role };
}

export async function requireAllowedUser(): Promise<{ email: string; role: string }> {
  const result = await checkAccess();

  if (result.status === "anonymous") {
    throw new Error("UNAUTHENTICATED");
  }

  if (result.status === "denied") {
    throw new Error("ACCESS_DENIED");
  }

  return { email: result.email, role: result.role };
}
