import { describe, expect, it } from "vitest";
import { interpretReceipt } from "./interpret";

const WEEK = { weekStart: "2026-10-05", weekEnd: "2026-10-11", truckUnit: "3", driverName: "Jose Rodriguez" };

describe("receipt photos", () => {
  it("suggests vendor, date, and amount", () => {
    const read = interpretReceipt({
      ...WEEK,
      fileName: "tarp-receipt.jpg",
      text: "Acme Tarp\n10/06/2026\nTotal $86.40\nJose Rodriguez\nUnit 3",
    });
    expect(read.skip).toBe(false);
    if (read.skip) return;
    expect(read.suggestion.vendor).toBe("Acme Tarp");
    expect(read.suggestion.isoDate).toBe("2026-10-06");
    expect(read.suggestion.amountCents).toBe(8640);
    expect(read.suggestion.flags).toEqual([]);
  });

  it("skips a file labeled Receipt that is a BOL", () => {
    const read = interpretReceipt({
      ...WEEK,
      fileName: "Receipt.pdf",
      text: "BILL OF LADING\nShipper Acme\nConsignee Beta",
    });
    expect(read).toEqual({ skip: true, reason: "This file is a BOL, not a receipt." });
  });

  it("flags a different vehicle, a different name, and a date outside the week", () => {
    const read = interpretReceipt({
      ...WEEK,
      fileName: "uber.jpg",
      text: "Uber\n10/02/2026\nTotal $42.00\nUnit 8\nAndrew King",
    });
    expect(read.skip).toBe(false);
    if (read.skip) return;
    expect(read.suggestion.flags).toEqual([
      "Date is outside this week.",
      "The vehicle on the receipt does not match this truck.",
      "The name on the receipt does not match the driver.",
    ]);
  });
});
