import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyableError } from "@/components/copyable-error";
import { copyableErrorText } from "@/lib/sheets/present-error";

describe("CopyableError", () => {
  it("shows a plain headline and keeps the real cause on the copy control", () => {
    const detail = "error:1E08010C:DECODER routines::unsupported";
    const html = renderToStaticMarkup(
      createElement(CopyableError, {
        headline: "Google service account sign-in failed.",
        detail,
      }),
    );
    expect(html).toContain("Google private key on the server is the wrong format");
    expect(html).toContain(detail);
    expect(html).toContain(`data-error-detail="${detail}"`);
    expect(html).toContain("Copy");
    expect(html).not.toContain("\u2014");
    expect(html).not.toContain("\u2013");
    expect(copyableErrorText("Google service account sign-in failed.", detail)).toBe(detail);
  });
});
