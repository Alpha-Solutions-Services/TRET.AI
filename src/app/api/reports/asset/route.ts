import { NextResponse } from "next/server";
import { buildAssetReportPdf } from "@/lib/asset-report/queries";
import { checkAccess } from "@/lib/auth/access";
import { resolveWeekStart } from "@/lib/statements/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await checkAccess();
  if (access.status !== "allowed") {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const url = new URL(request.url);
  const unit = url.searchParams.get("unit")?.trim() ?? "";
  if (!unit) {
    return NextResponse.json({ error: "Choose a truck unit." }, { status: 400 });
  }
  const weekStart = resolveWeekStart(url.searchParams.get("week") ?? undefined);
  try {
    const bytes = await buildAssetReportPdf(weekStart, unit);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="asset-report-${unit}-${weekStart}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build the asset report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
