"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { weekFieldsFromDeliveryDate } from "@/lib/vektor/dates";
import { canonicalLoadId, loadIdLookupForms, loadMatchKey } from "@/lib/loads/load-id";
import { isAdminRole } from "@/lib/quickbooks/admin";
import { loadSheetCompare } from "@/lib/sheets/compare-load";
import { highlightToField, type AlignHighlight, type LoadFacts } from "@/lib/sheets/align";
import { unitKey } from "@/lib/sheets/mismatch";
import { writeOneSheetCell, type SheetWriteField } from "@/lib/sheets/write-cell";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

const FIELDS = new Set(["rate", "delivery_date", "pickup_date", "loaded_miles", "deadhead", "driver", "presence"]);
const CHOICES = new Set(["use_sheet", "use_vektor", "write_sheet"]);
const WRITE_FIELDS = new Set(["rate", "delivery_date", "pickup_date", "loaded_miles", "deadhead", "driver"]);

type Fail = { ok: false; error: string };

function fieldLabel(field: string): string {
  if (field === "delivery_date") return "Delivery date";
  if (field === "pickup_date") return "Pickup date";
  if (field === "loaded_miles") return "Loaded miles";
  if (field === "deadhead") return "Deadhead miles";
  if (field === "driver") return "Driver";
  if (field === "rate") return "Rate";
  return "Load";
}

function factValue(field: string, facts: LoadFacts | null): string {
  if (!facts) return "";
  if (field === "rate") return facts.rateCents == null ? "" : String(facts.rateCents);
  if (field === "delivery_date") return facts.deliveryDay ?? "";
  if (field === "pickup_date") return facts.pickupDay ?? "";
  if (field === "loaded_miles") return facts.loadedMilesHundredths == null ? "" : String(facts.loadedMilesHundredths);
  if (field === "deadhead") return facts.deadheadMilesHundredths == null ? "" : String(facts.deadheadMilesHundredths);
  if (field === "driver") return facts.driverName ?? "";
  return "missing";
}

function milesNumber(raw: string): number | null {
  if (!raw) return null;
  const hundredths = Number(raw);
  if (!Number.isInteger(hundredths)) return null;
  return hundredths / 100;
}

export async function resolveSheetFieldAction(input: {
  weekStart: string;
  unitNumber: string;
  loadId: string;
  field: string;
  choice: string;
  note: string;
}): Promise<{ ok: true; message: string } | Fail> {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false, error: "You must be signed in." };
  if (!isAdminRole(access.role)) return { ok: false, error: "Only an admin can resolve a mismatch." };
  const note = input.note.trim();
  if (note.length < 3 || note.length > 200) {
    return { ok: false, error: "Enter a short note, at least 3 characters." };
  }
  if (!FIELDS.has(input.field) || !CHOICES.has(input.choice)) {
    return { ok: false, error: "That choice is not available." };
  }
  if (input.choice === "write_sheet" && !WRITE_FIELDS.has(input.field)) {
    return { ok: false, error: "Write to sheet is only for one value cell." };
  }

  const bounds = weekBoundsForDate(input.weekStart);
  const data = await loadSheetCompare({ weekStart: bounds.start, weekEnd: bounds.end, unit: input.unitNumber });
  const row = data.rows.find(
    (item) => unitKey(item.unitNumber) === unitKey(input.unitNumber) && loadMatchKey(item.loadId) === loadMatchKey(input.loadId),
  );
  if (!row) return { ok: false, error: "That load is not on this comparison." };
  const highlighted = new Set(row.highlights.map((item) => highlightToField(item as AlignHighlight)));
  if (!highlighted.has(input.field)) return { ok: false, error: "That field is not highlighted." };

  const sheetValue = factValue(input.field, row.sheet);
  const vektorValue = input.field === "presence" ? "missing" : factValue(input.field, row.vektor);
  if (input.choice === "use_sheet" && row.highlights.includes("missing_vektor")) {
    return { ok: false, error: "Import this load before using the sheet value." };
  }
  if (input.choice === "use_sheet" && !row.sheet) {
    return { ok: false, error: "This load is not on the sheet." };
  }

  const supabase = await createClient();
  const probe = await supabase.from("load_field_decisions").select("id").limit(1);
  if (probe.error && isMissingSchemaError(probe.error)) {
    return { ok: false, error: "Apply the v0.0.0.26 migration before resolving a mismatch." };
  }

  const forms = loadIdLookupForms(input.loadId);
  const existing = forms.length
    ? await supabase
        .from("loads")
        .select("id, load_id, truck_unit_number, rate_cents, delivery_date, pickup_date, loaded_distance_mi, deadhead_miles, driver_name")
        .in("load_id", forms)
    : { data: [], error: null };
  if (existing.error) return { ok: false, error: existing.error.message };
  const match = (existing.data ?? []).find(
    (item) =>
      item.load_id &&
      item.truck_unit_number &&
      unitKey(item.truck_unit_number) === unitKey(input.unitNumber) &&
      loadMatchKey(item.load_id) === loadMatchKey(input.loadId),
  );

  let previous = vektorValue;
  let next = vektorValue;
  if (input.choice === "use_sheet") {
    if (!match) return { ok: false, error: "Import this load before using the sheet value." };
    previous = factValue(input.field, row.vektor) || currentDbValue(input.field, match);
    next = sheetValue;
    const patch = sheetPatch(input.field, sheetValue);
    if (!patch.ok) return patch;
    const updated = await supabase.from("loads").update(patch.value).eq("id", match.id);
    if (updated.error) return { ok: false, error: updated.error.message };
    await supabase.from("change_log").insert({
      entity_type: "load",
      entity_id: match.id,
      action: "use_sheet",
      actor_email: access.email,
      before_data: { field: input.field, value: previous, note },
      after_data: { field: input.field, value: next, note },
    });
  }

  if (input.choice === "use_vektor") {
    next = vektorValue;
    previous = sheetValue;
    const saved = await supabase.from("load_field_acceptances").upsert(
      {
        unit_number: unitKey(input.unitNumber),
        load_key: loadMatchKey(input.loadId),
        field: input.field,
        accepted_value: vektorValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_number,load_key,field" },
    );
    if (saved.error) return { ok: false, error: saved.error.message };
  }

  if (input.choice === "write_sheet") {
    const trucks = await supabase.from("trucks").select("unit_number, google_sheet_url");
    const url =
      trucks.data?.find((item) => unitKey(item.unit_number) === unitKey(input.unitNumber))?.google_sheet_url ?? null;
    const sheetId = url ? /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url)?.[1] ?? null : null;
    if (!sheetId) return { ok: false, error: "This truck has no Google Sheet link." };
    const written = await writeOneSheetCell({
      spreadsheetId: sheetId,
      unitNumber: row.unitNumber,
      loadId: row.loadId,
      field: input.field as SheetWriteField,
      value: vektorValue,
    });
    if (!written.ok) return written;
    previous = sheetValue;
    next = vektorValue;
    if (match) {
      await supabase.from("change_log").insert({
        entity_type: "load",
        entity_id: match.id,
        action: "write_sheet",
        actor_email: access.email,
        before_data: { field: input.field, value: previous, note },
        after_data: { field: input.field, value: next, cell: written.a1, note },
      });
    }
  }

  const logged = await supabase.from("load_field_decisions").insert({
    unit_number: row.unitNumber,
    load_id: canonicalLoadId(row.loadId),
    load_key: loadMatchKey(row.loadId),
    field: input.field,
    choice: input.choice,
    note,
    previous_value: previous || null,
    new_value: next || null,
    actor_email: access.email,
  });
  if (logged.error) return { ok: false, error: logged.error.message };

  await closeMatchingIssues(supabase, data.weekStart, row.unitNumber, row.loadId, input.field);
  revalidatePath("/sheet-compare");
  revalidatePath("/issues");
  revalidatePath("/");
  const verb = input.choice === "use_sheet" ? "Used the sheet" : input.choice === "use_vektor" ? "Used Vektor" : "Wrote the sheet";
  return { ok: true, message: `${verb} for ${fieldLabel(input.field)} on ${canonicalLoadId(row.loadId)}.` };
}

function currentDbValue(
  field: string,
  row: {
    rate_cents: number | null;
    delivery_date: string | null;
    pickup_date: string | null;
    loaded_distance_mi: number | null;
    deadhead_miles: number | null;
    driver_name: string | null;
  },
): string {
  if (field === "rate") return row.rate_cents == null ? "" : String(row.rate_cents);
  if (field === "delivery_date") return row.delivery_date ? String(row.delivery_date).slice(0, 10) : "";
  if (field === "pickup_date") return row.pickup_date ? String(row.pickup_date).slice(0, 10) : "";
  if (field === "loaded_miles") return row.loaded_distance_mi == null ? "" : String(Math.round(row.loaded_distance_mi * 100));
  if (field === "deadhead") return row.deadhead_miles == null ? "" : String(Math.round(row.deadhead_miles * 100));
  if (field === "driver") return row.driver_name ?? "";
  return "";
}

function sheetPatch(
  field: string,
  value: string,
): { ok: true; value: Database["public"]["Tables"]["loads"]["Update"] } | Fail {
  if (field === "rate") {
    const cents = Number(value);
    if (!Number.isInteger(cents)) return { ok: false, error: "The sheet rate is blank." };
    return { ok: true, value: { rate_cents: cents } };
  }
  if (field === "delivery_date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, error: "The sheet delivery date is blank." };
    const week = weekFieldsFromDeliveryDate(value);
    return {
      ok: true,
      value: { delivery_date: value, week_start: week.weekStart, week_end: week.weekEnd, month_key: week.monthKey },
    };
  }
  if (field === "pickup_date") {
    return { ok: true, value: { pickup_date: value || null } };
  }
  if (field === "loaded_miles") return { ok: true, value: { loaded_distance_mi: milesNumber(value) } };
  if (field === "deadhead") return { ok: true, value: { deadhead_miles: milesNumber(value) } };
  if (field === "driver") return { ok: true, value: { driver_name: value || null } };
  return { ok: false, error: "Import this load before using the sheet value." };
}

async function closeMatchingIssues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weekStart: string,
  unitNumber: string,
  loadId: string,
  field: string,
): Promise<void> {
  const rules = field === "rate" ? ["sheet_rate_diff"] : field === "presence" ? ["sheet_load_missing"] : [];
  if (rules.length === 0) return;
  const prefix = `sheet:${weekStart}:${unitKey(unitNumber)}:${loadMatchKey(loadId)}`;
  const { data } = await supabase.from("issues").select("id, ref, rule").eq("status", "open").in("rule", rules);
  for (const issue of data ?? []) {
    const ref = issue.ref ?? "";
    const hit = field === "presence" ? ref === prefix : ref === prefix || ref.startsWith(`${prefix}:`);
    if (!hit) continue;
    await supabase.rpc("resolve_issue", { p_issue_id: issue.id });
  }
}
