"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createTruckAction,
  setTruckActiveAction,
  updateTruckAction,
} from "@/app/trucks/actions";
import { GoogleSheetLink } from "@/components/trucks/google-sheet-link";
import {
  TruckFieldsForm,
  type TruckFormValues,
} from "@/components/trucks/truck-fields-form";
import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  GOOGLE_SHEET_MIGRATION_MESSAGE,
  TOLSON_MIGRATION_MESSAGE,
  formatTolsonPayableValue,
  parseTruckFields,
} from "@/lib/trucks/fields";
import { truckClassLabel } from "@/lib/fees/kinds";
import type { TruckRow } from "@/lib/trucks/queries";

type Props = {
  trucks: TruckRow[];
  feeSummaries: Record<string, string>;
  googleSheetReady: boolean;
  tolsonReady: boolean;
};

const emptyForm: TruckFormValues = {
  unitNumber: "",
  name: "",
  truckClass: "third_party",
  ownerName: "",
  googleSheetUrl: "",
  tolsonPayableType: "",
  tolsonPayableValue: "",
};

function formFromTruck(truck: TruckRow): TruckFormValues {
  return {
    unitNumber: truck.unit_number,
    name: truck.name,
    truckClass: truck.truck_class,
    ownerName: truck.owner_name ?? "",
    googleSheetUrl: truck.google_sheet_url ?? "",
    tolsonPayableType: truck.tolson_payable_type ?? "",
    tolsonPayableValue: formatTolsonPayableValue(truck.tolson_payable_type, truck.tolson_payable_value),
  };
}

export function TrucksClient({ trucks, feeSummaries, googleSheetReady, tolsonReady }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<TruckFormValues>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trucks;
    return trucks.filter(
      (t) =>
        t.unit_number.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    );
  }, [trucks, query]);

  function resetForm() {
    setValues(emptyForm);
    setEditingId(null);
    setFormError(null);
  }

  function openAdd() {
    resetForm();
    setPanelOpen(true);
  }

  function openEdit(truck: TruckRow) {
    setEditingId(truck.id);
    setValues(formFromTruck(truck));
    setFormError(null);
    setPanelOpen(true);
  }

  function onSaveTruck(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = parseTruckFields(values);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = editingId
        ? await updateTruckAction({ truckId: editingId, ...values })
        : await createTruckAction(values);
      if (!result.ok) {
        setFormError(result.error);
        toast(result.error, "error");
        return;
      }
      toast(editingId ? "Truck saved" : "Truck added", "success");
      resetForm();
      setPanelOpen(false);
      router.refresh();
    });
  }

  function onToggleActive(truck: TruckRow) {
    startTransition(async () => {
      const result = await setTruckActiveAction(truck.id, !truck.active);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(truck.active ? "Truck deactivated" : "Truck activated", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem]">Trucks</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Fee rates are set per truck. Trucks are never deleted. Deactivate a truck instead.
          </p>
        </div>
        <Button onClick={openAdd}>Add truck</Button>
      </div>

      <label className="block max-w-sm text-sm">
        <span className="mb-1 block text-[var(--color-fg-muted)]">Search</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Unit number or name"
          className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        />
      </label>

      {!googleSheetReady ? (
        <p className="text-sm text-[var(--color-fg-muted)]" role="status">
          {GOOGLE_SHEET_MIGRATION_MESSAGE} Unit, name, class, and owner can still be edited.
        </p>
      ) : null}
      {!tolsonReady ? (
        <p className="text-sm text-[var(--color-fg-muted)]" role="status">
          {TOLSON_MIGRATION_MESSAGE} Other truck fields can still be edited.
        </p>
      ) : null}

      {trucks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-field)] px-6 py-12 text-center">
          <p className="text-[var(--color-fg-muted)]">No trucks yet.</p>
          <Button className="mt-4" onClick={openAdd}>
            Add truck
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No trucks match that search.</p>
      ) : (
        <div className="material overflow-x-auto border border-[var(--color-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Class</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Google Sheet</th>
                <th className="px-4 py-3 font-medium">Current fees</th>
                <th className="px-4 py-3 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((truck) => (
                <tr
                  key={truck.id}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/trucks/${truck.id}`}
                      className="font-medium text-[var(--color-accent)] no-underline hover:underline"
                    >
                      {truck.unit_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{truck.name}</td>
                  <td className="px-4 py-3">{truckClassLabel(truck.truck_class)}</td>
                  <td className="px-4 py-3">{truck.owner_name ?? "None"}</td>
                  <td className="px-4 py-3">{truck.active ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <GoogleSheetLink
                      url={truck.google_sheet_url}
                      compact
                      label={`Open Google Sheet for ${truck.unit_number}`}
                    />
                  </td>
                  <td className="max-w-xs px-4 py-3 text-[var(--color-fg-muted)]">
                    {feeSummaries[truck.id] ?? "No fee rules yet"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="h-9"
                        disabled={pending}
                        onClick={() => openEdit(truck)}
                        aria-label={`Edit ${truck.unit_number}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-9"
                        disabled={pending}
                        onClick={() => onToggleActive(truck)}
                      >
                        {truck.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SidePanel
        open={panelOpen}
        title={editingId ? "Edit truck" : "Add truck"}
        onClose={() => {
          setPanelOpen(false);
          resetForm();
        }}
      >
        <TruckFieldsForm
          values={values}
          onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
          onSubmit={onSaveTruck}
          pending={pending}
          formError={formError}
          submitLabel={editingId ? "Save changes" : "Save truck"}
          googleSheetReady={googleSheetReady}
          tolsonReady={tolsonReady}
        />
      </SidePanel>
    </div>
  );
}
