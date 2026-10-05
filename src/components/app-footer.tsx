import { formatFooterLabel, readAppVersion } from "@/lib/version";

export function AppFooter() {
  const version = readAppVersion();
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] px-6 py-4 text-sm text-[var(--color-fg-muted)]">
      {formatFooterLabel(version)}
    </footer>
  );
}
