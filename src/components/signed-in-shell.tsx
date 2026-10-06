import { redirect } from "next/navigation";
import { AppFooter } from "@/components/app-footer";
import { AppNav } from "@/components/app-nav";
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
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-8">
        <aside className="w-44 shrink-0">
          <AppNav />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <AppFooter />
    </div>
  );
}
