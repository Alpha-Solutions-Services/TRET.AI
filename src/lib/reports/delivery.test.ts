import { describe, expect, it } from "vitest";
import { isoWeekNumber, lastFinishedWeekStart, reportDeliveryLabel } from "./delivery";

describe("report delivery week", () => {
  it("names week 41 and the Monday it is delivered", () => {
    expect(isoWeekNumber("2026-10-05")).toBe(41);
    expect(reportDeliveryLabel("2026-10-05")).toBe("Report for week 41, deliver Monday Oct 12");
  });

  it("defaults to the last finished week", () => {
    expect(lastFinishedWeekStart("2026-10-09")).toBe("2026-09-28");
    expect(reportDeliveryLabel("2026-09-28")).toBe("Report for week 40, deliver Monday Oct 5");
    expect(lastFinishedWeekStart("2026-10-12")).toBe("2026-10-05");
  });
});
