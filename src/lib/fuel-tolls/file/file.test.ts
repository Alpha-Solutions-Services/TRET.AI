import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { suggestAssignment, suggestColumnMap } from "@/lib/llm-gateway/gemini";
import { AI_BUSY_NOTE } from "./messages";
import { SEEDED_IDENTITIES } from "./mappings";
import { prepareImport } from "./prepare";
import { gridFromUpload, parseGrid } from "./parse";
import { parseXlsxGrid } from "./xlsx";
import {
  STANDARD_FUEL_HEADER,
  markAiMapped,
  planImport,
  tollWhen,
} from "./plan";
import type { FuelQueuePayload, ImportContext, TollQueuePayload } from "./types";

const fuelCsv = readFileSync("fixtures/fuel/fuel-card-2026-10-05.csv", "utf8");
const tollXlsx = new Uint8Array(readFileSync("fixtures/tolls/ezpass-2026-10-05.xlsx"));
const sharedXlsx = new Uint8Array(readFileSync("fixtures/tolls/shared-strings-sample.xlsx"));

function fuelContext(extra?: ImportContext): ImportContext {
  const grid = [STANDARD_FUEL_HEADER];
  return {
    fuelLogs: ["2", "3", "4", "5", "6", "7", "8"].map((unitNumber) => ({ unitNumber, grid })),
    ...extra,
  };
}

function fuelPayload(row: { payload: { kind: string } | null }): FuelQueuePayload {
  expect(row.payload?.kind).toBe("fuel");
  return row.payload as FuelQueuePayload;
}

describe("fuel card file", () => {
  const grid = gridFromUpload({ csvText: fuelCsv });
  const plan = planImport(grid, fuelContext());

  it("sends unit 03 to Truck 3 and writes only input columns", () => {
    const truck3 = plan.rows.filter((row) => row.truck === "Truck 3");
    expect(truck3.length).toBe(5);
    expect(truck3.every((row) => row.status === "new")).toBe(true);
    expect(truck3.every((row) => row.targetSheet === "Truck #03 Fuel Log")).toBe(true);
    const headers = new Set(truck3.flatMap((row) => row.cells.map((cell) => cell.header)));
    expect([...headers].sort()).toEqual(["Date", "Gallons", "Load ID", "Location", "Total Cost", "Trip Group ID"]);
    expect(headers.has("Week")).toBe(false);
    expect(headers.has("Cost/Gal")).toBe(false);
    expect(headers.has("MPG")).toBe(false);
    const first = truck3[0]!;
    expect(first.cells.find((cell) => cell.header === "Date")).toEqual({
      header: "Date",
      a1: "A2",
      value: "10/06/2026",
    });
    expect(first.cells.find((cell) => cell.header === "Location")?.value).toBe("LEDGEWOOD NJ");
    expect(first.weekLabel).toBe("2026-10-05 to 2026-10-11");
  });

  it("splits invoice 0903522326 into ULSD and DEFD and leaves fees out of total cost", () => {
    const pair = plan.rows.filter((row) => fuelPayload(row).invoice === "0903522326");
    expect(pair.map((row) => fuelPayload(row).item)).toEqual(["ULSD", "DEFD"]);
    expect(pair.map((row) => fuelPayload(row).amountCents)).toEqual([25101, 2064]);
    expect(pair.map((row) => fuelPayload(row).gallonsMilli)).toEqual([43210, 4300]);
    expect(pair.map((row) => row.cells.find((cell) => cell.header === "Gallons")?.value)).toEqual(["43.21", "4.3"]);
    const feeRow = plan.rows.find((row) => fuelPayload(row).invoice === "0094969");
    expect(feeRow?.amountCents).toBe(26032);
    expect(feeRow?.cells.find((cell) => cell.header === "Total Cost")?.value).toBe("260.32");
  });

  it("flags a negative amount, an unknown unit, and a card that belongs to another truck", () => {
    const header = grid[0] ?? [];
    const unit = header.indexOf("Unit");
    const card = header.indexOf("Card #");
    const amt = header.indexOf("Amt");
    const badUnit = grid.map((row) => row.slice());
    badUnit[1]![unit] = "99";
    const flaggedUnit = planImport(badUnit, fuelContext()).rows[0]!;
    expect(flaggedUnit.status).toBe("flagged");
    expect(flaggedUnit.reason).toMatch(/not a known truck/);

    const badCard = grid.map((row) => row.slice());
    badCard[1]![card] = "00011";
    const flaggedCard = planImport(badCard, fuelContext()).rows[0]!;
    expect(flaggedCard.status).toBe("flagged");
    expect(flaggedCard.reason).toMatch(/another truck/);

    const refund = grid.map((row) => row.slice());
    refund[1]![amt] = "-10.00";
    const flaggedRefund = planImport(refund, fuelContext()).rows[0]!;
    expect(flaggedRefund.status).toBe("flagged");
    expect(flaggedRefund.reason).toMatch(/negative/);
    expect(flaggedRefund.cells).toEqual([]);
  });

  it("skips a Fuel Log row that already has the same date, location, gallons, and total cost", () => {
    const existing = [
      STANDARD_FUEL_HEADER,
      ["10/06/2026", "", "", "", "", "LEDGEWOOD NJ", "", "", "48.29", "313.84", "", "", "", ""],
    ];
    const again = planImport(grid, fuelContext({ fuelLogs: [{ unitNumber: "3", grid: existing }] }));
    const first = again.rows.find((row) => row.truck === "Truck 3")!;
    expect(first.status).toBe("duplicate");
  });

  it("leaves both ids blank when two loads overlap", () => {
    const overlap = planImport(
      grid,
      fuelContext({
        ledgers: [
          {
            unitNumber: "3",
            loads: [
              { loadId: "TBH--1001", tripId: "", pickupDate: "2026-10-01", deliveryDate: "2026-10-08" },
              { loadId: "TBH--1002", tripId: "", pickupDate: "2026-10-06", deliveryDate: "2026-10-09" },
            ],
          },
        ],
      }),
    );
    const row = overlap.rows.find((row) => row.truck === "Truck 3")!;
    expect(row.status).toBe("flagged");
    expect(row.link).toBeNull();
    expect(row.cells).toEqual([]);
  });

  it("writes a shared trip in Trip Group ID", () => {
    const shared = planImport(
      grid,
      fuelContext({
        ledgers: [
          {
            unitNumber: "3",
            loads: [{ loadId: "TBH--1192", tripId: "M-1195", pickupDate: "2026-10-06", deliveryDate: "2026-10-08" }],
          },
        ],
      }),
    );
    const row = shared.rows.find((row) => row.truck === "Truck 3")!;
    expect(row.status).toBe("new");
    expect(row.link).toBe("M-1195");
    expect(row.cells.find((cell) => cell.header === "Load ID")?.value).toBe("");
    expect(row.cells.find((cell) => cell.header === "Trip Group ID")?.value).toBe("M-1195");
  });

  it("does not write when Total Cost is not the column next to Gallons", () => {
    const header = ["Date", "Location", "Load ID", "Trip Group ID", "Gallons", "Week", "Total Cost"];
    const bad = planImport(grid, { fuelLogs: [{ unitNumber: "3", grid: [header] }] });
    const row = bad.rows.find((row) => row.truck === "Truck 3")!;
    expect(row.status).toBe("flagged");
    expect(row.reason).toMatch(/Total Cost/);
  });
});

describe("E-ZPass file", () => {
  const grid = parseXlsxGrid(tollXlsx);

  it("reads inline strings when the workbook has no shared strings", () => {
    expect(parseGrid(grid).kind).toBe("toll");
    expect(grid[0]).toContain("Transaction Id");
    expect(grid.some((row) => row.includes("Chicago Skyway Westbound"))).toBe(true);
  });

  it("reads shared strings and inline strings", () => {
    expect(parseXlsxGrid(sharedXlsx)).toEqual([
      ["Hello", "World"],
      ["Inline", "", "12.50"],
    ]);
  });

  it("sends plate 5OSB8626 to Truck 8 and uses the Chicago Skyway exit time", () => {
    const plan = planImport(grid);
    const plate = grid[0]?.indexOf("License Plate") ?? -1;
    const tx = grid[0]?.indexOf("Transaction Id") ?? -1;
    const ids = new Set(grid.filter((row) => row[plate] === "5OSB8626").map((row) => row[tx]));
    const truck8 = plan.rows.filter(
      (row) => row.payload?.kind === "toll" && ids.has((row.payload as TollQueuePayload).transactionId),
    );
    expect(ids.size).toBeGreaterThan(0);
    expect(truck8).toHaveLength(ids.size);
    expect(truck8.every((row) => row.truck === "Truck 8")).toBe(true);
    const skyway = plan.rows.find((row) => row.payload?.kind === "toll" && (row.payload as TollQueuePayload).location.includes("Chicago Skyway"));
    expect(skyway?.truck).toBe("Truck 3");
    const payload = skyway?.payload as TollQueuePayload;
    expect(payload.occurredAt).toBe("2026-10-07T11:56:59");
    expect(payload.isoDate).toBe("2026-10-07");
    expect(payload.transactionId).toBe("1505564277");
    expect(payload.amountCents).toBe(3780);
  });

  it("flags a tag that is not on file", () => {
    const plan = planImport(grid);
    const odd = plan.rows.find((row) => row.reason?.includes("YHM2482-TX"));
    expect(odd?.status).toBe("flagged");
    expect(odd?.cells).toEqual([]);
  });

  it("adds a toll to an empty Toll Expense cell and refuses a foreign value", () => {
    const loads = [{ loadId: "TBH--2001", tripId: "", pickupDate: "2026-10-05", deliveryDate: "2026-10-08" }];
    const open = planImport(grid, {
      ledgers: [{ unitNumber: "3", loads }],
      tollTargets: [{ unitNumber: "3", column: 44, rows: [{ loadId: "TBH--2001", rowNumber: 4, current: "" }] }],
    });
    const skyway = open.rows.find((row) => (row.payload as TollQueuePayload | null)?.transactionId === "1505564277");
    expect(skyway?.status).toBe("new");
    expect(skyway?.link).toBe("TBH--2001");
    expect(skyway?.cells[0]).toMatchObject({ header: "Toll Expense", a1: "AS4" });

    const foreign = planImport(grid, {
      ledgers: [{ unitNumber: "3", loads }],
      tollTargets: [{ unitNumber: "3", column: 44, rows: [{ loadId: "TBH--2001", rowNumber: 4, current: "12.00" }] }],
    });
    const held = foreign.rows.find((row) => (row.payload as TollQueuePayload | null)?.transactionId === "1505564277");
    expect(held?.status).toBe("flagged");
    expect(held?.reason).toMatch(/left unchanged/);
    expect(held?.cells).toEqual([]);
  });

  it("puts empty miles on the next load", () => {
    const moved = planImport(grid, {
      ledgers: [
        {
          unitNumber: "3",
          loads: [
            { loadId: "TBH--2000", tripId: "", pickupDate: "2026-10-01", deliveryDate: "2026-10-04" },
            { loadId: "TBH--2002", tripId: "", pickupDate: "2026-10-08", deliveryDate: "2026-10-09" },
          ],
        },
      ],
      tollTargets: [
        {
          unitNumber: "3",
          column: 44,
          rows: [
            { loadId: "TBH--2000", rowNumber: 2, current: "" },
            { loadId: "TBH--2002", rowNumber: 3, current: "" },
          ],
        },
      ],
    });
    const skyway = moved.rows.find((row) => (row.payload as TollQueuePayload | null)?.transactionId === "1505564277");
    expect(skyway?.status).toBe("new");
    expect(skyway?.link).toBe("TBH--2002");
    expect(skyway?.reason).toMatch(/next load/);
  });
});

describe("toll time", () => {
  it("uses the exit clock for a single-point toll", () => {
    expect(
      tollWhen({
        entryDate: "",
        entryTime: "",
        entryPlaza: "-",
        entryPlazaName: "None",
        exitDate: "10/7/2026",
        exitTime: "11:56:59",
      })?.occurredAt,
    ).toBe("2026-10-07T11:56:59");
  });
});

describe("AI fallback", () => {
  it("does nothing without a key", async () => {
    expect((await suggestColumnMap(["A", "B"], {})).map).toBeNull();
    expect(
      (
        await suggestAssignment(
          { kind: "fuel", unit: "03", card: "", plate: "", tag: "", date: "", location: "", choices: ["3"] },
          {},
        )
      ).choice,
    ).toBeNull();
  });

  it("keeps an AI column map in the queue", () => {
    const grid = gridFromUpload({ csvText: fuelCsv });
    const planned = planImport(grid, fuelContext());
    const held = markAiMapped(planned.rows);
    expect(held.every((row) => row.aiSuggested)).toBe(true);
    expect(held.filter((row) => row.truck === "Truck 3").every((row) => row.status === "flagged")).toBe(true);
  });

  it("accepts only a header the file actually has", async () => {
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      );
      expect(String(url)).not.toContain("test-key");
      const headers = new Headers(init?.headers);
      expect(headers.get("X-goog-api-key")).toBe("test-key");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      kind: "fuel",
                      columns: { tranDate: "Posted", unit: "Unit", item: "Item", qty: "Qty", amt: "Amt" },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );
    }) as typeof fetch;
    const mapped = await suggestColumnMap(
      ["Posted", "Unit", "Item", "Qty", "Amt"],
      { GEMINI_API_KEY: "test-key" },
      fetchImpl,
    );
    expect(mapped.map?.columns.tranDate).toBe("Posted");
    expect(mapped.map?.columns.unit).toBe("Unit");
    expect(mapped.busy).toBe(false);
  });

  it("keeps the rules and marks the queue when the model stays busy", async () => {
    const grid = gridFromUpload({ csvText: fuelCsv }).map((row) => row.slice());
    const unit = grid[0]?.indexOf("Unit") ?? -1;
    grid[1]![unit] = "99";
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("high demand", { status: 503 });
    }) as typeof fetch;
    const plan = await prepareImport(
      grid,
      fuelContext(),
      SEEDED_IDENTITIES,
      { GEMINI_API_KEY: "secret-key" },
      fetchImpl,
      async () => {},
    );
    const flagged = plan.rows.find((row) => row.status === "flagged")!;
    expect(calls).toBe(3);
    expect(plan.aiNotice).toBe(AI_BUSY_NOTE);
    expect(flagged.reason).toContain(AI_BUSY_NOTE);
    expect(flagged.aiSuggested).toBe(false);
    expect(flagged.cells).toEqual([]);
  });

  it("stays on the rules when the key is rejected", async () => {
    const fetchImpl = (async () => new Response("API key not valid", { status: 400 })) as typeof fetch;
    const plan = await prepareImport(
      [["Nope", "Also"], ["x", "y"]],
      {},
      SEEDED_IDENTITIES,
      { GEMINI_API_KEY: "secret-key" },
      fetchImpl,
      async () => {},
    );
    expect(plan.kind).toBe("unknown");
    expect(plan.aiNotice).toBeNull();
    expect(plan.message).toMatch(/not a fuel card/);
  });
});
