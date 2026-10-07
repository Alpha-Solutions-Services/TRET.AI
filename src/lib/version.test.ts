import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_VERSION, formatFooterLabel } from "./app-version";
import { readAppVersion } from "./version";

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walk(path));
      continue;
    }
    if (path.endsWith(".ts") || path.endsWith(".tsx")) found.push(path);
  }
  return found;
}

describe("version", () => {
  it("reads VERSION as the only source of truth", () => {
    const previous = process.env.TRET_AI_VERSION;
    delete process.env.TRET_AI_VERSION;
    try {
      expect(readAppVersion()).toBe("0.0.0.19");
    } finally {
      if (previous === undefined) delete process.env.TRET_AI_VERSION;
      else process.env.TRET_AI_VERSION = previous;
    }
  });

  it("formats the signed-in footer label", () => {
    expect(formatFooterLabel("0.0.0.4")).toBe("TRET.AI v0.0.0.4");
    expect(formatFooterLabel()).toBe("TRET.AI v0.0.0.19");
    expect(APP_VERSION).toBe(readFileSync("VERSION", "utf8").trim());
  });

  it("keeps node:fs out of client components", () => {
    const appVersionSource = readFileSync("src/lib/app-version.ts", "utf8");
    expect(appVersionSource).not.toMatch(/from ["']node:fs["']/);
    expect(appVersionSource).not.toMatch(/from ["']node:path["']/);

    const footer = readFileSync("src/components/app-footer.tsx", "utf8");
    expect(footer).toContain("formatFooterLabel");
    expect(footer).not.toContain("@/lib/version");
    expect(footer).not.toMatch(/from ["']node:fs["']/);
    expect(footer).not.toMatch(/from ["']node:path["']/);

    const offenders: string[] = [];
    for (const path of walk("src")) {
      const text = readFileSync(path, "utf8");
      const client = text.slice(0, 200).includes("use client");
      if (!client) continue;
      if (text.includes("@/lib/version") || text.includes('from "./version"') || text.includes("from './version'")) {
        offenders.push(path);
      }
      if (/from ["']node:fs["']/.test(text) || /from ["']node:path["']/.test(text)) {
        offenders.push(`${path} imports node builtins`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
