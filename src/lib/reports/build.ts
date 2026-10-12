import { renderWeeklyStatementPdf } from "./pdf";
import { prepareWeeklyReport } from "./prepare";
import type { WeeklyReportSource } from "./types";

export async function weeklyStatementPdf(
  source: WeeklyReportSource,
  opts?: { allowDetailMismatch?: boolean },
): Promise<Uint8Array> {
  return renderWeeklyStatementPdf(prepareWeeklyReport(source, opts));
}
