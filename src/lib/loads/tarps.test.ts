import { describe, expect, it } from "vitest";
import { DEFAULT_TARP_CENTS, resolveTarpCents, tarpDollarsToCents } from "./tarps";

describe("tarps", () => {
  it("reads a sheet dollar amount and treats a blank cell as not tarped", () => {
    expect(tarpDollarsToCents("$50.00")).toBe(5_000);
    expect(tarpDollarsToCents("")).toBe(0);
    expect(tarpDollarsToCents(null)).toBe(0);
  });

  it("uses the sheet cell when it is present, and the fee rate only for a TRET load", () => {
    expect(
      resolveTarpCents({
        sheetCents: 5_000,
        storedCents: 9_000,
        rateCents: 7_500,
        storedTarped: true,
      }),
    ).toBe(5_000);
    expect(
      resolveTarpCents({
        sheetCents: 0,
        storedCents: 5_000,
        rateCents: 5_000,
        storedTarped: true,
      }),
    ).toBe(0);
    expect(
      resolveTarpCents({
        sheetCents: null,
        storedCents: 0,
        rateCents: 7_500,
        storedTarped: true,
      }),
    ).toBe(7_500);
    expect(
      resolveTarpCents({
        sheetCents: null,
        storedCents: null,
        rateCents: DEFAULT_TARP_CENTS,
        storedTarped: false,
      }),
    ).toBe(0);
  });
});
