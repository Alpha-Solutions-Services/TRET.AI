import { describe, expect, it } from "vitest";
import {
  REQUIRED_APP_ENV_NAMES,
  getMissingRequiredEnvNames,
  isAppConfigured,
} from "./env";

describe("required app env", () => {
  it("lists the public Supabase names from .env.example", () => {
    expect([...REQUIRED_APP_ENV_NAMES]).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("reports missing or empty names without reading values into the result", () => {
    const missing = getMissingRequiredEnvNames({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "   ",
    });
    expect(missing).toEqual(["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  });

  it("returns public supabase config only when both values are present", async () => {
    const { getSupabasePublicConfig } = await import("./env");
    expect(
      getSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    expect(
      getSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toBeNull();
  });

  it("treats the app as configured only when both required names are set", () => {
    expect(
      isAppConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toBe(true);
    expect(
      isAppConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toBe(false);
  });
});
