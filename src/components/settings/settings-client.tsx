"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  setImportSourceAction,
  type getImportSourceSettings,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ImportSourceId } from "@/lib/vektor/adapters";

type Settings = Awaited<ReturnType<typeof getImportSourceSettings>>;

export function SettingsClient({ initial }: { initial: Settings }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<ImportSourceId | "">(
    initial.selected ?? "",
  );

  function onSave() {
    startTransition(async () => {
      const result = await setImportSourceAction(selected);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Import source saved", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Choose how loads are imported. Switching sources never deletes loads or history.
        </p>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <legend className="px-1 text-sm font-medium">Import source</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="importSource"
            checked={selected === ""}
            onChange={() => setSelected("")}
          />
          <span>
            <span className="font-medium">None</span>
            <span className="block text-[var(--color-fg-muted)]">
              Import now stays disabled until a configured source is selected.
            </span>
          </span>
        </label>
        {initial.adapters.map((a) => (
          <label
            key={a.id}
            className={`flex items-start gap-2 text-sm ${
              a.selectable ? "" : "opacity-70"
            }`}
          >
            <input
              type="radio"
              name="importSource"
              disabled={!a.selectable}
              checked={selected === a.id}
              onChange={() => setSelected(a.id)}
            />
            <span>
              <span className="font-medium">{a.label}</span>
              <span className="block text-[var(--color-fg-muted)]">{a.message}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Button disabled={pending} onClick={onSave}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
