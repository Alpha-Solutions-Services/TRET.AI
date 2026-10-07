import { describe, expect, it } from "vitest";
import { formatFooterLabel, readAppVersion } from "./version";

describe("version", () => {
  it("reads VERSION as the only source of truth", () => {
    expect(readAppVersion()).toBe("0.0.0.10");
  });

  it("formats the signed-in footer label", () => {
    expect(formatFooterLabel("0.0.0.4")).toBe("TRET.AI v0.0.0.4");
  });
});
