import { describe, expect, it } from "vitest";
import { calculateFeeLines } from "@/lib/fee-engine";
import { bpToPercentString, percentStringToBp } from "./percent";
import { allowedFeeKindsForClass } from "./kinds";

describe("percentStringToBp", () => {
  it("converts 5.5 to 550 without float error", () => {
    // Hand-calc: 5.5% = 550 basis points (5*100 + 50)
    expect(percentStringToBp("5.5")).toBe(550);
  });

  it("converts 2.65 to 265 without float error", () => {
    // Hand-calc: 2.65% = 265 basis points (2*100 + 65)
    expect(percentStringToBp("2.65")).toBe(265);
  });

  it("converts 100 to 10000 and 0 to 0", () => {
    // Hand-calc: 100% = 10000 bp; 0% = 0 bp
    expect(percentStringToBp("100")).toBe(10000);
    expect(percentStringToBp("0")).toBe(0);
  });

  it("rejects more than 2 decimals and values over 100", () => {
    // Hand-calc: 1.234 has 3 decimals; 100.1 > 100
    expect(() => percentStringToBp("1.234")).toThrow();
    expect(() => percentStringToBp("100.1")).toThrow();
  });
});

describe("bpToPercentString", () => {
  it("formats 550 as 5.5 and 265 as 2.65", () => {
    // Hand-calc: reverse of percentStringToBp
    expect(bpToPercentString(550)).toBe("5.5");
    expect(bpToPercentString(265)).toBe("2.65");
  });
});

describe("form data through fee engine", () => {
  it("third-party form percents produce $5,800 sample lines", () => {
    // Hand-calc via form: 20→2000, 15→1500, 2.65→265, 10→1000, 5→500 on $5800
    const rules = [
      { kind: "DRIVER_PAY" as const, rateBp: percentStringToBp("20"), basePctBp: percentStringToBp("100") },
      { kind: "MANAGEMENT_FEE" as const, rateBp: percentStringToBp("15"), basePctBp: percentStringToBp("100") },
      { kind: "FACTORING_FEE" as const, rateBp: percentStringToBp("2.65"), basePctBp: percentStringToBp("100") },
      { kind: "TOLSON_PAYABLE" as const, rateBp: percentStringToBp("10"), basePctBp: percentStringToBp("100") },
      { kind: "LEGACY_RETAINED" as const, rateBp: percentStringToBp("5"), basePctBp: percentStringToBp("100") },
    ];
    const lines = calculateFeeLines({
      grossCents: 580_000,
      truckClass: "third_party",
      rules,
    });
    const byKind = Object.fromEntries(lines.map((l) => [l.kind, l.amountCents]));
    expect(byKind.DRIVER_PAY).toBe(116_000);
    expect(byKind.MANAGEMENT_FEE).toBe(87_000);
    expect(byKind.FACTORING_FEE).toBe(15_370);
    expect(byKind.TOLSON_PAYABLE).toBe(58_000);
    expect(byKind.LEGACY_RETAINED).toBe(29_000);
  });

  it("lists allowed kinds per class", () => {
    // Hand-calc: third-party includes management; legacy-owned does not
    expect(allowedFeeKindsForClass("third_party")).toContain("MANAGEMENT_FEE");
    expect(allowedFeeKindsForClass("legacy_owned")).not.toContain("MANAGEMENT_FEE");
    expect(allowedFeeKindsForClass("legacy_owned")).not.toContain("LEGACY_RETAINED");
  });
});
