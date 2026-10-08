import { readFileSync } from "node:fs";
import { centsToDollarString } from "@/lib/money/cents";
import { resolveServiceAccount } from "@/lib/sheets/private-key";
import { gridFromUpload } from "./parse";
import { STANDARD_FUEL_HEADER, planImport } from "./plan";
import type { ImportPreviewRow, TollQueuePayload } from "./types";

export type DryRunLine = {
  truck: string;
  status: string;
  week: string;
  link: string;
  target: string;
  cells: string;
  amount: string;
  reason: string;
};

function line(row: ImportPreviewRow): DryRunLine {
  return {
    truck: row.truck ?? "",
    status: row.status,
    week: row.weekLabel ?? "",
    link: row.link ?? "",
    target: row.targetSheet ?? "",
    cells: row.cells.map((cell) => `${cell.header} ${cell.a1}=${cell.value}`).join("; "),
    amount: row.amountCents == null ? "" : centsToDollarString(Math.abs(row.amountCents)),
    reason: row.reason ?? "",
  };
}

/** Read-only plan for the sample files. Does not write sheets or the database. */
export function dryRunSamplePlan(env: Record<string, string | undefined> = process.env): {
  liveNote: string;
  truck3Fuel: DryRunLine[];
  truck3Tolls: DryRunLine[];
  truck8Tolls: DryRunLine[];
} {
  let liveNote =
    "Google Sheets were not read. No service account is set in this environment, and truck sheet links are not available here. No cells were written.";
  try {
    if (resolveServiceAccount(env)) {
      liveNote =
        "A Google service account is set, but this environment has no truck sheet URLs, so the live sheets were not read. No cells were written.";
    }
  } catch {
    liveNote =
      "Google Sheets were not read. The service account value could not be used, and truck sheet links are not available here. No cells were written.";
  }
  const fuelGrid = gridFromUpload({
    csvText: readFileSync("fixtures/fuel/fuel-card-2026-10-05.csv", "utf8"),
  });
  const tollGrid = gridFromUpload({
    xlsx: new Uint8Array(readFileSync("fixtures/tolls/ezpass-2026-10-05.xlsx")),
  });
  const fuel = planImport(fuelGrid, {
    fuelLogs: ["2", "3", "4", "5", "6", "7", "8"].map((unitNumber) => ({
      unitNumber,
      grid: [STANDARD_FUEL_HEADER],
    })),
  });
  const tolls = planImport(tollGrid);
  const header = tollGrid[0] ?? [];
  const plateCol = header.indexOf("License Plate");
  const txCol = header.indexOf("Transaction Id");
  const truck8Ids = new Set(
    tollGrid.filter((row) => row[plateCol] === "5OSB8626").map((row) => row[txCol] ?? ""),
  );
  return {
    liveNote,
    truck3Fuel: fuel.rows.filter((row) => row.truck === "Truck 3").map(line),
    truck3Tolls: tolls.rows
      .filter((row) => row.truck === "Truck 3")
      .map(line),
    truck8Tolls: tolls.rows
      .filter((row) => row.payload?.kind === "toll" && truck8Ids.has((row.payload as TollQueuePayload).transactionId))
      .map(line),
  };
}
