import type { HubFeed } from "@/lib/overview/hub-feeds";

/** Warns when Vektor or Bestpass needs a new login. Hidden when both are connected. */
export function ConnectionBanner({ feeds }: { feeds: HubFeed[] }) {
  const notes: string[] = [];
  const vektor = feeds.find((feed) => feed.label === "Vektor");
  const tolls = feeds.find((feed) => feed.label === "Tolls");
  if (vektor && vektor.tone !== "connected") {
    notes.push("Vektor login or token is not active. Sign in again before the next Vektor import.");
  }
  if (tolls && tolls.tone !== "connected") {
    notes.push("Bestpass is not connected. Tolls stay out until that login is renewed.");
  }
  if (notes.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-3 text-sm" role="status">
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </div>
  );
}
