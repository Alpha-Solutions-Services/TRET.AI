import { describe, expect, it } from "vitest";
import {
  AI_STATUS_BUSY,
  AI_STATUS_NOT_SET,
  AI_STATUS_OK,
  GEMINI_BUSY_BACKOFF_MS,
  GEMINI_DEFAULT_MODEL,
  geminiJson,
  readAiStatus,
  suggestColumnMap,
} from "./gemini";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

describe("gemini gateway", () => {
  it("calls gemini-flash-latest and sends the key in a header", async () => {
    let seenUrl = "";
    let seenKey = "";
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenKey = new Headers(init?.headers).get("X-goog-api-key") ?? "";
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] } }],
      });
    }) as typeof fetch;
    const result = await geminiJson("headers only", { GEMINI_API_KEY: "secret-key" }, fetchImpl, async () => {});
    expect(seenUrl).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent`,
    );
    expect(seenUrl).not.toContain("secret-key");
    expect(seenUrl).not.toContain("key=");
    expect(seenKey).toBe("secret-key");
    expect(result).toEqual({ ok: true, value: { ok: true } });
  });

  it("lets GEMINI_MODEL override the default", async () => {
    let seenUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      seenUrl = String(url);
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    }) as typeof fetch;
    await geminiJson("headers only", { GEMINI_API_KEY: "secret-key", GEMINI_MODEL: "custom-flash" }, fetchImpl);
    expect(seenUrl).toContain("/models/custom-flash:generateContent");
  });

  it("retries a 503 twice, then reports the model is busy", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("high demand", { status: 503 });
    }) as typeof fetch;
    const result = await geminiJson("headers only", { GEMINI_API_KEY: "secret-key" }, fetchImpl, async (ms) => {
      sleeps.push(ms);
    });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([...GEMINI_BUSY_BACKOFF_MS]);
    expect(result).toEqual({ ok: false, busy: true });
  });

  it("uses a later try when the model recovers", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls < 3) return new Response("high demand", { status: 503 });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "{\"choice\":\"3\"}" }] } }] });
    }) as typeof fetch;
    const result = await geminiJson("one row", { GEMINI_API_KEY: "secret-key" }, fetchImpl, async () => {});
    expect(calls).toBe(3);
    expect(result).toEqual({ ok: true, value: { choice: "3" } });
  });

  it("treats an invalid key as a quiet skip", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("API key not valid", { status: 400 });
    }) as typeof fetch;
    const mapped = await suggestColumnMap(["Posted"], { GEMINI_API_KEY: "nope" }, fetchImpl, async () => {});
    expect(calls).toBe(1);
    expect(mapped).toEqual({ map: null, busy: false });
  });

  it("reports AI status without putting the key in the result", async () => {
    const missing = await readAiStatus({}, async () => {
      throw new Error("should not call");
    });
    expect(missing).toBe(AI_STATUS_NOT_SET);

    let seenUrl = "";
    const ok = await readAiStatus({ GEMINI_API_KEY: "secret-key" }, (async (url: string | URL | Request) => {
      seenUrl = String(url);
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] });
    }) as typeof fetch);
    expect(ok).toBe(AI_STATUS_OK);
    expect(seenUrl).not.toContain("secret-key");
    expect(JSON.stringify(ok)).not.toContain("secret-key");

    const busy = await readAiStatus(
      { GEMINI_API_KEY: "secret-key" },
      (async () => new Response("high demand", { status: 503 })) as typeof fetch,
      async () => {},
    );
    expect(busy).toBe(AI_STATUS_BUSY);

    const invalid = await readAiStatus(
      { GEMINI_API_KEY: "secret-key" },
      (async () => new Response("API key not valid", { status: 400 })) as typeof fetch,
      async () => {},
    );
    expect(invalid).toBe(AI_STATUS_NOT_SET);
  });

  it("does not call the model when the key is missing", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({});
    }) as typeof fetch;
    const result = await geminiJson("headers only", {}, fetchImpl);
    expect(calls).toBe(0);
    expect(result).toEqual({ ok: false, busy: false });
  });
});
