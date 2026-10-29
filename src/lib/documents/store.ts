import { isMissingSchemaError } from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

export const DOCUMENTS_MIGRATION_MESSAGE =
  "Receipt photos and TONU rate confirmations need migration supabase/migrations/20261013180000_v41_truck_documents.sql. It has not been applied yet.";

export type DocumentKind = "tonu_rate_con" | "fuel_receipt" | "expense_receipt";

export type TruckDocumentRow = {
  id: string;
  truckUnit: string;
  loadId: string | null;
  expenseId: string | null;
  kind: DocumentKind;
  fileName: string;
  contentType: string;
  amountCents: number | null;
  vendor: string | null;
  note: string | null;
  confirmed: boolean;
};

type RawDocument = {
  id: string;
  truck_unit: string;
  load_id: string | null;
  expense_id: string | null;
  kind: DocumentKind;
  file_name: string;
  content_type: string;
  amount_cents: number | null;
  vendor: string | null;
  note: string | null;
  confirmed: boolean;
};

function present(row: RawDocument): TruckDocumentRow {
  return {
    id: row.id,
    truckUnit: row.truck_unit,
    loadId: row.load_id,
    expenseId: row.expense_id,
    kind: row.kind,
    fileName: row.file_name,
    contentType: row.content_type,
    amountCents: row.amount_cents,
    vendor: row.vendor,
    note: row.note,
    confirmed: row.confirmed,
  };
}

const LIST_COLUMNS =
  "id, truck_unit, load_id, expense_id, kind, file_name, content_type, amount_cents, vendor, note, confirmed";

export async function listTruckDocuments(): Promise<{ rows: TruckDocumentRow[]; ready: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("truck_documents")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingSchemaError(error)) return { rows: [], ready: false };
    return { rows: [], ready: false };
  }
  return { rows: (data ?? []).map((row) => present(row as RawDocument)), ready: true };
}

export async function listConfirmedTonuRates(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("truck_documents")
    .select("load_id, amount_cents, created_at")
    .eq("kind", "tonu_rate_con")
    .eq("confirmed", true)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingSchemaError(error)) throw new Error(DOCUMENTS_MIGRATION_MESSAGE);
    throw new Error("TONU confirmations could not be loaded.");
  }
  if (!data) throw new Error("TONU confirmations could not be loaded.");
  const rates: Record<string, number> = {};
  for (const row of data) {
    if (!row.load_id || row.amount_cents == null) continue;
    rates[row.load_id] = row.amount_cents;
  }
  return rates;
}

export async function insertTruckDocument(input: {
  truckUnit: string;
  loadId: string | null;
  expenseId: string | null;
  kind: DocumentKind;
  fileName: string;
  contentType: string;
  fileBase64: string;
  amountCents: number | null;
  vendor: string | null;
  note: string | null;
  confirmed: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; missing: boolean; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("truck_documents")
    .insert({
      truck_unit: input.truckUnit,
      load_id: input.loadId,
      expense_id: input.expenseId,
      kind: input.kind,
      file_name: input.fileName.slice(0, 200),
      content_type: input.contentType,
      file_base64: input.fileBase64,
      amount_cents: input.amountCents,
      vendor: input.vendor,
      note: input.note,
      confirmed: input.confirmed,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error && isMissingSchemaError(error)) return { ok: false, missing: true, error: DOCUMENTS_MIGRATION_MESSAGE };
    return { ok: false, missing: false, error: "Could not save the file." };
  }
  return { ok: true, id: data.id };
}

export async function readTruckDocumentFile(
  id: string,
): Promise<{ contentType: string; bytes: Buffer; fileName: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("truck_documents")
    .select("content_type, file_base64, file_name")
    .eq("id", id)
    .maybeSingle();
  if (error || !data?.file_base64) return null;
  return {
    contentType: data.content_type,
    bytes: Buffer.from(data.file_base64, "base64"),
    fileName: data.file_name,
  };
}
