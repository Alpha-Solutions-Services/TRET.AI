"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createFeeRateVersionAction,
  deleteLatestFeeRateVersionAction,
  setTruckActiveAction,
  updateTruckAction,
} from "@/app/trucks/actions";
import { FixedExpensesPanel } from "@/components/trucks/fixed-expenses-panel";
import { TruckIdentityForm } from "@/components/trucks/truck-identity-form";
import { GoogleSheetLink } from "@/components/trucks/google-sheet-link";
import {
  TruckFieldsForm,
  type TruckFormValues,
} from "@/components/trucks/truck-fields-form";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { formatUtcStamp } from "@/lib/format-stamp";
import {
  calculateFeeLines,
  findContractForDate,
  mondayDateError,
  type FeeRuleInput,
  type FeeRuleKind,
  type TruckClass,
} from "@/lib/fee-engine";
import type { FixedExpenseBundle } from "@/lib/fixed-expenses/queries";
import {
  FEE_KIND_LABELS,
  allowedFeeKindsForClass,
  isInternalSplitKind,
  mandatoryFeeKindsForClass,
  truckClassLabel,
} from "@/lib/fees/kinds";
import { bpToPercentString, tryPercentStringToBp } from "@/lib/fees/percent";
import {
  GOOGLE_SHEET_MIGRATION_MESSAGE,
  TOLSON_MIGRATION_MESSAGE,
  formatTolsonPayableValue,
  parseTruckFields,
} from "@/lib/trucks/fields";
import type {
  FeeContractWithRules,
  TruckRow,
} from "@/lib/trucks/queries";

type RuleFormState = {
  enabled: boolean;
  ratePercent: string;
  basePercent: string;
};

type Props = {
  truck: TruckRow;
  contracts: FeeContractWithRules[];
  expenses: FixedExpenseBundle;
  lastChanged: { created_at: string; actor_email: string; action: string } | null;
  canDeleteLatest: boolean;
  googleSheetReady: boolean;
  tolsonReady: boolean;
  identityReady: boolean;
  identityCards: string;
  identityPlates: string;
  identityTags: string;
};

function emptyRules(
  truckClass: TruckClass,
  kinds: FeeRuleKind[],
): Record<FeeRuleKind, RuleFormState> {
  const out = {} as Record<FeeRuleKind, RuleFormState>;
  const mandatory = new Set(mandatoryFeeKindsForClass(truckClass));
  for (const kind of kinds) {
    out[kind] = {
      enabled: mandatory.has(kind),
      ratePercent: "",
      basePercent: "",
    };
  }
  return out;
}

export function TruckDetailClient({
  truck,
  contracts,
  expenses,
  lastChanged,
  canDeleteLatest,
  googleSheetReady,
  tolsonReady,
  identityReady,
  identityCards,
  identityPlates,
  identityTags,
}: Props) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"rates" | "expenses">("rates");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editValues, setEditValues] = useState<TruckFormValues>({
    unitNumber: truck.unit_number,
    name: truck.name,
    truckClass: truck.truck_class,
    ownerName: truck.owner_name ?? "",
    googleSheetUrl: truck.google_sheet_url ?? "",
    tolsonPayableType: truck.tolson_payable_type ?? "",
    tolsonPayableValue: formatTolsonPayableValue(truck.tolson_payable_type, truck.tolson_payable_value),
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [note, setNote] = useState("");
  const kinds = allowedFeeKindsForClass(truck.truck_class);
  const [ruleForms, setRuleForms] = useState(() =>
    emptyRules(truck.truck_class, kinds),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const [grossDollars, setGrossDollars] = useState("5800.00");
  const [calcDate, setCalcDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );

  const calcLines = useMemo(() => {
    try {
      const dollars = grossDollars.trim();
      if (!/^\d+(\.\d{1,2})?$/.test(dollars)) {
        return { error: "Enter gross as dollars with up to 2 decimals." };
      }
      const [w, f = ""] = dollars.split(".");
      const cents = Number.parseInt(w, 10) * 100 + Number.parseInt(f.padEnd(2, "0") || "0", 10);
      const mapped = contracts.map((c) => ({
        id: c.id,
        truckId: c.truck_id,
        effectiveFrom: c.effective_from,
        effectiveTo: c.effective_to,
      }));
      const contract = findContractForDate(mapped, calcDate);
      const full = contracts.find((c) => c.id === contract.id)!;
      const rules: FeeRuleInput[] = full.fee_rules.map((r) => ({
        kind: r.kind,
        rateBp: r.rate_bp,
        basePctBp: r.base_pct_bp,
      }));
      const lines = calculateFeeLines({
        grossCents: cents,
        truckClass: truck.truck_class,
        rules,
      });
      return { lines, contract: full };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not calculate",
      };
    }
  }, [grossDollars, calcDate, contracts, truck.truck_class]);

  function updateRule(kind: FeeRuleKind, patch: Partial<RuleFormState>) {
    setRuleForms((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  }

  function openNewVersion() {
    setEditOpen(false);
    setEffectiveFrom("");
    setNote("");
    setFormError(null);
    setRuleForms(emptyRules(truck.truck_class, kinds));
    setPanelOpen(true);
  }

  function onSaveVersion(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const mondayError = mondayDateError(effectiveFrom, "Effective from");
    if (mondayError) {
      setFormError(mondayError);
      return;
    }

    const mandatory = mandatoryFeeKindsForClass(truck.truck_class);
    const rules: Array<{ kind: string; rate_bp: number; base_pct_bp: number }> = [];

    for (const kind of kinds) {
      const row = ruleForms[kind];
      const required = mandatory.includes(kind);
      if (!row.enabled && !required) continue;
      if (required && !row.enabled) {
        setFormError(`${FEE_KIND_LABELS[kind]} is required for this truck class.`);
        return;
      }
      const rate = tryPercentStringToBp(row.ratePercent);
      if (!rate.ok) {
        setFormError(`${FEE_KIND_LABELS[kind]} rate: ${rate.error}`);
        return;
      }
      const base = tryPercentStringToBp(row.basePercent);
      if (!base.ok) {
        setFormError(`${FEE_KIND_LABELS[kind]} calculated on: ${base.error}`);
        return;
      }
      rules.push({ kind, rate_bp: rate.bp, base_pct_bp: base.bp });
    }

    startTransition(async () => {
      const result = await createFeeRateVersionAction({
        truckId: truck.id,
        effectiveFrom,
        note,
        rules,
      });
      if (!result.ok) {
        setFormError(result.error);
        toast(result.error, "error");
        return;
      }
      toast("Rate version saved", "success");
      setPanelOpen(false);
      router.refresh();
    });
  }

  function onDeleteLatest() {
    startTransition(async () => {
      const ok = await confirm({
        title: "Delete latest rate version?",
        message:
          "This removes the newest rate version only. Older versions stay. You can only do this while no weekly statements exist.",
        confirmLabel: "Delete latest",
        danger: true,
      });
      if (!ok) return;
      const result = await deleteLatestFeeRateVersionAction(truck.id);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Latest rate version deleted", "success");
      router.refresh();
    });
  }

  function openEdit() {
    setPanelOpen(false);
    setEditValues({
      unitNumber: truck.unit_number,
      name: truck.name,
      truckClass: truck.truck_class,
      ownerName: truck.owner_name ?? "",
      googleSheetUrl: truck.google_sheet_url ?? "",
      tolsonPayableType: truck.tolson_payable_type ?? "",
      tolsonPayableValue: formatTolsonPayableValue(truck.tolson_payable_type, truck.tolson_payable_value),
    });
    setEditError(null);
    setEditOpen(true);
  }

  function onSaveTruck(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    const parsed = parseTruckFields(editValues);
    if (!parsed.ok) {
      setEditError(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await updateTruckAction({ truckId: truck.id, ...editValues });
      if (!result.ok) {
        setEditError(result.error);
        toast(result.error, "error");
        return;
      }
      toast("Truck saved", "success");
      setEditOpen(false);
      router.refresh();
    });
  }

  function onToggleActive() {
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem]">
            {truck.unit_number}, {truck.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {truckClassLabel(truck.truck_class)}
            {truck.owner_name ? ` · Owner ${truck.owner_name}` : ""}
            {truck.active ? "" : " · Inactive"}
          </p>
          <p className="mt-2 text-sm">
            <span className="text-[var(--color-fg-muted)]">Google Sheet: </span>
            {truck.google_sheet_url ? (
              <GoogleSheetLink url={truck.google_sheet_url} />
            ) : (
              <span className="text-[var(--color-fg-muted)]">None yet</span>
            )}
          </p>
          {!googleSheetReady ? (
            <p className="mt-2 text-xs text-[var(--color-fg-muted)]" role="status">
              {GOOGLE_SHEET_MIGRATION_MESSAGE}
            </p>
          ) : null}
          {!tolsonReady ? (
            <p className="mt-2 text-xs text-[var(--color-fg-muted)]" role="status">
              {TOLSON_MIGRATION_MESSAGE}
            </p>
          ) : null}
          {lastChanged ? (
            <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
              Last changed {formatUtcStamp(lastChanged.created_at)} by{" "}
              {lastChanged.actor_email} ({lastChanged.action})
            </p>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-fg-muted)]">No changes logged yet.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending} onClick={openEdit}>
            Edit
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onToggleActive}>
            {truck.active ? "Deactivate" : "Activate"}
          </Button>
          {tab === "rates" ? (
            <Button onClick={openNewVersion}>New rate version</Button>
          ) : null}
          {tab === "rates" && contracts.length > 0 && canDeleteLatest ? (
            <Button variant="danger" disabled={pending} onClick={onDeleteLatest}>
              Delete latest version
            </Button>
          ) : null}
        </div>
      </div>

      <div role="tablist" aria-label="Truck sections" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="tab"
          id="truck-tab-rates"
          aria-selected={tab === "rates"}
          aria-controls="truck-panel-rates"
          className={
            tab === "rates"
              ? "inline-flex h-10 items-center rounded-md bg-[var(--color-accent)] px-3 text-sm font-medium text-[var(--color-on-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-on-accent)]"
              : "inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          }
          onClick={() => setTab("rates")}
        >
          Rates
        </button>
        <button
          type="button"
          role="tab"
          id="truck-tab-expenses"
          aria-selected={tab === "expenses"}
          aria-controls="truck-panel-expenses"
          className={
            tab === "expenses"
              ? "inline-flex h-10 items-center rounded-md bg-[var(--color-accent)] px-3 text-sm font-medium text-[var(--color-on-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-on-accent)]"
              : "inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          }
          onClick={() => setTab("expenses")}
        >
          Fixed expenses
        </button>
      </div>

      {tab === "expenses" ? (
        <div role="tabpanel" id="truck-panel-expenses" aria-labelledby="truck-tab-expenses">
          <FixedExpensesPanel
            truckId={truck.id}
            bundle={expenses}
            canDeleteLatest={canDeleteLatest}
          />
        </div>
      ) : (
        <div role="tabpanel" id="truck-panel-rates" aria-labelledby="truck-tab-rates" className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Rate versions</h2>
        {contracts.length === 0 ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            No rate versions yet. Add one to set fees for this truck.
          </p>
        ) : (
          <ul className="space-y-3">
            {contracts.map((c) => (
              <li
                key={c.id}
                className="material border border-[var(--color-border)] px-5 py-4"
              >
                <p className="font-medium">
                  {c.effective_from} through {c.effective_to ?? "open"}
                </p>
                {c.note ? (
                  <p className="text-sm text-[var(--color-fg-muted)]">{c.note}</p>
                ) : null}
                <ul className="mt-2 space-y-1 text-sm text-[var(--color-fg-muted)]">
                  {c.fee_rules.map((r) => (
                    <li key={r.id}>
                      {FEE_KIND_LABELS[r.kind]}: {bpToPercentString(r.rate_bp)}% on{" "}
                      {bpToPercentString(r.base_pct_bp)}% of gross
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="material space-y-4 border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold">Test calculator</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Uses the same fee engine as the rest of the app. Does not save anything.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-[var(--color-fg-muted)]">Gross (dollars)</span>
            <input
              value={grossDollars}
              onChange={(e) => setGrossDollars(e.target.value)}
              className="h-10 rounded-md border border-[var(--color-border)] px-3"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--color-fg-muted)]">Date</span>
            <input
              type="date"
              value={calcDate}
              onChange={(e) => setCalcDate(e.target.value)}
              className="h-10 rounded-md border border-[var(--color-border)] px-3"
            />
          </label>
        </div>
        {"error" in calcLines && calcLines.error ? (
          <p className="text-sm text-[var(--color-danger)]" role="alert">
            {calcLines.error}
          </p>
        ) : "lines" in calcLines && calcLines.lines ? (
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--color-fg-muted)]">
              <tr>
                <th className="py-2 pr-4 font-medium">Line</th>
                <th className="py-2 pr-4 font-medium">Rate</th>
                <th className="py-2 pr-4 font-medium">Base</th>
                <th className="py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {calcLines.lines.map((line) => {
                const internal = isInternalSplitKind(truck.truck_class, line.kind);
                return (
                  <tr
                    key={line.kind}
                    className={internal ? "text-[var(--color-fg-muted)]" : undefined}
                  >
                    <td className="py-1.5 pr-4">
                      {FEE_KIND_LABELS[line.kind]}
                      {internal ? " (internal split)" : ""}
                    </td>
                    <td className="py-1.5 pr-4">{bpToPercentString(line.rateBp)}%</td>
                    <td className="py-1.5 pr-4">{bpToPercentString(line.basePctBp)}%</td>
                    <td className="py-1.5">
                      ${(line.amountCents / 100).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>

      <SidePanel open={panelOpen} title="New rate version" onClose={() => setPanelOpen(false)}>
        <form className="space-y-4" onSubmit={onSaveVersion}>
          <label className="block text-sm">
            <span className="mb-1 block">Effective from</span>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--color-border)] px-3"
            />
            <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
              Must be a Monday.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--color-border)] px-3"
            />
          </label>

          <div className="space-y-4">
            {kinds.map((kind) => {
              const mandatory = mandatoryFeeKindsForClass(truck.truck_class).includes(kind);
              const row = ruleForms[kind];
              return (
                <fieldset
                  key={kind}
                  className="rounded-md border border-[var(--color-border)] p-3"
                >
                  <legend className="px-1 text-sm font-medium">
                    {FEE_KIND_LABELS[kind]}
                    {mandatory ? " (required)" : ""}
                  </legend>
                  {!mandatory ? (
                    <label className="mb-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) =>
                          updateRule(kind, { enabled: e.target.checked })
                        }
                      />
                      Include this rule
                    </label>
                  ) : null}
                  {(row.enabled || mandatory) && (
                    <div className="space-y-2">
                      <label className="block text-sm">
                        <span className="mb-1 block">Rate %</span>
                        <input
                          required
                          inputMode="decimal"
                          value={row.ratePercent}
                          onChange={(e) =>
                            updateRule(kind, { ratePercent: e.target.value })
                          }
                          className="h-10 w-full rounded-md border border-[var(--color-border)] px-3"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block">Calculated on % of gross</span>
                        <input
                          required
                          inputMode="decimal"
                          value={row.basePercent}
                          onChange={(e) =>
                            updateRule(kind, { basePercent: e.target.value })
                          }
                          className="h-10 w-full rounded-md border border-[var(--color-border)] px-3"
                          placeholder="No default. Enter a value"
                        />
                        <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
                          100 = the full gross amount, 95 = 95% of gross
                        </span>
                      </label>
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>

          {formError ? (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save rate version"}
          </Button>
        </form>
      </SidePanel>
        </div>
      )}

      <SidePanel open={editOpen} title="Edit truck" onClose={() => setEditOpen(false)}>
        <TruckFieldsForm
          values={editValues}
          onChange={(patch) => setEditValues((prev) => ({ ...prev, ...patch }))}
          onSubmit={onSaveTruck}
          pending={pending}
          formError={editError}
          submitLabel="Save changes"
          googleSheetReady={googleSheetReady}
          tolsonReady={tolsonReady}
        />
        <TruckIdentityForm
          truckId={truck.id}
          ready={identityReady}
          cards={identityCards}
          plates={identityPlates}
          tags={identityTags}
        />
      </SidePanel>
    </div>
  );
}
