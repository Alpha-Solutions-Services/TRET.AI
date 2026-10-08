import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataFlow } from "@/components/motion/data-flow";
import { filePreviewCounts, loadsPreviewCounts } from "@/components/motion/counts";
import { OriginMap } from "@/components/motion/origin";
import { SignalHeader } from "@/components/motion/signal";
import { geminiTone, quickbooksFileTone, sheetsTone, vektorTone } from "@/components/motion/tones";
import { DEFAULT_THEME_ID, THEMES } from "@/lib/theme";
import { emptyFileAccountNames } from "@/lib/quickbooks/file-journal";

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
    expect(flow).not.toContain("Product 1");
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
    expect(origin).not.toContain("GEMINI_API_KEY");
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
