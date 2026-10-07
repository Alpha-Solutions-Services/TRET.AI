"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { assertMonday } from "@/lib/fee-engine";
import { closeWeek } from "@/lib/statements/queries";

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
