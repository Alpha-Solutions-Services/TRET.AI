import { describe, expect, it } from "vitest";
import { ApiAdapter } from "./api-adapter";
import { CsvExportAdapter } from "./csv-adapter";
import { SheetLedgerAdapter } from "./sheet-adapter";
import { decidePromotion } from "../pipeline";

const RANGE = { from: "2026-09-01", to: "2026-09-07" };

const CSV = `Truck #,3
Delivery Date,Load ID,Rate,Loaded Miles,Deadhead Miles,Origin,Destination,Driver,Broker/Customer,Unit
2026-09-01 0:00:00,TBH-1081,"$1,600.00",100,10,"Montgomery, AL","Selma, AL",John Reed,Axle,3
`;

describe("CSV loads import", () => {
  it("promotes a Load Ledger row through the shared pipeline", async () => {
    const adapter = new CsvExportAdapter();
    const fetched = await adapter.fetchManifests({ ...RANGE, csvText: CSV });
    expect(fetched.manifests).toHaveLength(1);
    const decision = decidePromotion(fetched.manifests[0]!, {
      lookups: fetched.lookups,
      knownTruckUnits: new Set(["3"]),
      rangeFrom: RANGE.from,
      rangeTo: RANGE.to,
    });
    expect(decision.promote).toBe(true);
    expect(decision.mapped.loadId).toBe("TBH-1081");
    expect(decision.mapped.rateCents).toBe(160_000);
    expect(decision.mapped.truckUnitNumber).toBe("3");
    expect(decision.mapped.deliveryDate?.slice(0, 10)).toBe("2026-09-01");
  });
});

describe("Google Sheet loads import", () => {
  it("promotes a ledger grid and does not require a CSV", async () => {
    const adapter = new SheetLedgerAdapter({
      loadLedgers: async () => [
        {
          unitNumber: "03",
          note: null,
          grid: [
            ["Delivery Date", "Load ID", "Rate", "Loaded Miles"],
            ["2026-09-02 0:00:00", "TBH-1087", "$1,100.00", "50"],
          ],
        },
      ],
    });
    const fetched = await adapter.fetchManifests(RANGE);
    const decision = decidePromotion(fetched.manifests[0]!, {
      lookups: fetched.lookups,
      knownTruckUnits: new Set(["03"]),
      rangeFrom: RANGE.from,
      rangeTo: RANGE.to,
    });
    expect(decision.promote).toBe(true);
    expect(decision.mapped.rateCents).toBe(110_000);
    expect(decision.mapped.truckUnitNumber).toBe("03");
  });
});

describe("Vektor REST adapter", () => {
  it("is not selectable without keys and never calls MCP", async () => {
    expect(new ApiAdapter().status().selectable).toBe(false);
    const calls: string[] = [];
    const adapter = new ApiAdapter({
      baseUrl: "https://api.example.test",
      token: "secret-token",
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        expect(url).not.toContain("secret-token");
        expect(url).not.toMatch(/mcp/i);
        if (url.includes("/v1/manifests")) {
          return new Response(
            JSON.stringify({
              manifests: [
                {
                  manifestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1152",
                  status: "STATUS_DELIVERED",
                  grossAmount: "100.00",
                  deliveryDate: "2026-09-03",
                  unitNumber: "3",
                  friendlyId: "TBH-1097",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: "missing" }), { status: 404 });
      },
    });
    expect(adapter.status().selectable).toBe(true);
    const fetched = await adapter.fetchManifests(RANGE);
    expect(calls[0]).toContain("/manifests?");
    expect(calls.some((url) => url.includes("/v1/manifests"))).toBe(true);
    expect(fetched.manifests[0]?.manifestId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1152");
    expect(fetched.lookups.trucks?.["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1152"]).toBeUndefined();
    const truckIds = Object.keys(fetched.lookups.trucks ?? {});
    expect(fetched.lookups.trucks?.[truckIds[0]!]?.referenceId).toBe("3");
    expect(fetched.report?.payloadNote).toMatch(/MCP was not called/);
  });
});
