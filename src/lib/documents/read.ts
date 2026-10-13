import { geminiDocumentText } from "@/lib/llm-gateway/gemini";
import { readTonuRateCon, type TonuRead } from "@/lib/loads/tonu";
import { interpretReceipt, type ReceiptDecision } from "@/lib/receipts/interpret";

export const DOCUMENT_BYTE_LIMIT = 1_500_000;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type UploadFile = {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
};

export function textFromPdfBytes(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts: string[] = [];
  for (const match of raw.matchAll(/\((?:\\[()nrt\\]|[^)]){2,}\)/g)) {
    const inner = match[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-z$]/.test(inner)) parts.push(inner);
  }
  return parts.join("\n");
}

function localText(file: UploadFile): string {
  if (file.contentType === "text/plain" || file.fileName.toLowerCase().endsWith(".txt")) {
    return Buffer.from(file.bytes).toString("utf8");
  }
  if (file.contentType === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf")) {
    return textFromPdfBytes(file.bytes);
  }
  return "";
}

async function documentText(
  file: UploadFile,
  ask: string,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
): Promise<{ text: string; busy: boolean; unread: boolean }> {
  const local = localText(file);
  if (local.trim()) return { text: local, busy: false, unread: false };
  if (!IMAGE_TYPES.has(file.contentType) && file.contentType !== "application/pdf") {
    return { text: "", busy: false, unread: true };
  }
  const read = await geminiDocumentText(
    {
      mimeType: file.contentType,
      base64: Buffer.from(file.bytes).toString("base64"),
      ask,
    },
    env,
    fetchImpl,
  );
  if (!read.ok) return { text: "", busy: read.busy, unread: !read.busy };
  return { text: read.text, busy: false, unread: false };
}

const TONU_ASK =
  'Read this truck rate confirmation. Return JSON only: {"text":"the visible words, including any TONU fee and the freight rate"}.';

/** A held TONU rate con. A confirmed fee replaces the unconfirmed flag. A photo uses Gemini. */
export async function readTonuDocument(
  file: UploadFile,
  freightRateCents: number,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ read: TonuRead; busy: boolean; unread: boolean }> {
  if (file.bytes.byteLength > DOCUMENT_BYTE_LIMIT) {
    return { read: readTonuRateCon("", freightRateCents), busy: false, unread: true };
  }
  const text = await documentText(file, TONU_ASK, env, fetchImpl);
  if (!text.text) return { read: readTonuRateCon("", freightRateCents), busy: text.busy, unread: text.unread };
  return { read: readTonuRateCon(text.text, freightRateCents), busy: false, unread: false };
}

const RECEIPT_ASK =
  'Read this receipt photo. Return JSON only: {"text":"the vendor, date, total, unit, and name as printed"}.';

/** Fuel or expense receipt text. A photo uses Gemini, then the same receipt rules. */
export async function readReceiptDocument(
  file: UploadFile,
  context: { weekStart: string; weekEnd: string; truckUnit: string; driverName?: string | null },
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ decision: ReceiptDecision | null; busy: boolean; unread: boolean }> {
  if (file.bytes.byteLength > DOCUMENT_BYTE_LIMIT) {
    return { decision: null, busy: false, unread: true };
  }
  const text = await documentText(file, RECEIPT_ASK, env, fetchImpl);
  if (!text.text) return { decision: null, busy: text.busy, unread: text.unread };
  return {
    decision: interpretReceipt({
      fileName: file.fileName,
      text: text.text,
      weekStart: context.weekStart,
      weekEnd: context.weekEnd,
      truckUnit: context.truckUnit,
      driverName: context.driverName,
    }),
    busy: false,
    unread: false,
  };
}
