import { redirect } from "next/navigation";
import { AppFooter } from "@/components/app-footer";
import { SignOutButton } from "@/components/sign-out-button";
import { checkAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export async function SignedInShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const access = await checkAccess();

  if (access.status === "anonymous") {
    redirect("/login");
  }

  if (access.status === "denied") {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/access-denied");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">TRET.AI</p>
          <p className="text-sm text-[var(--color-fg-muted)]">{title}</p>
        </div>
        <SignOutButton />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
      <AppFooter />
    </div>
  );
}
