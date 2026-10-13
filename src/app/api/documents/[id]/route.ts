import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { readTruckDocumentFile } from "@/lib/documents/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const { id } = await context.params;
  const file = await readTruckDocumentFile(id);
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
