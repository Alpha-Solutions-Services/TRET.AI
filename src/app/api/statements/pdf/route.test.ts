import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWeekStatements } from "@/lib/statements/engine";
import type { StatementsPageData } from "@/lib/statements/queries";
import type { WeekStatementInput } from "@/lib/statements/types";

const { loadStatementsMock, sheetsMock, clientMock } = vi.hoisted(() => ({
  loadStatementsMock: vi.fn(),
  sheetsMock: vi.fn(),
  clientMock: vi.fn(),
}));

vi.mock("@/lib/auth/access", () => ({
  checkAccess: async () => ({ status: "allowed" }),
}));

vi.mock("@/lib/statements/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/statements/queries")>("@/lib/statements/queries");
  return {
    ...actual,
    loadStatements: (...args: unknown[]) => loadStatementsMock(...args),
  };
});

vi.mock("@/lib/sheets/load-week", () => ({
  loadActiveTruckInsOuts: (...args: unknown[]) => sheetsMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => clientMock(),
}));

import { GET } from "./route";

const WEEK = "2026-10-05";

function readFixture(): WeekStatementInput {
  const raw = JSON.parse(readFileSync(resolve("fixtures/statements/week-2026-09-21.json"), "utf8")) as Omit<
    WeekStatementInput,
    "fixedOverrides" | "importRuns" | "rowCountDropPct"
  >;
  return {
    ...raw,
    fixedOverrides: [],
    importRuns: [],
    rowCountDropPct: { loads: 50, fuel: 50, tolls: 50 },
  };
}

function pageFrom(input: WeekStatementInput, extra: Partial<StatementsPageData>): StatementsPageData {
  const result = buildWeekStatements(input);
  return {
    ready: true,
    lockReady: true,
    error: null,
    weekStart: WEEK,
    weekEnd: "2026-10-11",
    locked: false,
    closedAt: null,
    closedBy: null,
    liveDiffers: false,
    units: result.units,
    fleet: result.fleet,
    blockers: [],
    liveBlockers: [],
    warnings: [{ rule: "sheet_fee_differs", message: "Truck 02: sheet fee differs", ref: "02" }],
    closeAllowed: true,
    pending: [],
    ...extra,
  };
}

function chain(data: unknown) {
  const builder = {
    select() {
      return builder;
    },
    gte() {
      return builder;
    },
    lte() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

describe("GET /api/statements/pdf", () => {
  const input = readFixture();

  beforeEach(() => {
    sheetsMock.mockResolvedValue({ rows: [], error: null });
    clientMock.mockResolvedValue({
      from(table: string) {
        if (table === "trucks") {
          return chain([
            { id: "11111111-1111-4111-8111-111111111102", name: "Truck Two", owner_name: "Legacy Inc Global" },
            { id: "22222222-2222-4222-8222-222222222203", name: "Truck Three", owner_name: "Managed Owner" },
          ]);
        }
        if (table === "loads") {
          return chain(
            input.loads
              .filter((load) => load.deliveryDate >= "2026-09-21" && load.deliveryDate <= "2026-09-27" && load.truckId)
              .map((load) => ({
                id: load.id,
                truck_id: load.truckId,
                load_id: load.id,
                delivery_date: load.deliveryDate,
                broker_name: null,
                origin_city: null,
                origin_state: null,
                destination_city: null,
                destination_state: null,
                loaded_distance_mi: 10,
                deadhead_miles: 1,
                rate_cents: load.grossCents + 100,
              })),
          );
        }
        if (table === "fuel_transactions") {
          return chain([
            { unit_number: "02", amount_cents: 1, gallons_milli: 1000, product: "diesel" },
            { unit_number: "03", amount_cents: 1, gallons_milli: 1000, product: "diesel" },
          ]);
        }
        return chain([{ unit_number: "02", amount_cents: 1 }]);
      },
    });
  });

  it("returns a PDF for week 2026-10-05 when the only issues are warnings", async () => {
    loadStatementsMock.mockResolvedValue(pageFrom(input, {}));
    const response = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("returns the per-truck PDF and the all-trucks Monday PDF from the same route", async () => {
    loadStatementsMock.mockResolvedValue(pageFrom(input, {}));
    const one = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}&unit=02`));
    expect(one.status).toBe(200);
    expect(one.headers.get("content-type")).toContain("application/pdf");
    expect(one.headers.get("content-disposition")).toContain("unit-02");
    const all = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(all.status).toBe(200);
    expect(all.headers.get("content-disposition")).toContain(`tret-statement-${WEEK}.pdf`);
    expect(Buffer.from(new Uint8Array(await all.arrayBuffer())).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("still refuses the PDF when the week has a blocker", async () => {
    loadStatementsMock.mockResolvedValue(
      pageFrom(input, {
        warnings: [],
        blockers: [{ rule: "unlinked_fuel_week_close", message: "Fuel is not linked.", ref: "02" }],
        closeAllowed: false,
      }),
    );
    const response = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Fuel is not linked.");
  });

  it("still refuses the PDF when imported rows disagree and there are no warnings", async () => {
    loadStatementsMock.mockResolvedValue(pageFrom(input, { warnings: [] }));
    const response = await GET(new Request(`http://localhost/api/statements/pdf?week=${WEEK}`));
    expect(response.status).toBe(409);
  });
});
