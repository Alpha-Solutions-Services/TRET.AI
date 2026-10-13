import { googleSheetHref, needsSheetLink, NEEDS_SHEET_LINK } from "@/lib/trucks/fields";

type Props = {
  url: string | null;
  unitNumber?: string;
  compact?: boolean;
  label?: string;
};

export function GoogleSheetLink({ url, unitNumber, compact = false, label }: Props) {
  const href = googleSheetHref(url);
  if (!href) {
    if (unitNumber && needsSheetLink(unitNumber, url)) {
      return <span className="font-medium text-[var(--color-warn-fg)]">{NEEDS_SHEET_LINK}</span>;
    }
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
