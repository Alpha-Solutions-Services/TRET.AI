import { googleSheetHref } from "@/lib/trucks/fields";

type Props = {
  url: string | null;
  compact?: boolean;
  label?: string;
};

export function GoogleSheetLink({ url, compact = false, label }: Props) {
  const href = googleSheetHref(url);
  if (!href) {
    return <span className="text-[var(--color-fg-muted)]">—</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={compact ? (label ?? "Open Google Sheet") : undefined}
      className="font-medium break-all text-[var(--color-accent)] underline"
    >
      {compact ? "Open" : href}
    </a>
  );
}
