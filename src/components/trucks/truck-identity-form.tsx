"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTruckIdentityAction } from "@/app/fuel/file-actions";
import { Button } from "@/components/ui/button";

export function TruckIdentityForm({
  truckId,
  ready,
  cards,
  plates,
  tags,
}: {
  truckId: string;
  ready: boolean;
  cards: string;
  plates: string;
  tags: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cardText, setCardText] = useState(cards);
  const [plateText, setPlateText] = useState(plates);
  const [tagText, setTagText] = useState(tags);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">
        Card, plate, and tag mappings are not available until the v0.0.0.29 migration is applied.
      </p>
    );
  }

  return (
    <form
      className="mt-6 space-y-3 border-t border-[var(--color-border)] pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await saveTruckIdentityAction({
            truckId,
            cards: cardText,
            plates: plateText,
            tags: tagText,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <h2 className="text-sm font-semibold">Fuel card, plate, and tag</h2>
      <p className="text-xs text-[var(--color-fg-muted)]">One value per line. A plate can include a state, such as UD12588 VA.</p>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--color-fg-muted)]">Card numbers</span>
        <textarea
          value={cardText}
          onChange={(event) => setCardText(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-[var(--color-border)] px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--color-fg-muted)]">Plates</span>
        <textarea
          value={plateText}
          onChange={(event) => setPlateText(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-[var(--color-border)] px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--color-fg-muted)]">Toll tags</span>
        <textarea
          value={tagText}
          onChange={(event) => setTagText(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-[var(--color-border)] px-3 py-2"
        />
      </label>
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm">Saved.</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save card, plate, and tag"}
      </Button>
    </form>
  );
}
