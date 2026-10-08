import type { AiStatus } from "@/lib/llm-gateway/gemini";
import { fileAccountsComplete, type FileAccountNames } from "@/lib/quickbooks/file-journal";

export type ConnectionTone = "connected" | "not_set" | "busy";

export function sheetsTone(summary: string): ConnectionTone {
  return summary === "Sheet account is set." ? "connected" : "not_set";
}

export function quickbooksFileTone(accounts: FileAccountNames): ConnectionTone {
  return fileAccountsComplete(accounts) ? "connected" : "not_set";
}

export function quickbooksApiTone(status: string | null | undefined): ConnectionTone {
  return status === "connected" ? "connected" : "not_set";
}

export function vektorTone(status: "connected" | "needs_sign_in" | null): ConnectionTone {
  return status === "connected" ? "connected" : "not_set";
}

export function geminiTone(status: AiStatus): ConnectionTone {
  if (status === "Busy") return "busy";
  if (status === "OK") return "connected";
  return "not_set";
}

export function toneCaption(tone: ConnectionTone): string {
  if (tone === "connected") return "Connected";
  if (tone === "busy") return "Busy";
  return "Not set";
}
