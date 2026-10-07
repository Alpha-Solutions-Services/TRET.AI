import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { resolveWeekStart } from "@/lib/statements/queries";
import { buildWeeklyStatementPdf } from "@/lib/reports/queries";
import { ReportBlockedError } from "@/lib/reports/prepare";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const week = new URL(request.url).searchParams.get("week") ?? undefined;
  const weekStart = resolveWeekStart(week);
  try {
    const bytes = await buildWeeklyStatementPdf(weekStart);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tret-statement-${weekStart}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ReportBlockedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not build the PDF." }, { status: 500 });
  }
}
