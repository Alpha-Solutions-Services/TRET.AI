import { generateKeyPairSync } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
}));
import { parseCsv } from "@/lib/fuel-tolls/csv";
import {
  MGMT_EXPENSE_CATEGORIES,
  buildTruckWeekInsOuts,
  fleetInsOutsTotals,
  insFromLoadLedger,
  outsFromMgmtExpenses,
  pickLoadLedgerTitle,
  sheetAmountToCents,
  sheetDay,
} from "@/lib/sheets/ins-outs";
import { inWeek } from "@/lib/sheets/cell";
import { InsOutsClient } from "@/components/ins-outs/ins-outs-client";
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
      headerFound: true,
      loads: [
        { loadId: "TBH1178", rateCents: 275_000 },
        { loadId: "TBH1186", rateCents: 320_000 },
      ],
    });
    const outs = outsFromMgmtExpenses(expenses, WEEK.weekStart, WEEK.weekEnd);
    expect(outs.outsCents).toBe(33_000);
    const built = buildTruckWeekInsOuts({
      unitNumber: "3",
      truckName: "John Reed",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: expenses,
      note: null,
    });
    expect(built.recentWeeks).toHaveLength(8);
    expect(built.recentWeeks.at(-1)).toMatchObject({ weekStart: "2026-10-05", insCents: 595_000 });
    expect(built.recentWeeks.find((week) => week.weekStart === "2026-08-31")?.insCents).toBe(320_000);
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

  it("totals readable trucks and lists every management category", () => {
    const ledger = parseCsv(LEDGER);
    const expenses = parseCsv(EXPENSES);
    const readable = buildTruckWeekInsOuts({
      unitNumber: "3",
      truckName: "John Reed",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: expenses,
      note: null,
    });
    const unread = buildTruckWeekInsOuts({
      unitNumber: "4",
      truckName: "No sheet",
      ...WEEK,
      loadLedger: null,
      mgmtExpenses: null,
      note: "No Google Sheet link. Paste it on Trucks.",
    });
    const fleet = fleetInsOutsTotals([readable, unread]);
    expect(fleet.readableCount).toBe(1);
    expect(fleet.loadCount).toBe(2);
    expect(fleet.insCents).toBe(595_000);
    expect(fleet.outsCents).toBe(33_000);
    expect(fleet.netCents).toBe(562_000);
    expect(fleet.categories).toHaveLength(MGMT_EXPENSE_CATEGORIES.length);
    expect(fleet.categories.find((row) => row.category === "Vektor Fee")?.cents).toBe(3_000);
    expect(fleet.categories.find((row) => row.category === "Spare Expense 5")?.cents).toBe(0);
  });

  it("renders per-truck categories and a fleet total without an em dash", () => {
    const ledger = parseCsv(LEDGER);
    const expenses = parseCsv(EXPENSES);
    const readable = buildTruckWeekInsOuts({
      unitNumber: "3",
      truckName: "John Reed",
      ...WEEK,
      loadLedger: ledger,
      mgmtExpenses: expenses,
      note: null,
    });
    const unread = buildTruckWeekInsOuts({
      unitNumber: "4",
      truckName: "No sheet",
      ...WEEK,
      loadLedger: null,
      mgmtExpenses: null,
      note: "No Google Sheet link. Paste it on Trucks.",
    });
    const html = renderToStaticMarkup(
      createElement(InsOutsClient, {
        weekStart: WEEK.weekStart,
        weekEnd: WEEK.weekEnd,
        rows: [readable, unread],
        error: null,
        sheetEnvMissing: ["GOOGLE_SERVICE_ACCOUNT_EMAIL"],
        mismatchCount: 1,
        mismatchError: null,
      }),
    );
    expect(html).toContain("Legacy Inc income and outgoing");
    expect(html).toContain("Showing 2026-10-05 through 2026-10-11");
    expect(html).toContain("Spare Expense 5");
    expect(html).toContain("Vektor Fee");
    expect(html).toContain("John Reed");
    expect(html).toContain("No Google Sheet link. Paste it on Trucks.");
    expect(html).not.toContain("Unread");
    expect(html).toContain("Sheet mismatches: 1");
    expect(html).toContain("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    expect(html).toContain("Fleet");
    expect(html).toContain("$5950.00");
    expect(html).toContain("$330.00");
    expect(html).not.toContain("\u2014");
    expect(html).not.toContain("\u2013");
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
    const batch = calls.find((url) => url.includes("/values:batchGet")) ?? "";
    expect(batch).toContain("dateTimeRenderOption=FORMATTED_STRING");
    expect(decodeURIComponent(batch)).toContain("!A1:AZ");
    expect(rows[0]).toMatchObject({ insCents: 275_000, outsCents: 3_000, readable: true });
  });

  it("signs in when the private key uses literal newlines and quotes", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const stored = `"${pem.replace(/\n/g, "\\n")}"`;
    let signedIn = false;
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
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: stored,
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("oauth2.googleapis.com/token")) {
            signedIn = true;
            return new Response(JSON.stringify({ access_token: "token-test" }), { status: 200 });
          }
          if (url.includes("/values:batchGet")) {
            return new Response(
              JSON.stringify({
                valueRanges: [
                  { values: [["Delivery Date", "Load ID", "Rate"], ["10/11/2026", "TBH1", "$10.00"]] },
                  { values: [["Date", "Category", "Amount"]] },
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
    expect(signedIn).toBe(true);
    expect(rows[0]).toMatchObject({ insCents: 1_000, readable: true, note: null });
  });

  it("uses the JSON service account when that env is set", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    let iss = "";
    await loadTruckWeekInsOuts(
      [
        {
          unitNumber: "03",
          truckName: "John Reed",
          googleSheetUrl: "https://docs.google.com/spreadsheets/d/sheet-3/edit",
        },
      ],
      WEEK.weekStart,
      WEEK.weekEnd,
      {
        env: {
          GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
            client_email: "json@example.iam.gserviceaccount.com",
            private_key: pem,
          }),
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "pem@example.iam.gserviceaccount.com",
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "not-a-key",
        },
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.includes("oauth2.googleapis.com/token")) {
            const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
            const payload = assertion.split(".")[1] ?? "";
            iss = JSON.parse(Buffer.from(payload, "base64url").toString()).iss as string;
            return new Response(JSON.stringify({ access_token: "token-test" }), { status: 200 });
          }
          if (url.includes("/values:batchGet")) {
            return new Response(JSON.stringify({ valueRanges: [{ values: [] }, { values: [] }] }), {
              status: 200,
            });
          }
          return new Response(
            JSON.stringify({
              sheets: [{ properties: { title: "unit 3 Load Ledger" } }, { properties: { title: "Mgmt Expenses" } }],
            }),
            { status: 200 },
          );
        },
      },
    );
    expect(iss).toBe("json@example.iam.gserviceaccount.com");
  });

  it("names a bad private key in plain language and keeps the OpenSSL cause", async () => {
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
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\\n${"A".repeat(180)}\\n-----END PRIVATE KEY-----`,
        },
        fetchImpl: async () => {
          throw new Error("should not call Google");
        },
      },
    );
    expect(rows[0]?.readable).toBe(false);
    expect(rows[0]?.note).toBe("Google private key on the server is the wrong format");
    expect(rows[0]?.noteDetail).toMatch(/error:|DECODER|unsupported/i);
    expect(rows[0]?.insCents).toBe(0);
  });
});

describe("sheet dates", () => {
  it("reads ledger datetimes and Google serial days", () => {
    expect(sheetDay("2026-09-01 0:00:00")).toBe("2026-09-01");
    expect(sheetDay("9/1/2026 12:00:00 AM")).toBe("2026-09-01");
    const epoch = Date.UTC(1899, 11, 30);
    const target = Date.UTC(2026, 8, 1);
    const serial = Math.round((target - epoch) / 86_400_000);
    expect(sheetDay(String(serial))).toBe("2026-09-01");
    const ledger = parseCsv(
      "Delivery Date,Load ID,Rate\n2026-09-01 0:00:00,TBH-1081,\"$1,600.00\"\n",
    );
    expect(insFromLoadLedger(ledger, "2026-08-31", "2026-09-06")).toMatchObject({
      insCents: 160_000,
      loadCount: 1,
      headerFound: true,
    });
    expect(sheetDay("2026-10-05T00:00:00")).toBe("2026-10-05");
    expect(sheetDay("10/11/2026 11:59:00 PM")).toBe("2026-10-11");
    expect(inWeek("2026-10-11", WEEK.weekStart, WEEK.weekEnd)).toBe(true);
    expect(inWeek("2026-10-12", WEEK.weekStart, WEEK.weekEnd)).toBe(false);
    expect(inWeek("2026-10-04", WEEK.weekStart, WEEK.weekEnd)).toBe(false);
    const sunday = parseCsv("Delivery Date,Load ID,Rate\n10/11/2026,TBH-SUN,\"$10.00\"\n");
    expect(insFromLoadLedger(sunday, WEEK.weekStart, WEEK.weekEnd)).toMatchObject({
      insCents: 1_000,
      loadCount: 1,
    });
    const nextMonday = parseCsv("Delivery Date,Load ID,Rate\n10/12/2026,TBH-NEXT,\"$10.00\"\n");
    expect(insFromLoadLedger(nextMonday, WEEK.weekStart, WEEK.weekEnd).loadCount).toBe(0);
  });

  it("matches Truck #03 and unit 3 tab titles to the same truck", () => {
    const titles = ["Truck #03 Load Ledger", "Truck #04 Load Ledger", "Mgmt Expenses"];
    expect(pickLoadLedgerTitle(titles, "3")).toBe("Truck #03 Load Ledger");
    expect(pickLoadLedgerTitle(titles, "03")).toBe("Truck #03 Load Ledger");
    expect(pickLoadLedgerTitle(titles, "unit 3")).toBe("Truck #03 Load Ledger");
    expect(pickLoadLedgerTitle(["unit 3 Load Ledger", "Truck #04 Load Ledger"], "03")).toBe(
      "unit 3 Load Ledger",
    );
    expect(pickLoadLedgerTitle(titles, "13")).toBeNull();
  });
});
