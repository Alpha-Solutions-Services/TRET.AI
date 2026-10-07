import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CsvExportAdapter } from "./adapters/csv-adapter";
import { parseVektorLoadsCsv } from "./csv-loads";
import { decidePromotion } from "./pipeline";

const FIXTURE = readFileSync("fixtures/vektor/vektor-loads-2026-10-05.csv", "utf8");

describe("Vektor orders CSV", () => {
  it("imports only Delivered rows and previews the other statuses", () => {
    expect(FIXTURE).not.toMatch(/John Douglas Reed|Jose Rodriguez|Brison Lavelle Hunter|Ahmad Hashmi/);
    const parsed = parseVektorLoadsCsv(FIXTURE, null, { from: "2026-10-01", to: "2026-10-11" });
    expect(parsed.headerFound).toBe(true);
    expect(parsed.rows.length).toBeGreaterThan(7);
    const imported = parsed.rows.filter((row) => row.action === "import");
    expect(imported.map((row) => row.loadId).sort()).toEqual([
      "TBH--1183",
      "TBH--1184",
      "TBH--1185",
      "TBH--1186",
      "TBH--1189",
      "TBH--1190",
      "TBH--1192",
    ]);
    expect(parsed.rows.find((row) => row.loadId === "TBH--1186")?.unitNumber).toBe("3");
    for (const label of ["Booked", "En Route", "In Transit"]) {
      const skipped = parsed.rows.filter((row) => row.statusLabel === label);
      expect(skipped.length).toBeGreaterThan(0);
      expect(skipped.every((row) => row.action === "skip" && row.reason?.includes(label))).toBe(true);
    }
    const shared = imported.find((row) => row.loadId === "TBH--1183");
    expect(shared?.importRow?.deliveryDateKind).toBe("manifest");
    expect(shared?.importRow?.pickupDateKind).toBe("manifest");
    expect(shared?.importRow?.sourceManifestRef).toBe("1191");
    expect(imported.find((row) => row.loadId === "TBH--1186")?.importRow?.deliveryDateKind).toBe("order");
  });

  it("promotes a delivered row with city, state, and a truck number match", async () => {
    const adapter = new CsvExportAdapter();
    const fetched = await adapter.fetchManifests({
      from: "2026-10-01",
      to: "2026-10-11",
      csvText: FIXTURE,
    });
    expect(fetched.manifests).toHaveLength(7);
    const ids = new Set(fetched.manifests.map((row) => row.manifestId));
    expect(ids.size).toBe(7);
    const row = fetched.manifests.find((manifest) => manifest.friendlyId === "TBH--1186");
    expect(row?.sourceManifestRef).toBe("1186");
    const decision = decidePromotion(row!, {
      lookups: fetched.lookups,
      knownTruckUnits: new Set(["3"]),
      rangeFrom: "2026-10-01",
      rangeTo: "2026-10-11",
    });
    expect(decision.promote).toBe(true);
    expect(decision.mapped.loadId).toBe("TBH--1186");
    expect(decision.mapped.truckUnitNumber).toBe("3");
    expect(decision.mapped.rateCents).toBe(320_000);
    expect(decision.mapped.originCity).toBeTruthy();
    expect(decision.mapped.originState).toMatch(/^[A-Z]{2}$/);
    expect(decision.mapped.destinationState).toMatch(/^[A-Z]{2}$/);
  });
});
