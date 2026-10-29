import { DEFAULT_TARP_CENTS, TARP_SETTING_KEY } from "@/lib/loads/tarps";
import { createClient } from "@/lib/supabase/server";

/** The Fee settings tarp rate, or $50 when the setting is missing. */
export async function readTarpCentsPerLoad(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("import_settings")
      .select("value_int")
      .eq("key", TARP_SETTING_KEY)
      .maybeSingle();
    if (error || data?.value_int == null || data.value_int < 0) return DEFAULT_TARP_CENTS;
    return data.value_int;
  } catch {
    return DEFAULT_TARP_CENTS;
  }
}
