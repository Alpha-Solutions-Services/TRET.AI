import { describe, expect, it } from "vitest";
import { isEmailAllowed, normalizeEmail } from "./allowed-users";

describe("allowed-users", () => {
  it("normalizes email for comparison", () => {
    expect(normalizeEmail("  Alpha@Example.COM ")).toBe("alpha@example.com");
  });

  it("allows only listed emails", () => {
    const allowed = ["alphaassistant.alpha@gmail.com"];
    expect(isEmailAllowed("alphaassistant.alpha@gmail.com", allowed)).toBe(true);
    expect(isEmailAllowed("AlphaAssistant.Alpha@gmail.com", allowed)).toBe(true);
    expect(isEmailAllowed("other@gmail.com", allowed)).toBe(false);
    expect(isEmailAllowed(null, allowed)).toBe(false);
  });
});
