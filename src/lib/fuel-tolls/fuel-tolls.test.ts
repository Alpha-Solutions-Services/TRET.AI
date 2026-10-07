import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MCP_CONNECTION_TOOLS,
  MCP_FUEL_AGGREGATE_TOOL,
  MCP_FUEL_LIST_TOOL,
  MCP_TOLLS_LIST_TOOL,
  MCP_TOLLS_STATS_TOOL,
  assertMcpToolAllowed,
} from "@/lib/vektor/mcp/allowlist";
import { VEKTOR_LIST_PER_PAGE, buildTransactionDateArgs } from "@/lib/vektor/mcp/args";
import { fetchFuelAndTollsFromTools } from "@/lib/vektor/mcp/fetch-fuel-tolls";
import {
  defaultFuelCsvMapping,
  defaultTollCsvMapping,
  mapFuelCsv,
  mapTollCsv,
} from "./csv";
import { mapFuelRecord, mapTollRecord } from "./map";
import { collapseByTransactionId, runFuelPipeline, runTollPipeline } from "./pipeline";
import { mpgMilliFromHundredths, priceTenthCentsPerGallon } from "./quantity";
import { FUEL_TOLL_SETTING_DEFAULTS } from "./settings";
import { fuelWeekTotals, tollWeekTotals } from "./totals";
import type { FuelDraft, LoadSpan, WeekMiles } from "./types";
import { validateUnlinkedFuelAtWeekClose } from "./validate";

const WEEK = "2026-09-21";
const RANGE = { rangeFrom: "2026-09-21", rangeTo: "2026-09-27" };
const UNITS = ["02", "03", "04", "05", "06", "07", "08"];

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve("fixtures/vektor", name), "utf8"));
}

function spansFor(units: string[]): LoadSpan[] {
  return units.map((unitNumber) => ({
    unitNumber,
    startDate: "2026-09-22",
    endDate: "2026-09-26",
  }));
}

function milesForSixMpg(rows: FuelDraft[]): WeekMiles[] {
  return rows
    .filter((row) => row.unitNumber && row.gallonsMilli)
    .map((row) => ({
      unitNumber: row.unitNumber!,
      weekStart: WEEK,
      milesHundredths: (row.gallonsMilli! * 3) / 5,
    }));
}

describe("money and quantity", () => {
  it("converts price and mpg with integer half-up", () => {
    // $3.499 × 100.000 gal = $349.90. Tenth-cents per gallon = 3499.
    expect(priceTenthCentsPerGallon(34990, 100_000)).toBe(3499);
    // 600.00 miles / 100.000 gallons = 6.000 mpg.
    expect(mpgMilliFromHundredths(60_000, 100_000)).toBe(6000);
  });
});

describe("fuel and tolls week 2026-09-21", () => {
  const fuelDoc = readJson("fuel-week-2026-09-21.json") as {
    truck3Unit: string;
    truck3RetailMinusDiscountedCents: number;
    transactions: unknown[];
  };
  const tollDoc = readJson("tolls-week-2026-09-21.json") as {
    expectedCount: number;
    expectedAmountCents: number;
    trucks: Record<string, string>;
    transactions: unknown[];
  };

  it("promotes units 02–08 and records the $1 Truck 3 retail gap", () => {
    const drafts = fuelDoc.transactions.map((row) => mapFuelRecord(row));
    const result = runFuelPipeline(drafts, {
      knownUnits: new Set(UNITS),
      loadSpans: spansFor(UNITS),
      weekMiles: milesForSixMpg(drafts),
      ...RANGE,
      previousFetched: null,
      settings: FUEL_TOLL_SETTING_DEFAULTS,
      existingDuplicates: [],
    });
    expect(result.blocked).toBe(false);
    expect(result.weekIssues).toEqual([]);
    expect(result.decisions.every((row) => row.promote)).toBe(true);
    const totals = fuelWeekTotals(
      result.decisions.map((row) => row.draft),
      WEEK,
    );
    expect(totals.map((row) => row.unitNumber)).toEqual(UNITS);
    const truck3 = totals.find((row) => row.unitNumber === fuelDoc.truck3Unit);
    expect(truck3).toBeTruthy();
    expect(truck3!.retailAmountCents - truck3!.amountCents).toBe(
      fuelDoc.truck3RetailMinusDiscountedCents,
    );
    expect(truck3!.retailAmountCents - truck3!.amountCents).toBe(100);
    for (const row of totals) {
      if (row.unitNumber === "03") continue;
      expect(row.retailAmountCents - row.amountCents).toBe(0);
    }
  });

  it("promotes 66 tolls totaling 32153 cents", () => {
    const lookup = new Map(Object.entries(tollDoc.trucks));
    const drafts = tollDoc.transactions.map((row) => mapTollRecord(row, lookup));
    const result = runTollPipeline(drafts, {
      knownUnits: new Set(UNITS),
      loadSpans: spansFor(UNITS),
      ...RANGE,
      previousFetched: null,
      settings: FUEL_TOLL_SETTING_DEFAULTS,
      existingDuplicates: [],
    });
    expect(result.blocked).toBe(false);
    const promoted = result.decisions.filter((row) => row.promote).map((row) => row.draft);
    expect(promoted).toHaveLength(tollDoc.expectedCount);
    expect(promoted).toHaveLength(66);
    const totals = tollWeekTotals(promoted, WEEK);
    const amount = totals.reduce((sum, row) => sum + row.amountCents, 0);
    const count = totals.reduce((sum, row) => sum + row.count, 0);
    expect(count).toBe(66);
    expect(amount).toBe(32153);
    expect(amount).toBe(tollDoc.expectedAmountCents);
    expect(totals.map((row) => row.unitNumber)).toEqual(UNITS);
  });

  it("reads the same totals from the CSV fallback", () => {
    const fuelCsv = readFileSync(resolve("fixtures/vektor/fuel-week-2026-09-21.csv"), "utf8");
    const tollCsv = readFileSync(resolve("fixtures/vektor/tolls-week-2026-09-21.csv"), "utf8");
    const fuel = mapFuelCsv(fuelCsv, defaultFuelCsvMapping());
    const tolls = mapTollCsv(tollCsv, defaultTollCsvMapping());
    const fuelResult = runFuelPipeline(fuel, {
      knownUnits: new Set(UNITS),
      loadSpans: spansFor(UNITS),
      weekMiles: milesForSixMpg(fuel),
      ...RANGE,
      previousFetched: null,
      settings: FUEL_TOLL_SETTING_DEFAULTS,
      existingDuplicates: [],
    });
    const tollResult = runTollPipeline(tolls, {
      knownUnits: new Set(UNITS),
      loadSpans: spansFor(UNITS),
      ...RANGE,
      previousFetched: null,
      settings: FUEL_TOLL_SETTING_DEFAULTS,
      existingDuplicates: [],
    });
    expect(fuelResult.decisions.every((row) => row.promote)).toBe(true);
    const truck3 = fuelWeekTotals(
      fuelResult.decisions.map((row) => row.draft),
      WEEK,
    ).find((row) => row.unitNumber === "03");
    expect(truck3!.retailAmountCents - truck3!.amountCents).toBe(100);
    const promotedTolls = tollResult.decisions.filter((row) => row.promote);
    expect(promotedTolls).toHaveLength(66);
    expect(
      promotedTolls.reduce((sum, row) => sum + (row.draft.amountCents ?? 0), 0),
    ).toBe(32153);
  });
});

describe("validation rules", () => {
  const settings = FUEL_TOLL_SETTING_DEFAULTS;
  const baseFuel = {
    transactionId: "fuel-x",
    unitNumber: "02",
    transactedAt: "2026-09-23 14:05:00",
    card: "CARD02",
    product: "DIESEL",
    gallons: "100.000",
    discountedAmount: "350.00",
    retailAmount: "350.00",
  };

  function runOne(raw: unknown, extra?: Partial<Parameters<typeof runFuelPipeline>[1]>) {
    const draft = mapFuelRecord(raw);
    return runFuelPipeline([draft], {
      knownUnits: new Set(["02"]),
      loadSpans: spansFor(["02"]),
      weekMiles: milesForSixMpg([draft]),
      ...RANGE,
      previousFetched: null,
      settings,
      existingDuplicates: [],
      ...extra,
    });
  }

  it("does not match unit 2 to unit 02", () => {
    const result = runOne({ ...baseFuel, unitNumber: "2" });
    expect(result.decisions[0]?.promote).toBe(false);
    expect(result.decisions[0]?.issues.some((issue) => issue.rule === "truck_unmatched")).toBe(
      true,
    );
  });

  it("rejects a duplicate card, time, and amount and keeps the first id", () => {
    const second = mapFuelRecord({ ...baseFuel, transactionId: "fuel-y" });
    const first = mapFuelRecord(baseFuel);
    const result = runFuelPipeline([second, first], {
      knownUnits: new Set(["02"]),
      loadSpans: spansFor(["02"]),
      weekMiles: milesForSixMpg([first]),
      ...RANGE,
      previousFetched: null,
      settings,
      existingDuplicates: [],
    });
    const byId = new Map(result.decisions.map((row) => [row.draft.vektorTransactionId, row]));
    expect(byId.get("fuel-x")?.promote).toBe(true);
    expect(byId.get("fuel-y")?.promote).toBe(false);
    expect(byId.get("fuel-y")?.issues.some((issue) => issue.rule === "duplicate_transaction")).toBe(
      true,
    );
  });

  it("rejects price per gallon outside settings", () => {
    const result = runOne({ ...baseFuel, gallons: "1.000", discountedAmount: "0.50", retailAmount: "0.50" });
    expect(result.decisions[0]?.promote).toBe(false);
    expect(
      result.decisions[0]?.issues.some((issue) => issue.rule === "price_per_gallon_out_of_range"),
    ).toBe(true);
  });

  it("rejects gallons above the tank size", () => {
    const result = runOne({
      ...baseFuel,
      gallons: "301.000",
      discountedAmount: "1053.50",
      retailAmount: "1053.50",
    });
    expect(result.decisions[0]?.promote).toBe(false);
    expect(result.decisions[0]?.issues.some((issue) => issue.rule === "gallons_above_tank")).toBe(
      true,
    );
  });

  it("warns when the truck has no load that day and does not promote", () => {
    const result = runOne(baseFuel, {
      loadSpans: [{ unitNumber: "02", startDate: "2026-09-25", endDate: "2026-09-25" }],
    });
    expect(result.decisions[0]?.promote).toBe(false);
    expect(result.decisions[0]?.issues.some((issue) => issue.rule === "no_load_that_day")).toBe(
      true,
    );
  });

  it("warns on impossible MPG and still promotes the fuel", () => {
    const draft = mapFuelRecord(baseFuel);
    const result = runFuelPipeline([draft], {
      knownUnits: new Set(["02"]),
      loadSpans: spansFor(["02"]),
      weekMiles: [{ unitNumber: "02", weekStart: WEEK, milesHundredths: 100 }],
      ...RANGE,
      previousFetched: null,
      settings,
      existingDuplicates: [],
    });
    expect(result.decisions[0]?.promote).toBe(true);
    expect(result.weekIssues.some((issue) => issue.rule === "impossible_mpg")).toBe(true);
  });

  it("blocks the import when the row count drops past the setting", () => {
    const drafts = [1, 2, 3, 4].map((n) =>
      mapFuelRecord({ ...baseFuel, transactionId: `fuel-${n}`, card: `CARD${n}` }),
    );
    const result = runFuelPipeline(drafts, {
      knownUnits: new Set(["02"]),
      loadSpans: spansFor(["02"]),
      weekMiles: [],
      ...RANGE,
      previousFetched: 10,
      settings,
      existingDuplicates: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockIssue?.severity).toBe("Block");
    expect(result.blockIssue?.rule).toBe("row_count_drop");
    expect(result.decisions).toEqual([]);
  });

  it("blocks unlinked fuel at week close", () => {
    const issues = validateUnlinkedFuelAtWeekClose(
      [{ unitNumber: "02", weekStart: WEEK }],
      new Set(["03"]),
      WEEK,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("Block");
    expect(issues[0]?.rule).toBe("unlinked_fuel_week_close");
    expect(
      validateUnlinkedFuelAtWeekClose(
        [{ unitNumber: "02", weekStart: WEEK }],
        new Set(["02"]),
        WEEK,
      ),
    ).toEqual([]);
  });

  it("resolves a toll truck id to the unit number and rejects a short unit", () => {
    const matched = mapTollRecord({ transactionId: "t1", truckId: "vektor-truck-02", transactedAt: "2026-09-23 08:00:00", amount: "4.87" }, new Map([["vektor-truck-02", "02"]]));
    const short = mapTollRecord({ transactionId: "t2", truckId: "vektor-truck-02", transactedAt: "2026-09-23 08:01:00", amount: "4.87" }, new Map([["vektor-truck-02", "2"]]));
    const ok = runTollPipeline([matched], {
      knownUnits: new Set(["02"]),
      loadSpans: spansFor(["02"]),
      ...RANGE,
      previousFetched: null,
      settings,
      existingDuplicates: [],
    });
    const bad = runTollPipeline([short], {
      knownUnits: new Set(["02"]),
      loadSpans: spansFor(["02"]),
      ...RANGE,
      previousFetched: null,
      settings,
      existingDuplicates: [],
    });
    expect(ok.decisions[0]?.promote).toBe(true);
    expect(ok.decisions[0]?.draft.unitNumber).toBe("02");
    expect(bad.decisions[0]?.promote).toBe(false);
    expect(bad.decisions[0]?.issues.some((issue) => issue.rule === "truck_unmatched")).toBe(true);
  });

  it("uses the formatted amount when the raw money field is 0.00", () => {
    const draft = mapFuelRecord({
      ...baseFuel,
      discountedAmount: "0.00",
      formattedDiscountedAmount: "350.00",
    });
    expect(draft.amountCents).toBe(35000);
  });

  it("keeps one ledger row per Vektor transaction id", () => {
    const first = mapFuelRecord(baseFuel);
    const second = mapFuelRecord({ ...baseFuel, discountedAmount: "360.00" });
    const collapsed = collapseByTransactionId([first, second]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.amountCents).toBe(36000);
  });
});

describe("MCP allowlist", () => {
  it("allows fuel and toll read tools and throws on every other name", () => {
    expect(() => assertMcpToolAllowed(MCP_FUEL_LIST_TOOL)).not.toThrow();
    expect(() => assertMcpToolAllowed(MCP_FUEL_AGGREGATE_TOOL)).not.toThrow();
    expect(() => assertMcpToolAllowed(MCP_TOLLS_LIST_TOOL)).not.toThrow();
    expect(() => assertMcpToolAllowed(MCP_TOLLS_STATS_TOOL)).not.toThrow();
    expect(() => assertMcpToolAllowed("fleet_Trucks_GetByIDs")).not.toThrow();
    expect(() => assertMcpToolAllowed("fuel_Transactions_Create")).toThrow(/not allowlisted/);
    expect(() => assertMcpToolAllowed("core_Tolls_Delete")).toThrow(/not allowlisted/);
    expect([...MCP_CONNECTION_TOOLS]).toEqual([
      "core_Manifests_Get",
      "core_Manifests_OrderDetailsGet",
      "fleet_Trucks_GetByIDs",
    ]);
  });

  it("maps a paged tool payload and resolves the toll truck id", async () => {
    const calls: string[] = [];
    const listArgs: Record<string, unknown>[] = [];
    const fetched = await fetchFuelAndTollsFromTools({
      from: "2026-09-21",
      to: "2026-09-27",
      listToolNames: async () => [
        MCP_FUEL_LIST_TOOL,
        MCP_FUEL_AGGREGATE_TOOL,
        MCP_TOLLS_LIST_TOOL,
        MCP_TOLLS_STATS_TOOL,
        "fleet_Trucks_GetByIDs",
      ],
      callTool: async (name, args) => {
        calls.push(name);
        if (name === MCP_FUEL_LIST_TOOL || name === MCP_TOLLS_LIST_TOOL) listArgs.push(args);
        if (name === MCP_FUEL_LIST_TOOL) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  transactions: [
                    {
                      transactionId: "fuel-02-1",
                      unitNumber: "02",
                      transactedAt: "2026-09-23 14:05:00",
                      gallons: "100.000",
                      discountedAmount: "0.00",
                      formattedDiscountedAmount: "350.00",
                      retailAmount: "350.00",
                      product: "DIESEL",
                      cardNumber: "CARD02",
                    },
                  ],
                }),
              },
            ],
          };
        }
        if (name === MCP_TOLLS_LIST_TOOL) {
          return {
            structuredContent: {
              tolls: [
                {
                  transactionId: "toll-001",
                  truckId: "vektor-truck-02",
                  transactedAt: "2026-09-23 08:00:00",
                  amount: "4.87",
                },
              ],
            },
          };
        }
        if (name === "fleet_Trucks_GetByIDs") {
          return {
            structuredContent: {
              trucks: [{ truckId: "vektor-truck-02", referenceId: "02" }],
            },
          };
        }
        if (name === MCP_FUEL_AGGREGATE_TOOL) {
          return { structuredContent: { totalAmount: "350.00" } };
        }
        if (name === MCP_TOLLS_STATS_TOOL) {
          return { structuredContent: { count: 1, totalAmount: "4.87" } };
        }
        throw new Error(`unexpected ${name}`);
      },
    });
    expect(calls).toContain(MCP_FUEL_LIST_TOOL);
    expect(calls).not.toContain("fuel_Transactions_Create");
    expect(listArgs).toEqual([
      buildTransactionDateArgs({ from: "2026-09-21", to: "2026-09-27", page: 1 }),
      buildTransactionDateArgs({ from: "2026-09-21", to: "2026-09-27", page: 1 }),
    ]);
    expect(fetched.fuel[0]?.amountCents).toBe(35000);
    expect(fetched.fuel[0]?.unitNumber).toBe("02");
    expect(fetched.tolls[0]?.unitNumber).toBe("02");
    expect(fetched.tolls[0]?.amountCents).toBe(487);
  });

  it("requests the next fuel page until a short page", async () => {
    const fuelPages: number[] = [];
    await fetchFuelAndTollsFromTools({
      from: "2026-09-21",
      to: "2026-09-27",
      listToolNames: async () => [
        MCP_FUEL_LIST_TOOL,
        MCP_TOLLS_LIST_TOOL,
        "fleet_Trucks_GetByIDs",
      ],
      callTool: async (name, args) => {
        if (name === MCP_FUEL_LIST_TOOL) {
          fuelPages.push(Number(args.page));
          const count = args.page === 1 ? VEKTOR_LIST_PER_PAGE : 1;
          return {
            transactions: Array.from({ length: count }, (_, index) => ({
              transactionId: `fuel-${args.page}-${index}`,
            })),
          };
        }
        if (name === MCP_TOLLS_LIST_TOOL) return { tolls: [] };
        return {};
      },
    });
    expect(fuelPages).toEqual([1, 2]);
  });
});

describe("migration file", () => {
  const sql = readFileSync(
    resolve("supabase/migrations/20261007140000_fuel_tolls_import.sql"),
    "utf8",
  );

  it("adds staging and ledger tables with RLS and does not say to apply now", () => {
    expect(sql).toMatch(/do not apply until the owner says go/i);
    for (const table of [
      "vektor_fuel_staging",
      "vektor_toll_staging",
      "fuel_transactions",
      "toll_transactions",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`constraint ${table}_tx_unique unique (vektor_transaction_id)`);
      expect(sql).toContain("public.is_allowed_user()");
    }
    expect(sql).toContain("fuel_ppg_min_tenth_cents");
    expect(sql).toContain(String(FUEL_TOLL_SETTING_DEFAULTS.priceMinTenthCents));
    expect(sql).toContain(String(FUEL_TOLL_SETTING_DEFAULTS.dieselTankGallonsMilli));
    expect(sql).toContain("amount_cents integer not null");
  });
});
