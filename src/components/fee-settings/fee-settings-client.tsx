"use client";

import { useState, useTransition } from "react";
import { saveFeeSettingsAction, type FeeSaveRow } from "@/app/fee-settings/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { FEE_CSV_HEADER, feeModelLabel, parseFeeCsv, type FeeSettingView } from "@/lib/fees/fee-settings";

const field = "h-10 w-full min-w-[7rem] rounded-md border border-[var(--color-border)] px-2 text-sm";

type Props = {
  rows: FeeSettingView[];
  ready: boolean;
  error: string | null;
  migrationMessage: string | null;
};

export function FeeSettingsClient({ rows, ready, error, migrationMessage }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(rows);
  const [preview, setPreview] = useState<ReturnType<typeof parseFeeCsv> | null>(null);

  function patch(truckId: string, key: keyof FeeSettingView, value: string) {
    setDraft((current) => current.map((row) => (row.truckId === truckId ? { ...row, [key]: value } : row)));
  }

  function save(next: FeeSaveRow[]) {
    startTransition(async () => {
      const result = await saveFeeSettingsAction(next);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Fee settings saved", "success");
      setPreview(null);
    });
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setPreview(parseFeeCsv(text, draft.map((row) => ({ id: row.truckId, unitNumber: row.unitNumber }))));
    };
    reader.readAsText(file);
  }

  if (error) {
    return <p className="text-sm text-[var(--color-danger)]">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fee settings</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-muted)]">
          The first trucks on a lease to Tolson Black Hawk pay a 10 percent lease fee. Trucks 3 to 8, and any truck
          added later, pay a 10 percent management fee. Leave the split blank until you know it. Legacy percent and
          Tolson percent must add up to that fee.
        </p>
      </div>
      {!ready && migrationMessage ? <p className="text-sm text-[var(--color-danger)]">{migrationMessage}</p> : null}
      {draft.length === 0 ? <p className="text-sm">No trucks yet. Add a truck first.</p> : null}
      <div className="flex flex-wrap gap-2">
        <a href="/templates/fee-settings-template.csv" download>
          <Button type="button" variant="secondary">Download template CSV</Button>
        </a>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-[var(--color-border)] px-3 text-sm">
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>
        <Button type="button" variant="vivid" disabled={!ready || pending} onClick={() => save(draft)}>
          {pending ? "Saving..." : "Save all"}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="text-[var(--color-fg-muted)]">
              <th className="py-2 pr-2">Unit</th>
              <th className="py-2 pr-2">Fee type</th>
              <th className="py-2 pr-2">Fee percent</th>
              <th className="py-2 pr-2">Tolson percent</th>
              <th className="py-2 pr-2">Tolson fixed weekly</th>
              <th className="py-2 pr-2">Legacy percent</th>
              <th className="py-2 pr-2">Legacy fixed weekly</th>
              <th className="py-2 pr-2">Effective from</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((row) => (
              <tr key={row.truckId} className="border-t border-[var(--color-border)]">
                <td className="py-2 pr-2 font-medium">{row.unitNumber}</td>
                <td className="py-2 pr-2">
                  <select className={field} value={row.feeModel} disabled={!ready} onChange={(event) => patch(row.truckId, "feeModel", event.target.value)}>
                    <option value="lease_to_tolson">{feeModelLabel("lease_to_tolson")}</option>
                    <option value="owner_management">{feeModelLabel("owner_management")}</option>
                  </select>
                </td>
                {(["managementFeePct", "tolsonPayablePct", "tolsonFixedWeekly", "legacyRetainedPct", "legacyFixedWeekly", "effectiveFrom"] as const).map((key) => (
                  <td key={key} className="py-2 pr-2">
                    <input
                      className={field}
                      value={row[key]}
                      disabled={!ready}
                      placeholder={key === "effectiveFrom" ? "YYYY-MM-DD" : "Not set"}
                      onChange={(event) => patch(row.truckId, key, event.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">CSV preview</h2>
          {preview.length === 0 ? <p className="text-sm">The file has no rows.</p> : null}
          <ul className="space-y-1 text-sm">
            {preview.map((row, index) => (
              <li key={`${row.unit}-${index}`}>
                Unit {row.unit || "blank"}: {row.error ?? "Ready to save"}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="vivid"
            disabled={pending || preview.some((row) => row.error || !row.form || !row.truckId)}
            onClick={() =>
              save(
                preview.flatMap((row) =>
                  row.form && row.truckId ? [{ ...row.form, truckId: row.truckId }] : [],
                ),
              )
            }
          >
            Save CSV
          </Button>
          <p className="text-xs text-[var(--color-fg-muted)]">{FEE_CSV_HEADER}</p>
        </section>
      ) : null}
    </div>
  );
}
