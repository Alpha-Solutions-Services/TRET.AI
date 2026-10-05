"use server";

import { redirect } from "next/navigation";
import { normalizeEmail } from "@/lib/allowed-users";
import { LOGIN_ERROR_MESSAGE } from "@/lib/auth/login-messages";
import { createClient } from "@/lib/supabase/server";

export async function signInAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return LOGIN_ERROR_MESSAGE;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return LOGIN_ERROR_MESSAGE;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    await supabase.auth.signOut();
    redirect("/access-denied");
  }

  const normalized = normalizeEmail(user.email);
  const { data: allowed, error: allowError } = await supabase
    .from("allowed_users")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  if (allowError || !allowed) {
    await supabase.auth.signOut();
    redirect("/access-denied");
  }

  redirect("/");
}
