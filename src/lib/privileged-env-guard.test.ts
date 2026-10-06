import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Built from parts so this test file itself does not contain the forbidden literals. */
const FORBIDDEN_ENV_NAMES = [
  ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
  ["ADMIN", "PASSWORD"].join("_"),
];

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

function isExemptFromEnvNameGuard(path: string): boolean {
  if (path.startsWith("scripts/")) return true;
  if (path.startsWith("docs/")) return true;
  if (path === ".env.example") return true;
  if (path === "CHANGELOG.md") return true;
  return false;
}

describe("privileged env name guard", () => {
  it("does not reference privileged local script env names outside scripts/", () => {
    const tracked = listTrackedFiles().filter((p) => !isExemptFromEnvNameGuard(p));
    const offenders: string[] = [];

    for (const path of tracked) {
      let text: string;
      try {
        text = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      for (const name of FORBIDDEN_ENV_NAMES) {
        if (text.includes(name)) {
          offenders.push(`${path} mentions ${name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
