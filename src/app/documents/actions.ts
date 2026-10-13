"use server";

import { revalidatePath } from "next/cache";
import { checkAccess } from "@/lib/auth/access";
import { DOCUMENT_BYTE_LIMIT, readReceiptDocument, readTonuDocument } from "@/lib/documents/read";
import { DOCUMENTS_MIGRATION_MESSAGE, insertTruckDocument, type DocumentKind } from "@/lib/documents/store";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { TONU_UNCONFIRMED } from "@/lib/loads/tonu";

export type DocumentActionResult = { ok: true; message: string } | { ok: false; error: string };

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);

async function requireUser(): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await checkAccess();
  if (access.status !== "allowed") return { ok: false, error: "You must be signed in." };
  return { ok: true };
}

async function bytesOf(form: FormData): Promise<{ fileName: string; contentType: string; bytes: Uint8Array } | { error: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo or PDF." };
  if (file.size > DOCUMENT_BYTE_LIMIT) return { error: "That file is larger than 1.5 MB." };
  const contentType = file.type || "application/octet-stream";
  if (!TYPES.has(contentType)) return { error: "Use a JPEG, PNG, WEBP, PDF, or text file." };
  return { fileName: file.name || "upload", contentType, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function uploadTonuRateConAction(form: FormData): Promise<DocumentActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const loadId = String(form.get("loadId") ?? "").trim();
  const truckUnit = String(form.get("truckUnit") ?? "").trim();
  const freight = Number(form.get("freightCents") ?? "");
  if (!loadId || !truckUnit || !Number.isInteger(freight) || freight < 0) {
    return { ok: false, error: "This TONU row is missing a load or a rate." };
  }
  const file = await bytesOf(form);
  if ("error" in file) return { ok: false, error: file.error };
  const read = await readTonuDocument(file, freight, process.env);
  if (read.busy) return { ok: false, error: "AI busy, try again." };
  if (read.unread) return { ok: false, error: "This file could not be read. Try a photo or a text PDF." };
  if (read.read.status !== "confirmed") {
    return { ok: false, error: `${TONU_UNCONFIRMED}. The file did not show a TONU fee different from the freight rate.` };
  }
  const saved = await insertTruckDocument({
    truckUnit,
    loadId,
    expenseId: null,
    kind: "tonu_rate_con",
    fileName: file.fileName,
    contentType: file.contentType,
    fileBase64: Buffer.from(file.bytes).toString("base64"),
    amountCents: read.read.amountCents,
    vendor: null,
    note: null,
    confirmed: true,
  });
  if (!saved.ok) return { ok: false, error: saved.missing ? DOCUMENTS_MIGRATION_MESSAGE : saved.error };
  revalidatePath("/loads");
  revalidatePath("/");
  revalidatePath("/ins-outs");
  const dollars = (read.read.amountCents / 100).toFixed(2);
  return { ok: true, message: `TONU rate confirmed at $${dollars}.` };
}

export async function uploadReceiptAction(form: FormData): Promise<DocumentActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const kind = String(form.get("kind") ?? "");
  if (kind !== "fuel_receipt" && kind !== "expense_receipt") return { ok: false, error: "Choose a fuel or expense receipt." };
  const truckUnit = String(form.get("truckUnit") ?? "").trim() || "fleet";
  const loadId = String(form.get("loadId") ?? "").trim() || null;
  const expenseId = String(form.get("expenseId") ?? "").trim() || null;
  const weekStart = String(form.get("weekStart") ?? "").trim();
  const file = await bytesOf(form);
  if ("error" in file) return { ok: false, error: file.error };
  const bounds = weekStart ? weekBoundsForDate(weekStart) : { start: "2000-01-03", end: "2000-01-09" };
  const read = await readReceiptDocument(
    file,
    { weekStart: bounds.start, weekEnd: bounds.end, truckUnit, driverName: null },
    process.env,
  );
  if (read.busy) return { ok: false, error: "AI busy, try again." };
  if (read.unread || !read.decision) return { ok: false, error: "This photo could not be read." };
  if (read.decision.skip) return { ok: false, error: read.decision.reason };
  const saved = await insertTruckDocument({
    truckUnit,
    loadId: kind === "fuel_receipt" ? loadId : null,
    expenseId: kind === "expense_receipt" ? expenseId : null,
    kind: kind as DocumentKind,
    fileName: file.fileName,
    contentType: file.contentType,
    fileBase64: Buffer.from(file.bytes).toString("base64"),
    amountCents: read.decision.suggestion.amountCents,
    vendor: read.decision.suggestion.vendor,
    note: read.decision.suggestion.flags.join(" "),
    confirmed: false,
  });
  if (!saved.ok) return { ok: false, error: saved.missing ? DOCUMENTS_MIGRATION_MESSAGE : saved.error };
  revalidatePath("/loads");
  revalidatePath("/operating-expenses");
  revalidatePath("/fuel");
  return { ok: true, message: "Receipt photo saved." };
}
