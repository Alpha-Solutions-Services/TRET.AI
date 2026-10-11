"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { assertMonday } from "@/lib/fee-engine";
import { closeWeek } from "@/lib/statements/queries";
import { createClient } from "@/lib/supabase/server";

export type CloseWeekResult = { ok: true } | { ok: false; error: string };

export async function closeWeekAction(weekStart: string): Promise<CloseWeekResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return { ok: false, error: "You must be signed in." };
  }
  try {
    assertMonday(weekStart, "Week start");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Week start must be a Monday.",
    };
  }
  const result = await closeWeek(weekStart);
  if (!result.ok) return result;
  revalidatePath("/statements");
  return { ok: true };
}

export async function acknowledgeRowCountAction(
  weekStart: string,
  kind: "loads" | "fuel" | "tolls",
  reason: string,
): Promise<CloseWeekResult> {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false, error: "You must be signed in." };
  const text = reason.trim();
  if (text.length < 3) return { ok: false, error: "Enter a reason before acknowledging the drop." };
  if (kind !== "loads" && kind !== "fuel" && kind !== "tolls") {
    return { ok: false, error: "Acknowledge one import type at a time." };
  }
  try {
    assertMonday(weekStart, "Week start");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Week start must be a Monday." };
  }
  const supabase = await createClient();
  const inserted = await supabase.from("issues").insert({
    severity: "Info",
    rule: "row_count_ack",
    message: text,
    ref: `${weekStart}:${kind}`,
    status: "resolved",
  });
  if (inserted.error) return { ok: false, error: inserted.error.message };
  revalidatePath("/statements");
  revalidatePath("/imports");
  return { ok: true };
}
