import type { AiStatus } from "@/lib/llm-gateway/gemini";
import { geminiTone, toneCaption, type ConnectionTone } from "@/components/motion/tones";

export type HubFeed = {
  label: string;
  tone: ConnectionTone;
  caption: string;
};

/** Rows saved in TRET. Empty or a failed read is Not set. A truck sheet alone is not a connection. */
export function storedFeedTone(count: number | null): ConnectionTone {
  return count != null && count > 0 ? "connected" : "not_set";
}

export function storedFeedCaption(tone: ConnectionTone): string {
  return tone === "connected" ? "In TRET" : "Not set";
}

export function fileFeed(count: number | null, lastFile: boolean): { tone: ConnectionTone; caption: string } {
  if (count != null && count > 0) return { tone: "connected", caption: "In TRET" };
  if (lastFile) return { tone: "connected", caption: "Last file" };
  return { tone: "not_set", caption: "Not set" };
}

export function buildHubFeeds(input: {
  vektor: ConnectionTone;
  sheets: ConnectionTone;
  fuelCount: number | null;
  tollCount: number | null;
  gemini: AiStatus;
  /** A successful fuel file import, even when no fuel_transactions row was stored. */
  fuelFile?: boolean;
  tollFile?: boolean;
}): HubFeed[] {
  const fuel = fileFeed(input.fuelCount, input.fuelFile === true);
  const tolls = fileFeed(input.tollCount, input.tollFile === true);
  return [
    { label: "Vektor", tone: input.vektor, caption: toneCaption(input.vektor) },
    { label: "Sheets", tone: input.sheets, caption: toneCaption(input.sheets) },
    { label: "Fuel", tone: fuel.tone, caption: fuel.caption },
    { label: "Tolls", tone: tolls.tone, caption: tolls.caption },
    { label: "Gemini", tone: geminiTone(input.gemini), caption: input.gemini },
  ];
}
