import { describe, expect, it } from "vitest";
import { readReceiptDocument, readTonuDocument, textFromPdfBytes } from "./read";

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Length 68 >>\nstream\nBT (TONU fee $250.00. Original freight $2,000.00.) Tj ET\nendstream\nendobj\n",
  "latin1",
);

describe("TONU rate con upload", () => {
  it("reads a written TONU fee from a PDF without calling Gemini", async () => {
    let called = false;
    const result = await readTonuDocument(
      { fileName: "rate-con.pdf", contentType: "application/pdf", bytes: PDF },
      200_000,
      { GEMINI_API_KEY: "secret" },
      async () => {
        called = true;
        return new Response("no");
      },
    );
    expect(called).toBe(false);
    expect(result.read).toEqual({ status: "confirmed", amountCents: 25_000, loadedMilesHundredths: 0 });
  });

  it("reads a photo through Gemini and replaces the unconfirmed rate", async () => {
    const result = await readTonuDocument(
      { fileName: "rate.jpg", contentType: "image/jpeg", bytes: Uint8Array.from([1, 2, 3]) },
      200_000,
      { GEMINI_API_KEY: "secret-key" },
      async (url, init) => {
        expect(String(url)).toContain("gemini-flash-latest:generateContent");
        expect(new Headers(init?.headers).get("X-goog-api-key")).toBe("secret-key");
        expect(String(url)).not.toContain("secret-key");
        const body = JSON.parse(String(init?.body)) as { contents: { parts: { inline_data?: { mime_type: string } }[] }[] };
        expect(body.contents[0]?.parts.some((part) => part.inline_data?.mime_type === "image/jpeg")).toBe(true);
        return Response.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ text: "TONU fee $250.00" }) }] } }],
        });
      },
    );
    expect(result.read.status).toBe("confirmed");
    if (result.read.status === "confirmed") expect(result.read.amountCents).toBe(25_000);
  });

  it("keeps the unconfirmed flag when the photo only has the freight rate", async () => {
    const result = await readTonuDocument(
      { fileName: "rate.jpg", contentType: "image/jpeg", bytes: Uint8Array.from([1]) },
      200_000,
      { GEMINI_API_KEY: "secret-key" },
      async () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ text: "Total rate $2,000.00" }) }] } }],
        }),
    );
    expect(result.read.status).toBe("hold");
  });
});

describe("receipt photos", () => {
  it("pulls printable PDF text", () => {
    expect(textFromPdfBytes(PDF)).toContain("TONU fee $250.00");
  });

  it("reads a receipt photo through Gemini", async () => {
    const result = await readReceiptDocument(
      { fileName: "tarp.jpg", contentType: "image/jpeg", bytes: Uint8Array.from([9]) },
      { weekStart: "2026-10-05", weekEnd: "2026-10-11", truckUnit: "3", driverName: "Jose Rodriguez" },
      { GEMINI_API_KEY: "secret-key" },
      async () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ text: "Acme Tarp\n10/06/2026\nTotal $86.40\nUnit 3\nJose Rodriguez" }) }],
              },
            },
          ],
        }),
    );
    expect(result.decision?.skip).toBe(false);
    if (!result.decision || result.decision.skip) return;
    expect(result.decision.suggestion.amountCents).toBe(8640);
    expect(result.decision.suggestion.vendor).toBe("Acme Tarp");
  });
});
