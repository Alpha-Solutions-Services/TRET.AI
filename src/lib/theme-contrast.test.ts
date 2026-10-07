import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NEW_THEMES = ["mono", "mint", "rose", "aurora", "carbon"];

function channel(hex: string): number {
  const value = Number.parseInt(hex, 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const r = channel(raw.slice(0, 2));
  const g = channel(raw.slice(2, 4));
  const b = channel(raw.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const left = luminance(a);
  const right = luminance(b);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

function themeBlock(css: string, id: string): Record<string, string> {
  const match = new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([^}]+)\\}`).exec(css);
  if (!match) throw new Error(`Missing theme ${id}`);
  const tokens: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const token = /--(color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/.exec(line);
    if (token) tokens[token[1]!] = token[2]!.toLowerCase();
  }
  return tokens;
}

describe("new theme contrast", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("keeps text, buttons, warnings, and charts readable", () => {
    for (const id of NEW_THEMES) {
      const tokens = themeBlock(css, id);
      expect(contrast(tokens["color-fg"]!, tokens["color-bg"]!), id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens["color-fg-muted"]!, tokens["color-bg"]!), `${id} muted`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens["color-on-accent"]!, tokens["color-accent"]!), `${id} accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens["color-warn-fg"]!, tokens["color-warn-bg"]!), `${id} warn`).toBeGreaterThanOrEqual(4.5);
      for (const chart of ["color-chart-1", "color-chart-2", "color-chart-3", "color-chart-4"]) {
        expect(contrast(tokens[chart]!, tokens["color-bg"]!), `${id} ${chart}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
