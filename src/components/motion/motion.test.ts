import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataFlow } from "@/components/motion/data-flow";
import { filePreviewCounts, loadsPreviewCounts } from "@/components/motion/counts";
import { OriginMap } from "@/components/motion/origin";
import { Pipeline } from "@/components/motion/pipeline";
import { IntegrationsSkeleton } from "@/components/motion/page-skeletons";
import { SignalHeader } from "@/components/motion/signal";
import { geminiTone, quickbooksFileTone, sheetsTone, vektorTone } from "@/components/motion/tones";
import { statusDotIsLive } from "@/components/ui/status-dot";
import { DEFAULT_THEME_ID, THEMES } from "@/lib/theme";
import { emptyFileAccountNames } from "@/lib/quickbooks/file-journal";

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

describe("motion counts and connection tones", () => {
  it("keeps preview counts at zero until rows exist", () => {
    expect(loadsPreviewCounts(null)).toEqual({
      rowsNew: 0,
      duplicate: 0,
      flagged: 0,
      caption: "No preview yet.",
    });
    expect(
      loadsPreviewCounts([
        { action: "import", reason: null },
        { action: "skip", reason: "Excluded: lineage relation MERGED_INTO (deleted duplicate)" },
        { action: "skip", reason: "Not imported: status Booked (OPEN for later)" },
      ]),
    ).toMatchObject({ rowsNew: 1, duplicate: 1, flagged: 1 });
    expect(filePreviewCounts(null).rowsNew).toBe(0);
    expect(
      filePreviewCounts([
        { status: "new" },
        { status: "new" },
        { status: "duplicate" },
        { status: "flagged" },
      ]),
    ).toMatchObject({ rowsNew: 2, duplicate: 1, flagged: 1 });
  });

  it("maps real connection words and does not invent a busy sheet", () => {
    expect(sheetsTone("Sheet account is set.")).toBe("connected");
    expect(sheetsTone("The Google sheet account is not set. Add it on the server, then share each truck sheet.")).toBe(
      "not_set",
    );
    expect(vektorTone("connected")).toBe("connected");
    expect(vektorTone("needs_sign_in")).toBe("not_set");
    expect(vektorTone(null)).toBe("not_set");
    expect(quickbooksFileTone(emptyFileAccountNames())).toBe("not_set");
    expect(geminiTone("OK")).toBe("connected");
    expect(geminiTone("Busy")).toBe("busy");
    expect(geminiTone("Not set")).toBe("not_set");
  });

  it("renders live counts and a real truck count", () => {
    const flow = renderToStaticMarkup(
      createElement(DataFlow, {
        counts: { rowsNew: 0, duplicate: 0, flagged: 0, caption: "No preview yet." },
      }),
    );
    expect(flow).toContain("Vektor");
    expect(flow).toContain("Google Sheets");
    expect(flow).toContain("No preview yet.");
    expect(flow).toContain("animateMotion");
    expect(flow).toContain("var(--color-accent)");
    expect(flow).not.toContain("drop-shadow");
    expect(flow).not.toContain("rv-pulse");
    expect(flow).not.toContain("Product 1");
    const moving = renderToStaticMarkup(
      createElement(DataFlow, {
        counts: { rowsNew: 4, duplicate: 1, flagged: 2, caption: "Preview ready." },
      }),
    );
    expect(moving.match(/rv-pulse/g)).toHaveLength(3);
    expect(moving).toContain(">4<");
    const idleSteps = renderToStaticMarkup(createElement(Pipeline, { pending: false }));
    expect(idleSteps).not.toContain("animateMotion");
    const busySteps = renderToStaticMarkup(createElement(Pipeline, { pending: true }));
    expect(busySteps).toContain("animateMotion");
    expect(busySteps).toContain("var(--color-accent)");
    const signal = renderToStaticMarkup(createElement(SignalHeader, { count: 0 }));
    expect(signal).toContain("0 trucks connected");
    expect(signal).not.toContain("animateMotion");
    const origin = renderToStaticMarkup(
      createElement(OriginMap, {
        nodes: [
          { label: "Vektor", tone: "not_set", caption: "Not set" },
          { label: "Google Sheets", tone: "connected", caption: "Connected" },
          { label: "QuickBooks files", tone: "not_set", caption: "Not set" },
          { label: "Gemini AI", tone: "busy", caption: "Busy" },
        ],
      }),
    );
    expect(origin).toContain("Gemini AI");
    expect(origin).toContain("Busy");
    expect(origin.match(/rv-pulse/g)).toHaveLength(2);
    expect(origin).not.toContain("rv-particle");
    expect(origin).not.toContain("GEMINI_API_KEY");
  });

  it("pulses a live check and keeps a missing check still", () => {
    expect(statusDotIsLive("connected")).toBe(true);
    expect(statusDotIsLive("busy")).toBe(true);
    expect(statusDotIsLive("ok")).toBe(true);
    expect(statusDotIsLive("warn")).toBe(true);
    expect(statusDotIsLive("not_set")).toBe(false);
    expect(statusDotIsLive("danger")).toBe(false);
  });

  it("loads with skeletons and does not render the bar-wave loader", () => {
    expect(existsSync("src/components/motion/waveform.tsx")).toBe(false);
    const offenders: string[] = [];
    for (const path of walk("src")) {
      if (path.endsWith("motion.test.ts")) continue;
      const text = readFileSync(path, "utf8");
      if (text.includes("motion/waveform") || text.includes("Waveform")) offenders.push(path);
    }
    expect(offenders).toEqual([]);
    const integrations = readFileSync("src/app/integrations/page.tsx", "utf8");
    expect(integrations).toContain("IntegrationsSkeleton");
    const skeleton = renderToStaticMarkup(createElement(IntegrationsSkeleton));
    expect(skeleton).toContain("Checking AI status");
    expect(skeleton).toContain("skeleton-shimmer");
    expect(skeleton).not.toContain("animateMotion");
    const flowSource = readFileSync("src/components/motion/data-flow.tsx", "utf8");
    expect(flowSource).toContain("if (from === value) return");
    expect(flowSource).toContain("prefers-reduced-motion");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".press-card:hover");
    expect(css).toContain(".skeleton-shimmer");
    expect(css).not.toContain("drop-shadow");
  });

  it("keeps every theme selectable and boots Vibe Black by default", () => {
    expect(DEFAULT_THEME_ID).toBe("vibe-black");
    expect(THEMES.map((theme) => theme.id)).toEqual([
      "vibe-black",
      "vibe",
      "vibe-light",
      "glass",
      "mono",
      "ocean",
      "mint",
      "sand",
      "rose",
      "graphite",
      "midnight",
      "aurora",
      "carbon",
    ]);
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const theme of THEMES) {
      const token = theme.id.includes("-") ? `"${theme.id}":1` : `${theme.id}:1`;
      expect(layout).toContain(token);
      expect(css).toContain(`[data-theme="${theme.id}"]`);
    }
    expect(layout).toContain(':"vibe-black"');
    expect(css).toMatch(/:root,\s*\[data-theme="vibe-black"\]/);
  });
});
