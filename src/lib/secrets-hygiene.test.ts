import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function listTrackedFiles(): string[] {
  const output = execSync("git ls-files -z", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split("\0")
    .map((entry) => entry.replace(/\\/g, "/"))
    .filter(Boolean);
}

function isForbiddenSecretPath(path: string): boolean {
  if (path === ".env.example") return false;
  if (path === "SECRETS" || path.startsWith("SECRETS/")) return true;
  if (/(^|\/)\.env($|\.|$)/.test(path)) return true;
  if (/(^|\/)\.env/.test(path)) return true;
  return false;
}

describe("git secrets hygiene", () => {
  it("does not track SECRETS/ or .env* files except .env.example", () => {
    const tracked = listTrackedFiles();
    const offenders = tracked.filter(isForbiddenSecretPath);
    expect(offenders).toEqual([]);
  });
});
