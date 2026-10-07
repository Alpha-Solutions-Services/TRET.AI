import { createClient } from "@/lib/supabase/server";
import { compareSheetLoads, unitKey, type SheetLedgerRef, type SheetMismatch } from "@/lib/sheets/mismatch";

export async function syncSheetMismatches(input: {
  weekStart: string;
  weekEnd: string;
  sheet: SheetLedgerRef[];
  /** Unit keys whose sheets were read. Issues for other units are left alone. */
  readableUnitKeys: string[];
}): Promise<{ openCount: number | null; error: string | null }> {
  const supabase = await createClient();
  const { data: loads, error: loadsError } = await supabase
    .from("loads")
    .select("load_id, rate_cents, truck_unit_number, delivery_date")
    .gte("delivery_date", input.weekStart)
    .lte("delivery_date", input.weekEnd);
  if (loadsError) {
    return { openCount: null, error: loadsError.message };
  }
  const mismatches = compareSheetLoads({
    weekStart: input.weekStart,
    sheet: input.sheet,
    vektor: (loads ?? [])
      .filter((row) => row.load_id && row.truck_unit_number)
      .map((row) => ({
        unitNumber: row.truck_unit_number as string,
        loadId: row.load_id as string,
        rateCents: row.rate_cents,
      })),
  });
  const prefix = `sheet:${input.weekStart}:`;
  const { data: existing, error: existingError } = await supabase
    .from("issues")
    .select("id, rule, ref, status, message")
    .in("rule", ["sheet_load_missing", "sheet_rate_diff"]);
  if (existingError) {
    return { openCount: mismatches.length, error: existingError.message };
  }
  const weekRows = (existing ?? []).filter((row) => (row.ref ?? "").startsWith(prefix));
  const readable = new Set(input.readableUnitKeys);
  const wanted = new Map(mismatches.map((row) => [`${row.rule}|${row.ref}`, row]));
  for (const row of weekRows) {
    const key = `${row.rule}|${row.ref ?? ""}`;
    const unit = (row.ref ?? "").split(":")[2] ?? "";
    if (!wanted.has(key)) {
      if (row.status === "open" && readable.has(unit)) {
        await supabase.from("issues").update({ status: "resolved" }).eq("id", row.id);
      }
      continue;
    }
    const next = wanted.get(key)!;
    if (row.status === "open" && row.message !== next.message) {
      await supabase.from("issues").update({ message: next.message }).eq("id", row.id);
    }
    wanted.delete(key);
  }
  for (const row of wanted.values()) {
    await insertMismatch(supabase, row);
  }
  const openCount = mismatches.filter((row) => {
    const stored = weekRows.find((item) => item.rule === row.rule && item.ref === row.ref);
    return !stored || stored.status === "open";
  }).length;
  return { openCount, error: null };
}

async function insertMismatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: SheetMismatch,
): Promise<void> {
  await supabase.from("issues").insert({
    severity: "Warn",
    rule: row.rule,
    message: row.message,
    ref: row.ref,
    status: "open",
  });
}
