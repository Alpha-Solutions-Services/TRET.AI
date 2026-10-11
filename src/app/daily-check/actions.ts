"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { createClient } from "@/lib/supabase/server";

export async function approveDailyCheckAction(weekStart: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false, error: "You must be signed in." };
  const week = weekBoundsForDate(weekStart).start;
  const supabase = await createClient();
  const { error } = await supabase.from("issues").insert({
    severity: "Info",
    rule: "daily_check",
    message: `Daily check approved for week ${week}.`,
    status: "resolved",
    ref: week,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/daily-check");
  return { ok: true };
}
