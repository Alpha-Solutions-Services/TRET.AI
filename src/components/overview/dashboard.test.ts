import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnimatedBarChart } from "@/components/dashboard/animated-charts";
import { TruckCardGrid } from "@/components/dashboard/truck-cards";
import { HubFlow } from "@/components/motion/hub-flow";
import { KpiCard } from "@/components/motion/kpi-card";
import { OverviewClient } from "@/components/overview/overview-client";
import { buildHubFeeds, storedFeedCaption, storedFeedTone } from "@/lib/overview/hub-feeds";
import type { OverviewPageData } from "@/lib/overview/queries";
import { formatGroupedInt, formatMilesWhole } from "@/lib/reports/format";
import { buildTruckWeekInsOuts, type TruckWeekInsOuts } from "@/lib/sheets/ins-outs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: () => undefined }),
}));

describe("dashboard display", () => {
  it("shows loaded miles as whole miles", () => {
    expect(formatMilesWhole(487700)).toBe("4,877");
    expect(formatMilesWhole(487750)).toBe("4,877");
    expect(formatMilesWhole(0)).toBe("0");
    expect(formatGroupedInt(1200)).toBe("1,200");
  });

  it("keeps diesel gallons that the per truck mpg already used", () => {
    const row = buildTruckWeekInsOuts({
      unitNumber: "3",
      truckName: "Reed",
      weekStart: "2026-10-05",
      weekEnd: "2026-10-11",
      loadLedger: [
        ["Delivery Date", "Load ID", "Rate", "Loaded Miles"],
        ["10/06/2026", "TBH1", "$1,000.00", "100"],
      ],
      mgmtExpenses: null,
      weeklyExpenses: [
        ["Week Start Date", "Fuel"],
        ["10/05/2026", "$50.00"],
      ],
      fuelLog: [
        ["Date", "Gallons", "Item"],
        ["10/06/2026", "20", "ULSD"],
      ],
      note: null,
    });
    expect(row.mpg).toBe("5.00");
    expect(row.dieselGallonsMilli).toBe(20_000);
    expect(row.insCents).toBe(100_000);
  });

  it("marks fuel and tolls from saved rows only", () => {
    expect(storedFeedTone(null)).toBe("not_set");
    expect(storedFeedTone(0)).toBe("not_set");
    expect(storedFeedTone(4)).toBe("connected");
    expect(storedFeedCaption("connected")).toBe("In TRET");
    const feeds = buildHubFeeds({
      vektor: "connected",
      sheets: "not_set",
      fuelCount: 2,
      tollCount: 0,
      gemini: "Busy",
    });
    expect(feeds.map((feed) => `${feed.label}:${feed.caption}`)).toEqual([
      "Vektor:Connected",
      "Sheets:Not set",
      "Fuel:In TRET",
      "Tolls:Not set",
      "Gemini:Busy",
    ]);
  });

  it("paints the final kpi text and a thick bar on the first render", () => {
    const card = renderToStaticMarkup(
      createElement(KpiCard, {
        label: "Loaded miles",
        value: "4,877",
        color: "#7eb6ff",
        target: 4877,
        format: formatGroupedInt,
      }),
    );
    expect(card).toContain("4,877");
    expect(card).not.toContain("4,877.00");

    const bars = renderToStaticMarkup(
      createElement(AnimatedBarChart, {
        rows: [{ label: "3", values: { ins: 100_000, outs: 40_000 } }],
        series: [
          { key: "ins", label: "Ins", color: "#7eb6ff" },
          { key: "outs", label: "Outs", color: "#c084fc" },
        ],
        empty: "No readable truck sheets for this week.",
      }),
    );
    expect(bars).toContain("rv-grow-y");
    expect(bars).toMatch(/width="3[0-9]"|width="[4-9][0-9]"/);
    expect(bars).not.toContain("width=\"18\"");
  });

  it("renders the hub and truck cards from real fields", () => {
    const hub = renderToStaticMarkup(
      createElement(HubFlow, {
        feeds: buildHubFeeds({
          vektor: "connected",
          sheets: "connected",
          fuelCount: 1,
          tollCount: null,
          gemini: "OK",
        }),
      }),
    );
    expect(hub).toContain("TRET");
    expect(hub).toContain("Gemini");
    expect(hub).toContain("In TRET");
    expect(hub).toContain("rv-particle");
    expect(hub).not.toContain("React Vibe");

    const cards = renderToStaticMarkup(createElement(TruckCardGrid, { rows: [sampleTruck()] }));
    expect(cards).toContain("Unit 3");
    expect(cards).toContain("4,877");
    expect(cards).toContain("6.42");
    expect(cards).not.toContain("4,877.00");
  });

  it("renders the dashboard week controls and whole loaded miles", () => {
    const html = renderToStaticMarkup(
      createElement(OverviewClient, {
        data: pageData(),
        cards: {
          incomeCents: 0,
          expenseCents: 0,
          netCents: 0,
          tolsonPayableCents: 0,
          legacyKeptCents: 0,
          expenseMonth: "2026-10",
        },
        hub: buildHubFeeds({
          vektor: "not_set",
          sheets: "connected",
          fuelCount: 0,
          tollCount: 0,
          gemini: "Not set",
        }),
      }),
    );
    expect(html).toContain("Previous week");
    expect(html).toContain("Next week");
    expect(html).toContain("4,877");
    expect(html).toContain("Loaded miles");
    expect(html).toContain("Deadhead");
    expect(html).toContain("Open issues");
    expect(html).not.toContain("4,877.00");
    expect(html).not.toContain("—");
  });
});

function sampleTruck(): TruckWeekInsOuts {
  return {
    unitNumber: "3",
    truckName: "John Reed",
    truckClass: "legacy_owned",
    insCents: 250_000,
    outsCents: 80_000,
    netCents: 170_000,
    loadCount: 4,
    loadedMilesHundredths: 487_700,
    deadheadMilesHundredths: 1_250,
    rpmCents: 51,
    mpg: "6.42",
    dieselGallonsMilli: 75_965,
    categories: [{ category: "Fuel", cents: 45_000 }],
    outsFromWeekly: true,
    note: null,
    noteDetail: null,
    readable: true,
    ledgerLoads: [],
    recentWeeks: [
      { weekStart: "2026-09-28", insCents: 100_000, outsCents: 40_000 },
      { weekStart: "2026-10-05", insCents: 250_000, outsCents: 80_000 },
    ],
  };
}

function pageData(): OverviewPageData {
  return {
    weekStart: "2026-10-05",
    weekEnd: "2026-10-11",
    error: null,
    issuesError: null,
    locked: false,
    closedAt: null,
    snapshot: null,
    pnl: null,
    openIssueCount: 1,
    operatingExpensesReady: true,
    insOuts: [sampleTruck()],
    insOutsError: null,
    sheetEnvMissing: [],
    mismatchCount: 0,
    mismatchError: null,
    versionLabel: "TRET.AI v0.0.0.31",
    sheetHealth: "Sheet account is set.",
    operatingExpenses: [],
  };
}
