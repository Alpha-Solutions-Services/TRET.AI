"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveFeeSettingsAction } from "@/app/fee-settings/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { FEE_SETTINGS_MIGRATION, feeTotalLabel, type FeeSettingView } from "@/lib/fees/fee-settings";

const field = "h-10 w-full rounded-md border border-[var(--color-border)] px-3 text-sm";

export function TruckFeeCard({ row, ready }: { row: FeeSettingView; ready: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(row);
  const total = feeTotalLabel(draft.legacyFeePct, draft.tolsonLeaseFeePct);

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveFeeSettingsAction([{ ...draft, truckId: row.truckId }]);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Fee saved", "success");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-md border border-[var(--color-border)] p-4" onSubmit={save}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Fee lines</h2>
        <Link href="/fee-settings" className="text-sm underline">
          All trucks
        </Link>
      </div>
      {!ready ? <p className="text-sm text-[var(--color-danger)]">{FEE_SETTINGS_MIGRATION}</p> : null}
      <p className="text-sm text-[var(--color-fg-muted)]">
        Both lines are a percent of this truck&apos;s weekly gross. The management fee is the two lines added together.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block">Legacy fee percent</span>
          <input className={field} disabled={!ready} value={draft.legacyFeePct} onChange={(event) => setDraft({ ...draft, legacyFeePct: event.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Tolson lease fee percent</span>
          <input className={field} disabled={!ready} value={draft.tolsonLeaseFeePct} onChange={(event) => setDraft({ ...draft, tolsonLeaseFeePct: event.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Management fee total</span>
          <input className={field} readOnly value={total === "" ? "" : `${total}%`} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Effective from</span>
          <input className={field} disabled={!ready} placeholder="YYYY-MM-DD" value={draft.effectiveFrom} onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })} />
        </label>
      </div>
      <Button type="submit" variant="vivid" disabled={!ready || pending}>
        {pending ? "Saving..." : "Save fee"}
      </Button>
    </form>
  );
}
