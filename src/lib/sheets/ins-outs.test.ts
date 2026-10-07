import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/fuel-tolls/csv";
import {
  buildTruckWeekInsOuts,
  insFromLoadLedger,
  outsFromMgmtExpenses,
  sheetAmountToCents,
} from "@/lib/sheets/ins-outs";
import { loadTruckWeekInsOuts } from "@/lib/sheets/read";

const WEEK = { weekStart: "2026-10-05", weekEnd: "2026-10-11" };

const LEDGER = `
Truck ID,Load ID
Pick Up Date,Delivery Date,Week,Load ID,Rate
09/03/2026,2026-09-03 0:00:00,36,TBH-1097,"$3,200.00"
10/02/2026,10/05/2026,41,TBH1178,"$2,750.00"
10/06/2026,10/07/2026,41,TBH1186,"$3,200.00"
,,,,,
10/06/2026,10/07/2026,41,,"$9.00"
`;

const EXPENSES = `
Row ID,Date,Category,Amount,Note,Week
ME-0001,10/05/2026,Job Post,$300.00,,41
ME-0002,10/05/2026,Vektor Fee,$30.00,250,41
ME-0003,10/05/2026,Sintra AI,$0.00,,41
ME-0004,10/05/2026,Quickbooks,,107.88,41
ME-0005,09/08/2026,MVR,$12.00,,37
`;

describe("sheet Ins and Outs", () => {
  it("parses dollar text to integer cents", () => {
    expect(sheetAmountToCents("$2,750.00")).toBe(275_000);
    expect(sheetAmountToCents("")).toBeNull();
    expect(sheetAmountToCents("$0.00")).toBe(0);
  });

  it("sums Rate by delivery date and management expenses by date", () => {
    const ledger = parseCsv(LEDGER);
    const expenses = parseCsv(EXPENSES);
    expect(insFromLoadLedger(ledger, WEEK.weekStart, WEEK.weekEnd)).toEqual({
      insCents: 595_000,
      loadCount: 2,
    });
    const outs = outsFromMgmtExpenses(expenses, WEEK.weekStart, WEEK.weekEnd);
    expect(outs.outsCents).toBe(33_000);
    expect(outs.categories).toEqual([
      { category: "Vektor Fee", cents: 3_000 },
      { category: "Job Post", cents: 30_000 },
    ]);
    const row = buildTruckWeekInsOuts({
      unitNumber: "3",
      truckName: "John Reed",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: expenses,
      note: null,
    });
    expect(row.netCents).toBe(562_000);
    expect(row.readable).toBe(true);
  });
});

describe("sheet fetch", () => {
  it("reads a public csv export", async () => {
    const rows = await loadTruckWeekInsOuts(
      [
        {
          unitNumber: "3",
          truckName: "John Reed",
          googleSheetUrl: "https://docs.google.com/spreadsheets/d/sheet-3/edit",
        },
      ],
      WEEK.weekStart,
      WEEK.weekEnd,
      {
        env: {},
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("Ledger")) {
            return new Response(LEDGER, { status: 200 });
          }
          if (url.includes("Mgmt")) {
            return new Response(EXPENSES, { status: 200 });
          }
          return new Response("missing", { status: 400 });
        },
      },
    );
    expect(rows[0]).toMatchObject({
      unitNumber: "3",
      insCents: 595_000,
      outsCents: 33_000,
      readable: true,
      note: null,
    });
  });

  it("says when a public sheet redirects to sign-in", async () => {
    const rows = await loadTruckWeekInsOuts(
      [
        {
          unitNumber: "4",
          truckName: "Unit 4",
          googleSheetUrl: "https://docs.google.com/spreadsheets/d/sheet-4/edit",
        },
      ],
      WEEK.weekStart,
      WEEK.weekEnd,
      {
        env: {},
        fetchImpl: async () =>
          new Response("", {
            status: 302,
            headers: { location: "https://accounts.google.com/ServiceLogin" },
          }),
      },
    );
    expect(rows[0]?.readable).toBe(false);
    expect(rows[0]?.note).toMatch(/not readable/);
    expect(rows[0]?.insCents).toBe(0);
  });

  it("reads formatted values with a service account token", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const calls: string[] = [];
    const rows = await loadTruckWeekInsOuts(
      [
        {
          unitNumber: "3",
          truckName: "John Reed",
          googleSheetUrl: "https://docs.google.com/spreadsheets/d/sheet-3/edit",
        },
      ],
      WEEK.weekStart,
      WEEK.weekEnd,
      {
        env: {
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "sheets@example.iam.gserviceaccount.com",
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: pem,
        },
        fetchImpl: async (input, init) => {
          const url = String(input);
          calls.push(url);
          if (url.includes("oauth2.googleapis.com/token")) {
            expect(String(init?.body)).toContain("assertion=");
            expect(String(init?.body)).not.toContain(pem);
            return new Response(JSON.stringify({ access_token: "token-test" }), { status: 200 });
          }
          if (url.includes("/values:batchGet")) {
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-test");
            return new Response(
              JSON.stringify({
                valueRanges: [
                  {
                    values: [
                      ["Delivery Date", "Load ID", "Rate"],
                      ["10/05/2026", "TBH1178", "$2,750.00"],
                    ],
                  },
                  {
                    values: [
                      ["Date", "Category", "Amount"],
                      ["10/05/2026", "Vektor Fee", "$30.00"],
                    ],
                  },
                ],
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              sheets: [
                { properties: { title: "Truck #03 Load Ledger" } },
                { properties: { title: "Mgmt Expenses" } },
              ],
            }),
            { status: 200 },
          );
        },
      },
    );
    expect(calls.some((url) => url.includes("oauth2.googleapis.com/token"))).toBe(true);
    expect(rows[0]).toMatchObject({ insCents: 275_000, outsCents: 3_000, readable: true });
  });
});
