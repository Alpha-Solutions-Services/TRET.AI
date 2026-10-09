"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFeeSettingsAction } from "@/app/fee-settings/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { FEE_SETTINGS_MIGRATION, feeModelLabel, type FeeSettingView } from "@/lib/fees/fee-settings";
import Link from "next/link";

const field = "h-10 w-full rounded-md border border-[var(--color-border)] px-3 text-sm";

export function TruckFeeCard({ row, ready }: { row: FeeSettingView; ready: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(row);
  const lease = draft.feeModel === "lease_to_tolson";

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
        <h2 className="text-lg font-semibold">Fee type</h2>
        <Link href="/fee-settings" className="text-sm underline">
          All trucks
        </Link>
      </div>
      {!ready ? <p className="text-sm text-[var(--color-danger)]">{FEE_SETTINGS_MIGRATION}</p> : null}
      <label className="block text-sm">
        <span className="mb-1 block">Type</span>
        <select
          className={field}
          disabled={!ready}
          value={draft.feeModel}
          onChange={(event) => setDraft({ ...draft, feeModel: event.target.value })}
        >
          <option value="lease_to_tolson">{feeModelLabel("lease_to_tolson")}</option>
          <option value="owner_management">{feeModelLabel("owner_management")}</option>
        </select>
      </label>
      <p className="text-sm text-[var(--color-fg-muted)]">
        {lease
          ? "This truck pays a 10 percent lease fee to Tolson. Leave the percent blank to keep 10 percent."
          : "This truck pays a 10 percent management fee. Leave the split blank until you know it. Legacy percent and Tolson percent must add up to the fee."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block">Fee percent</span>
          <input className={field} disabled={!ready} placeholder="10" value={draft.managementFeePct} onChange={(event) => setDraft({ ...draft, managementFeePct: event.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Effective from</span>
          <input className={field} disabled={!ready} placeholder="YYYY-MM-DD" value={draft.effectiveFrom} onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Tolson percent</span>
          <input className={field} disabled={!ready} placeholder="Not set" value={draft.tolsonPayablePct} onChange={(event) => setDraft({ ...draft, tolsonPayablePct: event.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Legacy percent</span>
          <input className={field} disabled={!ready || lease} placeholder="Not set" value={draft.legacyRetainedPct} onChange={(event) => setDraft({ ...draft, legacyRetainedPct: event.target.value })} />
        </label>
      </div>
      <Button type="submit" variant="vivid" disabled={!ready || pending}>
        {pending ? "Saving..." : "Save fee"}
      </Button>
    </form>
  );
}
