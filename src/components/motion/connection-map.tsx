"use client";

import dynamic from "next/dynamic";
import type { AiStatus } from "@/lib/llm-gateway/gemini";
import { geminiTone, toneCaption, type ConnectionTone } from "@/components/motion/tones";

const OriginMap = dynamic(() => import("@/components/motion/origin").then((mod) => mod.OriginMap), {
  loading: () => <div className="h-[312px]" aria-hidden="true" />,
});

export function ConnectionMap({
  vektor,
  sheets,
  quickbooks,
  gemini,
}: {
  vektor: ConnectionTone;
  sheets: ConnectionTone;
  quickbooks: ConnectionTone;
  gemini: AiStatus;
}) {
  const geminiState = geminiTone(gemini);
  return (
    <OriginMap
      nodes={[
        { label: "Vektor", tone: vektor, caption: toneCaption(vektor) },
        { label: "Google Sheets", tone: sheets, caption: toneCaption(sheets) },
        { label: "QuickBooks files", tone: quickbooks, caption: toneCaption(quickbooks) },
        { label: "Gemini AI", tone: geminiState, caption: gemini },
      ]}
    />
  );
}
