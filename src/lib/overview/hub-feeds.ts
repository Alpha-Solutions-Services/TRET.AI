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

export function buildHubFeeds(input: {
  vektor: ConnectionTone;
  sheets: ConnectionTone;
  fuelCount: number | null;
  tollCount: number | null;
  gemini: AiStatus;
}): HubFeed[] {
  const fuel = storedFeedTone(input.fuelCount);
  const tolls = storedFeedTone(input.tollCount);
  return [
    { label: "Vektor", tone: input.vektor, caption: toneCaption(input.vektor) },
    { label: "Sheets", tone: input.sheets, caption: toneCaption(input.sheets) },
    { label: "Fuel", tone: fuel, caption: storedFeedCaption(fuel) },
    { label: "Tolls", tone: tolls, caption: storedFeedCaption(tolls) },
    { label: "Gemini", tone: geminiTone(input.gemini), caption: input.gemini },
  ];
}
