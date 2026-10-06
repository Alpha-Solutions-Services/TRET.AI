import { describe, expect, it } from "vitest";
import { weekBoundsForDate } from "@/lib/fee-engine";
import { loadFixtureLookups, loadFixtureManifest } from "./fixtures";
import { mapManifestToLoad } from "./map";
import { decimalStringToCents } from "./money";
import { decidePromotion, runImportPipeline } from "./pipeline";
import { resolveStopDate, findStop } from "./dates";
import { validateRowCountDrop } from "./validate";

const RANGE = { rangeFrom: "2026-09-01", rangeTo: "2026-09-30" };
const UNITS = new Set(["02"]);

describe("decimalStringToCents", () => {
  it("converts 2500.00 and 150.00 without float error", () => {
    // Hand-calc: 2500.00 → 250000¢; 150.00 → 15000¢
    expect(decimalStringToCents("2500.00")).toBe(250_000);
    expect(decimalStringToCents("150.00")).toBe(15_000);
  });
});

describe("week boundary from delivery date", () => {
  it("2026-09-11 is Fri → week Mon 09-07 … Sun 09-13", () => {
    // Hand-calc: 2026-09-11 Friday → Monday 2026-09-07, Sunday 2026-09-13
    expect(weekBoundsForDate("2026-09-11")).toEqual({
      start: "2026-09-07",
      end: "2026-09-13",
    });
  });
});

describe("Sample C — never promoted", () => {
  it("excludes STATUS_DELETED + MERGED_INTO even with gross", () => {
    // Hand-calc: Sample C status DELETED + MERGED_INTO → not eligible
    const m = loadFixtureManifest("sample-c-manifest-1146.json");
    const d = decidePromotion(m, {
      lookups: { drivers: {}, brokers: {} },
      knownTruckUnits: UNITS,
      ...RANGE,
    });
    expect(d.promote).toBe(false);
    expect(d.mapped.eligible).toBe(false);
    expect(d.rejectReason).toMatch(/DELETED|MERGED_INTO/i);
  });
});

describe("Sample B — appointment fallback + loaded warn", () => {
  it("promotes with delivery date 2026-09-11 from FIXED appointment", () => {
    // Hand-calc: no checkedOutAt/arrivedAt; dropoff FIXED appointmentStartAtLocal → 2026-09-11
    const m = loadFixtureManifest("sample-b-manifest-1101.json");
    const lookups = loadFixtureLookups("sample-b-manifest-1101.json");
    const dropoff = findStop(m.stops, "dropoff");
    expect(resolveStopDate(dropoff)).toBe("2026-09-11");

    const d = decidePromotion(m, {
      lookups,
      knownTruckUnits: UNITS,
      ...RANGE,
    });
    expect(d.promote).toBe(true);
    expect(d.mapped.deliveryDate).toBe("2026-09-11");
    expect(d.mapped.loadId).toBe("TBH--1101");
    expect(d.mapped.manifestFriendlyId).toBe("1101");
    expect(d.mapped.deadheadMiles).toBe(40);
    expect(d.mapped.rateCents).toBe(15_000);
    expect(d.mapped.tripGroupId).toBeNull();
    expect(d.mapped.primaryLoad).toBeNull();
    expect(d.mapped.lineageRelation).toBe(
      "MANIFEST_LINEAGE_RELATION_UNMERGED_FROM",
    );

    const warn = d.issues.find((i) => i.rule === "loaded_zero_vs_auto");
    expect(warn?.severity).toBe("Warn");
    expect(warn?.message).toMatch(/1460/);
  });
});

describe("Sample A — completion timestamps promote clean", () => {
  it("uses checkedOutAt for pickup/delivery and promotes", () => {
    // Hand-calc: pickup checkedOutAt → 2026-09-15; dropoff checkedOutAt → 2026-09-17
    const m = loadFixtureManifest("sample-a-manifest-1152.json");
    const lookups = loadFixtureLookups("sample-a-manifest-1152.json");
    expect(resolveStopDate(findStop(m.stops, "pickup"))).toBe("2026-09-15");
    expect(resolveStopDate(findStop(m.stops, "dropoff"))).toBe("2026-09-17");

    const d = decidePromotion(m, {
      lookups,
      knownTruckUnits: UNITS,
      ...RANGE,
    });
    expect(d.promote).toBe(true);
    expect(d.mapped.loadId).toBe("TBH--1152");
    expect(d.mapped.rateCents).toBe(250_000);
    expect(d.issues.some((i) => i.rule === "loaded_zero_vs_auto")).toBe(false);
  });
});

describe("idempotency key", () => {
  it("uses manifestId as stable key", () => {
    // Hand-calc: Sample B manifestId is the UUID fixture value
    const m = loadFixtureManifest("sample-b-manifest-1101.json");
    const mapped = mapManifestToLoad(m, loadFixtureLookups("sample-b-manifest-1101.json"));
    expect(mapped.manifestId).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1101");
    expect(mapped.orderIds).toContain("oooooooo-oooo-oooo-oooo-oooooooo1101");
  });
});

describe("truck matching exact unit", () => {
  it("Vektor unit 02 matches trucks.unit_number 02 only", () => {
    // Hand-calc: "02" ∈ {"02"} → promote; "2" alone would not match
    const m = loadFixtureManifest("sample-b-manifest-1101.json");
    const lookups = loadFixtureLookups("sample-b-manifest-1101.json");
    const miss = decidePromotion(m, {
      lookups,
      knownTruckUnits: new Set(["2", "002"]),
      ...RANGE,
    });
    expect(miss.promote).toBe(false);
    expect(miss.issues.some((i) => i.rule === "truck_unmatched")).toBe(true);

    const hit = decidePromotion(m, {
      lookups,
      knownTruckUnits: UNITS,
      ...RANGE,
    });
    expect(hit.promote).toBe(true);
  });
});

describe("row count drop Block", () => {
  it("blocks when drop exceeds settings threshold", () => {
    // Hand-calc: previous 100, fetched 40, threshold 50% → minAllowed 50 → Block
    const issue = validateRowCountDrop(40, 100, { rowCountDropBlockPct: 50 });
    expect(issue?.severity).toBe("Block");
  });
});

describe("pipeline with A+B+C", () => {
  it("promotes A and B, rejects C, reports status counts", () => {
    const manifests = [
      loadFixtureManifest("sample-a-manifest-1152.json"),
      loadFixtureManifest("sample-b-manifest-1101.json"),
      loadFixtureManifest("sample-c-manifest-1146.json"),
    ];
    const result = runImportPipeline(manifests, {
      lookups: {
        ...loadFixtureLookups("sample-a-manifest-1152.json"),
        drivers: {
          ...loadFixtureLookups("sample-a-manifest-1152.json").drivers,
          ...loadFixtureLookups("sample-b-manifest-1101.json").drivers,
        },
        brokers: {
          ...loadFixtureLookups("sample-a-manifest-1152.json").brokers,
          ...loadFixtureLookups("sample-b-manifest-1101.json").brokers,
        },
      },
      knownTruckUnits: UNITS,
      ...RANGE,
      previousFetched: null,
      settings: { rowCountDropBlockPct: 50 },
    });
    expect(result.blocked).toBe(false);
    expect(result.decisions.filter((d) => d.promote)).toHaveLength(2);
    expect(result.decisions.filter((d) => !d.promote)).toHaveLength(1);
    expect(result.statusCounts.STATUS_DELETED).toBe(1);
    expect(result.statusCounts.STATUS_DELIVERED).toBe(2);
  });
});
