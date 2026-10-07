"use client";

import { Button } from "@/components/ui/button";
import { GOOGLE_SHEET_MIGRATION_MESSAGE, TOLSON_MIGRATION_MESSAGE } from "@/lib/trucks/fields";
import type { TruckClass } from "@/lib/fee-engine";

export type TruckFormValues = {
  unitNumber: string;
  name: string;
  truckClass: TruckClass;
  ownerName: string;
  googleSheetUrl: string;
  tolsonPayableType: string;
  tolsonPayableValue: string;
};

type Props = {
  values: TruckFormValues;
  onChange: (patch: Partial<TruckFormValues>) => void;
  onSubmit: (event: React.FormEvent) => void;
  pending: boolean;
  formError: string | null;
  submitLabel: string;
  googleSheetReady: boolean;
  tolsonReady: boolean;
};

const inputClass = "h-10 w-full rounded-md border border-[var(--color-border)] px-3";

export function TruckFieldsForm({
  values,
  onChange,
  onSubmit,
  pending,
  formError,
  submitLabel,
  googleSheetReady,
  tolsonReady,
}: Props) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm">
        <span className="mb-1 block">Unit number</span>
        <input
          required
          value={values.unitNumber}
          onChange={(e) => onChange({ unitNumber: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block">Name</span>
        <input
          required
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={inputClass}
        />
      </label>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1">Class</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="truckClass"
            checked={values.truckClass === "legacy_owned"}
            onChange={() => onChange({ truckClass: "legacy_owned" })}
          />
          Legacy-owned
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="truckClass"
            checked={values.truckClass === "third_party"}
            onChange={() => onChange({ truckClass: "third_party" })}
          />
          Third-party
        </label>
      </fieldset>
      <label className="block text-sm">
        <span className="mb-1 block">Owner name (optional)</span>
        <input
          value={values.ownerName}
          onChange={(e) => onChange({ ownerName: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block">Google Sheet (optional)</span>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          disabled={!googleSheetReady || pending}
          value={values.googleSheetUrl}
          onChange={(e) => onChange({ googleSheetUrl: e.target.value })}
          placeholder="https://"
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
          {googleSheetReady
            ? "Paste the Google Sheet or portal sheet link for this truck."
            : GOOGLE_SHEET_MIGRATION_MESSAGE}
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block">Tolson payable</span>
        <select
          disabled={!tolsonReady || pending}
          value={values.tolsonPayableType}
          onChange={(e) =>
            onChange({
              tolsonPayableType: e.target.value,
              tolsonPayableValue: "",
            })
          }
          className={inputClass}
        >
          <option value="">Not set</option>
          <option value="percent_of_gross">Percent of gross</option>
          <option value="fixed_weekly">Fixed weekly amount</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block">Tolson payable value</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={!tolsonReady || pending || values.tolsonPayableType === ""}
          value={values.tolsonPayableValue}
          onChange={(e) => onChange({ tolsonPayableValue: e.target.value })}
          placeholder="Not set"
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
          {tolsonReady
            ? "Leave both blank when this truck has no Tolson payable. Percent of gross uses this week's sheet gross. A fixed weekly amount is dollars for the week. A blank setting counts as $0."
            : TOLSON_MIGRATION_MESSAGE}
        </span>
      </label>
      {formError ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
