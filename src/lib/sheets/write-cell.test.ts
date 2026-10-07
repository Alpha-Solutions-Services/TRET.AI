import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { locateLedgerCell, pickLedgerTitle, sheetCellValue, writeOneSheetCell } from "@/lib/sheets/write-cell";

const GRID = [
  ["Truck #", "03"],
  ["Load ID", "Delivery Date", "Rate", "Loaded Miles", "Deadhead Miles", "Driver"],
  ["TBH1192", "2026-10-06", "1000.00", "400", "", "Casey"],
];

describe("sheet cell writes", () => {
  it("finds the rate cell for a compact load id", () => {
    expect(locateLedgerCell(GRID, "TBH--1192", "rate")).toEqual({ row: 2, column: 2, a1: "C3" });
    expect(locateLedgerCell(GRID, "TBH--1192", "deadhead")?.a1).toBe("E3");
    expect(locateLedgerCell(GRID, "TBH--0001", "rate")).toBeNull();
  });

  it("writes dollars and miles as sheet text", () => {
    expect(sheetCellValue("rate", "150000")).toBe("1500.00");
    expect(sheetCellValue("loaded_miles", "41250")).toBe("412.50");
    expect(sheetCellValue("driver", "Casey Hale")).toBe("Casey Hale");
  });

  it("picks the truck load ledger tab", () => {
    expect(pickLedgerTitle(["Cover", "Truck #03 Load Ledger"], "3")).toBe("Truck #03 Load Ledger");
  });

  it("refuses a write when the account cannot edit", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "token" }));
      }
      if (url.includes("drive/v3")) {
        return new Response(JSON.stringify({ capabilities: { canEdit: false } }));
      }
      return new Response("no", { status: 404 });
    }) as typeof fetch;
    const result = await writeOneSheetCell({
      spreadsheetId: "sheet",
      unitNumber: "03",
      loadId: "TBH--1192",
      field: "rate",
      value: "100",
      env: {
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "sheets@example.com",
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: pem,
      },
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, error: "The Google account cannot edit this sheet." });
  });
});
