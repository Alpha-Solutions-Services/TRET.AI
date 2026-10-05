import { describe, expect, it } from "vitest";
import { LOGIN_ERROR_MESSAGE } from "./login-messages";

describe("login messages", () => {
  it("uses one generic failure message", () => {
    expect(LOGIN_ERROR_MESSAGE).toBe("Email or password is incorrect.");
  });
});
