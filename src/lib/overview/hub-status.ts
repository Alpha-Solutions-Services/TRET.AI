import { sheetsTone, vektorTone } from "@/components/motion/tones";
import { readAiStatus, type AiStatus } from "@/lib/llm-gateway/gemini";
import { buildHubFeeds, type HubFeed } from "@/lib/overview/hub-feeds";
import { sheetsAccountHealth } from "@/lib/sheets/private-key";
import { createClient } from "@/lib/supabase/server";
import { asRpcClient, readVektorPublicStatus } from "@/lib/vektor/oauth/supabase-store";

async function rowCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "fuel_transactions" | "toll_transactions",
): Promise<number | null> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error || count == null) return null;
  return count;
}

/** Live connection words for the dashboard hub. Does not change week money. */
export async function loadHubStatus(): Promise<HubFeed[]> {
  const sheets = sheetsTone(sheetsAccountHealth().summary);
  const geminiPromise = readAiStatus(process.env).catch(() => "Not set" as AiStatus);

  let vektor = vektorTone(null);
  let fuelCount: number | null = null;
  let tollCount: number | null = null;
  try {
    const supabase = await createClient();
    try {
      const pub = await readVektorPublicStatus(asRpcClient(supabase));
      vektor = vektorTone(pub.status);
    } catch {
      vektor = vektorTone(null);
    }
    try {
      [fuelCount, tollCount] = await Promise.all([
        rowCount(supabase, "fuel_transactions"),
        rowCount(supabase, "toll_transactions"),
      ]);
    } catch {
      fuelCount = null;
      tollCount = null;
    }
  } catch {
    vektor = vektorTone(null);
  }

  const gemini = await geminiPromise;
  return buildHubFeeds({ vektor, sheets, fuelCount, tollCount, gemini });
}
