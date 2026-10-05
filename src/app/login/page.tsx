import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { checkAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const access = await checkAccess();

  if (access.status === "allowed") {
    redirect("/");
  }

  if (access.status === "denied") {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/access-denied");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-[var(--color-border)] bg-white p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">TRET.AI</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Sign in with your email and password.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
