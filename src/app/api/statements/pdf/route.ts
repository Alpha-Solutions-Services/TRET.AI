import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { resolveWeekStart } from "@/lib/statements/queries";
import { buildMondayReportsPdf, buildWeeklyStatementPdf } from "@/lib/reports/queries";
import { ReportBlockedError } from "@/lib/reports/prepare";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const url = new URL(request.url);
  const week = url.searchParams.get("week") ?? undefined;
  const unit = url.searchParams.get("unit") ?? undefined;
  const monday = url.searchParams.get("monday") === "1";
  const weekStart = resolveWeekStart(week);
  try {
    const bytes = monday
      ? await buildMondayReportsPdf(weekStart)
      : await buildWeeklyStatementPdf(weekStart, unit || undefined);
    const filename = monday
      ? `tret-monday-reports-${weekStart}.pdf`
      : `tret-statement-${weekStart}${unit ? `-unit-${unit}` : ""}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
