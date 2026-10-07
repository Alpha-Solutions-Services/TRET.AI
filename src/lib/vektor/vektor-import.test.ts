import { describe, expect, it } from "vitest";
import { weekBoundsForDate } from "@/lib/fee-engine";
import {
  createAdapters,
  resolveCrossSourceConflict,
} from "./adapters";
import { McpAdapter } from "./adapters/mcp-adapter";
import { findStop, resolveStopDate } from "./dates";
import { loadFixtureLookups, loadFixtureManifest } from "./fixtures";
import { mapManifestToLoad } from "./map";
import { decimalStringToCents } from "./money";
import { decidePromotion, runImportPipeline } from "./pipeline";
import { validateRowCountDrop } from "./validate";

const RANGE = { rangeFrom: "2026-09-01", rangeTo: "2026-09-30" };
const UNITS = new Set(["02"]);

describe("decimalStringToCents", () => {
  it("converts 2200.00 without float error", () => {
    // Hand-calc: 2200.00 → 220000¢
    expect(decimalStringToCents("2200.00")).toBe(220_000);
  });
});

describe("Sample C — never promoted", () => {
  it("excludes STATUS_DELETED + MERGED_INTO even with gross", () => {
    // Hand-calc: Sample C status DELETED + MERGED_INTO → not eligible
    const m = loadFixtureManifest("sample-c-manifest-1146.json");
    const d = decidePromotion(m, {
      lookups: { drivers: {}, brokers: {}, trucks: {} },
      knownTruckUnits: UNITS,
      ...RANGE,
    });
    expect(d.promote).toBe(false);
    expect(d.mapped.eligible).toBe(false);
    expect(d.rejectReason).toMatch(/DELETED|MERGED_INTO/i);
  });
});

describe("Sample B — appointment fallback + loaded warn", () => {
  it("promotes with delivery 2026-09-11 from FIXED appointment; Warn loaded 0 vs auto 1460", () => {
    // Hand-calc: no checkedOutAt/arrivedAt; dropoff FIXED → 2026-09-11 08:00:00
    const m = loadFixtureManifest("sample-b-manifest-1101.json");
    const lookups = loadFixtureLookups("sample-b-manifest-1101.json");
    expect(resolveStopDate(findStop(m.stops, "dropoff"))).toBe(
      "2026-09-11 08:00:00",
    );

    const d = decidePromotion(m, {
      lookups,
      knownTruckUnits: UNITS,
      ...RANGE,
    });
    expect(d.promote).toBe(true);
    expect(d.mapped.deliveryDate).toBe("2026-09-11 08:00:00");
    expect(d.mapped.loadId).toBe("TBH--1101");
    expect(d.mapped.deadheadMiles).toBe(40);
    expect(d.mapped.rateCents).toBe(15_000);
    expect(d.issues.find((i) => i.rule === "loaded_zero_vs_auto")?.severity).toBe(
      "Warn",
    );
  });
});

describe("Sample A — real completion timestamps promote clean", () => {
  it("maps Load ID, times, week, rate, miles; ignores TYPE_START and NEED_TO_SET; no issues", () => {
    // Hand-calc:
    // pickup checkedOutAt → 2026-09-25 16:38:52
    // delivery checkedOutAt → 2026-09-26 12:29:26 (NEED_TO_SET appt ignored)
    // week of 2026-09-26 → Mon 2026-09-21 … Sun 2026-09-27
    // rate 2200.00 → 220000¢; loaded 332; deadhead 14
    const m = loadFixtureManifest("sample-a-manifest-1152.json");
    const lookups = loadFixtureLookups("sample-a-manifest-1152.json");

    expect(findStop(m.stops, "pickup")?.location?.city).toBe("Irving");
    expect(m.stops?.some((s) => s.orderStopType === "TYPE_START")).toBe(true);

    const d = decidePromotion(m, {
      lookups,
      knownTruckUnits: UNITS,
      ...RANGE,
    });

    expect(d.promote).toBe(true);
    expect(d.mapped.loadId).toBe("TBH--1152");
    expect(d.mapped.pickupDate).toBe("2026-09-25 16:38:52");
    expect(d.mapped.deliveryDate).toBe("2026-09-26 12:29:26");
    expect(d.mapped.weekStart).toBe("2026-09-21");
    expect(d.mapped.weekEnd).toBe("2026-09-27");
    expect(weekBoundsForDate("2026-09-26")).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
    expect(d.mapped.rateCents).toBe(220_000);
    expect(d.mapped.loadedDistanceMi).toBe(332);
    expect(d.mapped.deadheadMiles).toBe(14);
    expect(d.mapped.truckUnitNumber).toBe("02");
    expect(d.issues.filter((i) => i.severity !== "Info")).toEqual([]);
  });
});

describe("truck match via truckId → referenceId", () => {
  it("matches referenceId 02 to unit_number 2", () => {
    const m = loadFixtureManifest("sample-a-manifest-1152.json");
    const lookups = loadFixtureLookups("sample-a-manifest-1152.json");
    const hit = decidePromotion(m, {
      lookups,
      knownTruckUnits: new Set(["2"]),
      ...RANGE,
    });
    expect(hit.promote).toBe(true);
    expect(hit.mapped.truckUnitNumber).toBe("2");
  });
});

describe("adapters", () => {
  it("CSV and the sheet are selectable while MCP and an empty API are not", () => {
    const adapters = createAdapters({
      mcpVerified: false,
      mcpHasTokens: false,
      csvColumnMapping: null,
      apiBaseUrl: "",
      apiToken: "",
    });
    const byId = Object.fromEntries(adapters.map((adapter) => [adapter.id, adapter.status()]));
    expect(byId.csv?.selectable).toBe(true);
    expect(byId.sheet?.selectable).toBe(true);
    expect(byId.api?.selectable).toBe(false);
    expect(byId.mcp?.selectable).toBe(false);
    expect(byId.mcp?.message).toMatch(/broken on filters proto/i);
    expect(new McpAdapter().status().message).toMatch(/unverified/i);
  });

  it("two adapters producing the same model give identical mapped loads", () => {
    // Hand-calc: same fixture through mapManifestToLoad twice → identical fingerprint
    const m = loadFixtureManifest("sample-a-manifest-1152.json");
    const lookups = loadFixtureLookups("sample-a-manifest-1152.json");
    const a = mapManifestToLoad(m, lookups);
    const b = mapManifestToLoad(structuredClone(m), lookups);
    expect(a).toEqual(b);
  });

  it("cross-source: identical → skip; differing → Warn no overwrite", () => {
    const m = loadFixtureManifest("sample-a-manifest-1152.json");
    const lookups = loadFixtureLookups("sample-a-manifest-1152.json");
    const mapped = mapManifestToLoad(m, lookups);
    const existing = {
      naturalKey: "1152",
      manifestId: mapped.manifestId,
      loadId: mapped.loadId,
      deliveryDate: mapped.deliveryDate,
      rateCents: mapped.rateCents,
      loadedDistanceMi: mapped.loadedDistanceMi,
      deadheadMiles: mapped.deadheadMiles,
      originCity: mapped.originCity,
      destinationCity: mapped.destinationCity,
      source: "mcp",
    };
    expect(resolveCrossSourceConflict(mapped, existing, "csv").action).toBe(
      "skip_identical",
    );
    const differ = resolveCrossSourceConflict(
      { ...mapped, rateCents: 1 },
      existing,
      "csv",
    );
    expect(differ.action).toBe("warn_differ");
    expect(differ.issue?.severity).toBe("Warn");
  });

  it("mocked MCP failure surfaces unverified / sign-in", async () => {
    const mcp = new McpAdapter({ verified: false, hasTokens: false });
    await expect(
      mcp.fetchManifests({ from: "2026-09-01", to: "2026-09-30" }),
    ).rejects.toThrow(/sign-in|unverified/i);
  });

  it("empty result after non-empty previous run Blocks via row-count-drop", () => {
    // Hand-calc: previous 10, fetched 0, threshold 50% → Block
    const issue = validateRowCountDrop(0, 10, { rowCountDropBlockPct: 50 });
    expect(issue?.severity).toBe("Block");
  });
});

describe("pipeline A+B+C", () => {
  it("promotes A and B, rejects C", () => {
    const manifests = [
      loadFixtureManifest("sample-a-manifest-1152.json"),
      loadFixtureManifest("sample-b-manifest-1101.json"),
      loadFixtureManifest("sample-c-manifest-1146.json"),
    ];
    const result = runImportPipeline(manifests, {
      lookups: {
        drivers: {
          ...loadFixtureLookups("sample-a-manifest-1152.json").drivers,
          ...loadFixtureLookups("sample-b-manifest-1101.json").drivers,
        },
        brokers: {
          ...loadFixtureLookups("sample-a-manifest-1152.json").brokers,
          ...loadFixtureLookups("sample-b-manifest-1101.json").brokers,
        },
        trucks: {
          ...loadFixtureLookups("sample-a-manifest-1152.json").trucks,
          ...loadFixtureLookups("sample-b-manifest-1101.json").trucks,
        },
      },
      knownTruckUnits: UNITS,
      ...RANGE,
      previousFetched: null,
      settings: { rowCountDropBlockPct: 50 },
    });
    expect(result.decisions.filter((d) => d.promote)).toHaveLength(2);
    expect(result.decisions.filter((d) => !d.promote)).toHaveLength(1);
  });
});
