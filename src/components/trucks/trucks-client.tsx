"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createTruckAction,
  setTruckActiveAction,
} from "@/app/trucks/actions";
import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { TruckClass } from "@/lib/fee-engine";
import { truckClassLabel } from "@/lib/fees/kinds";
import type { TruckRow } from "@/lib/trucks/queries";

type Props = {
  trucks: TruckRow[];
  feeSummaries: Record<string, string>;
};

export function TrucksClient({ trucks, feeSummaries }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [unitNumber, setUnitNumber] = useState("");
  const [name, setName] = useState("");
  const [truckClass, setTruckClass] = useState<TruckClass>("third_party");
  const [ownerName, setOwnerName] = useState("");
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
    setUnitNumber("");
    setName("");
    setTruckClass("third_party");
    setOwnerName("");
    setFormError(null);
  }

  function onAddTruck(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await createTruckAction({
        unitNumber,
        name,
        truckClass,
        ownerName,
      });
      if (!result.ok) {
        setFormError(result.error);
        toast(result.error, "error");
        return;
      }
      toast("Truck added", "success");
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trucks</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Fee rates are set per truck. Trucks are never deleted — deactivate instead.
          </p>
        </div>
        <Button onClick={() => setPanelOpen(true)}>Add truck</Button>
      </div>

      <label className="block max-w-sm text-sm">
        <span className="mb-1 block text-[var(--color-fg-muted)]">Search</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Unit number or name"
          className="h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        />
      </label>

      {trucks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-6 py-12 text-center">
          <p className="text-[var(--color-fg-muted)]">No trucks yet.</p>
          <Button className="mt-4" onClick={() => setPanelOpen(true)}>
            Add truck
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No trucks match that search.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Class</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Active</th>
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
                  <td className="px-4 py-3">{truck.owner_name ?? "—"}</td>
                  <td className="px-4 py-3">{truck.active ? "Yes" : "No"}</td>
                  <td className="max-w-xs px-4 py-3 text-[var(--color-fg-muted)]">
                    {feeSummaries[truck.id] ?? "No fee rules yet"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="secondary"
                      className="h-9"
                      disabled={pending}
                      onClick={() => onToggleActive(truck)}
                    >
                      {truck.active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SidePanel
        open={panelOpen}
        title="Add truck"
        onClose={() => {
          setPanelOpen(false);
          resetForm();
        }}
      >
        <form className="space-y-4" onSubmit={onAddTruck}>
          <label className="block text-sm">
            <span className="mb-1 block">Unit number</span>
            <input
              required
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--color-border)] px-3"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--color-border)] px-3"
            />
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1">Class</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="truckClass"
                checked={truckClass === "legacy_owned"}
                onChange={() => setTruckClass("legacy_owned")}
              />
              Legacy-owned
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="truckClass"
                checked={truckClass === "third_party"}
                onChange={() => setTruckClass("third_party")}
              />
              Third-party
            </label>
          </fieldset>
          <label className="block text-sm">
            <span className="mb-1 block">Owner name (optional)</span>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--color-border)] px-3"
            />
          </label>
          {formError ? (
            <p className="text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save truck"}
          </Button>
        </form>
      </SidePanel>
    </div>
  );
}
