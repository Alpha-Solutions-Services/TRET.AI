import { redirect } from "next/navigation";
import { AppFooter } from "@/components/app-footer";
import { AppNav } from "@/components/app-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemePicker } from "@/components/theme-picker";
import { checkAccess } from "@/lib/auth/access";
import { sheetsAccountHealth } from "@/lib/sheets/private-key";
import { createClient } from "@/lib/supabase/server";
import { readAppVersion } from "@/lib/version";

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
      <header className="material sticky top-0 z-20 flex items-center justify-between border-b border-[var(--color-border)] px-8 py-5">
        <div>
          <p className="text-lg font-medium tracking-[-0.03em]">TRET.AI</p>
          <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{title}</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemePicker />
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1120px] flex-1 gap-10 px-8 py-10">
        <aside className="w-52 shrink-0">
          <AppNav />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <AppFooter version={readAppVersion()} health={sheetsAccountHealth()} />
    </div>
  );
}
