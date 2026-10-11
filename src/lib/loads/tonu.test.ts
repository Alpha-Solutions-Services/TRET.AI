import { describe, expect, it } from "vitest";
import { TONU_UNCONFIRMED, readTonuRateCon, tonuHoldWeekStart } from "./tonu";

describe("TONU rate con", () => {
  it("uses a written TONU amount and sets loaded miles to 0", () => {
    const read = readTonuRateCon("Truck ordered not used. TONU fee $250.00. Original freight $2,000.00.", 200_000);
    expect(read).toEqual({ status: "confirmed", amountCents: 25_000, loadedMilesHundredths: 0 });
  });

  it("holds TBH--1201 when the rate con only has the full freight rate", () => {
    const read = readTonuRateCon("Rate confirmation TBH--1201. Total rate $2,000.00.", 200_000);
    expect(read.status).toBe("hold");
    if (read.status === "hold") expect(read.flag).toBe(TONU_UNCONFIRMED);
    expect(tonuHoldWeekStart("2026-10-07")).toBe("2026-10-12");
  });
});
