"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";

/** Drop the cached sheet read and load the truck sheets again. */
export async function rereadSheetsAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false, error: "You must be signed in." };
  revalidatePath("/");
  revalidatePath("/ins-outs");
  revalidatePath("/statements");
  revalidatePath("/issues");
  revalidatePath("/daily-check");
  return { ok: true };
}
