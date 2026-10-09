import { describe, expect, it } from "vitest";
import { MCP_CONNECTION_TOOLS } from "./allowlist";
import {
  VEKTOR_LIST_ARGUMENT_NAMES,
  VEKTOR_LIST_PER_PAGE,
  buildManifestListArgs,
  buildManifestsGetArgs,
  buildOrderDetailsGetArgs,
  buildTransactionDateArgs,
  buildTrucksGetByIdsArgs,
  encodeFiltersArgument,
  filtersWireColumn12,
} from "./args";
import { fetchManifestsFromTools } from "./fetch-manifests";
import { probeVektorConnection } from "./live";
import type { VektorManifest } from "../types";

const ACCEPTED_TOP_LEVEL = VEKTOR_LIST_ARGUMENT_NAMES;

function expectAcceptedListArgs(args: Record<string, unknown>): void {
  for (const key of Object.keys(args)) {
    expect(ACCEPTED_TOP_LEVEL).toContain(key);
  }
  expect(args).not.toHaveProperty("first_stop_appointment_start_date");
  expect(args).not.toHaveProperty("page_size");
  expect(args).not.toHaveProperty("page_token");
  expect(args.page).toEqual(expect.any(Number));
  expect(args.perPage).toBe(VEKTOR_LIST_PER_PAGE);
  expect(typeof args.filters).toBe("string");
  expect(Array.isArray(args.filters)).toBe(false);
  expect(JSON.stringify(args).includes('"filters":{')).toBe(false);
  expect(JSON.stringify(args).includes('"filters":[')).toBe(false);
  expect(filtersWireColumn12(args)).toBe('"');
}

describe("core_Manifests_Get arguments", () => {
  it("uses filters, page, and perPage", () => {
    const args = buildManifestsGetArgs({
      queryFrom: "2026-09-07",
      queryTo: "2026-10-04",
      page: 2,
    });
    expectAcceptedListArgs(args);
    expect(args).toEqual({
      filters: JSON.stringify(
        JSON.stringify({
          first_stop_appointment_start_date: {
            from: "2026-09-07",
            to: "2026-10-04",
          },
        }),
      ),
      page: 2,
      perPage: 100,
    });
    expect(filtersWireColumn12(args)).toBe('"');
  });

  it("encodes an array of field objects as a JSON string", () => {
    const logical = [
      { field: "firstStopAppointmentStartDate", from: "2026-09-21", to: "2026-10-14" },
    ];
    const args = buildManifestListArgs(logical, 1);
    expectAcceptedListArgs(args);
    expect(args.filters).toBe(JSON.stringify(JSON.stringify(logical)));
    expect(encodeFiltersArgument("")).toBe("");
    expect(encodeFiltersArgument({})).toBe(JSON.stringify("{}"));
  });

  it("starts at page 1 when the caller does not pass a page", () => {
    const args = buildManifestsGetArgs({
      queryFrom: "2026-10-07",
      queryTo: "2026-10-07",
    });
    expect(args.page).toBe(1);
    expectAcceptedListArgs(args);
  });
});

describe("fuel and toll list arguments", () => {
  it("uses the same top-level envelope as manifests", () => {
    const args = buildTransactionDateArgs({
      from: "2026-09-21",
      to: "2026-09-27",
      page: 3,
    });
    expectAcceptedListArgs(args);
    expect(args).toEqual({
      filters: JSON.stringify(
        JSON.stringify({
          transaction_date: {
            from: "2026-09-21",
            to: "2026-09-27",
          },
        }),
      ),
      page: 3,
      perPage: 100,
    });
  });
});

describe("tools that were not rejected", () => {
  it("keeps manifest id and truck ids as their own arguments", () => {
    expect(buildOrderDetailsGetArgs("manifest-1")).toEqual({ manifest_id: "manifest-1" });
    expect(buildTrucksGetByIdsArgs(["truck-1"])).toEqual({ ids: ["truck-1"] });
  });
});

describe("Test connection probe", () => {
  it("calls core_Manifests_Get with the accepted top-level names", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const day = new Date().toISOString().slice(0, 10);
    const result = await probeVektorConnection({
      listToolNames: async () => [...MCP_CONNECTION_TOOLS],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return {};
      },
    });
    expect(result.toolCount).toBe(MCP_CONNECTION_TOOLS.length);
    expect(calls).toEqual([
      {
        name: "core_Manifests_Get",
        args: buildManifestsGetArgs({ queryFrom: day, queryTo: day }),
      },
    ]);
    expectAcceptedListArgs(calls[0]!.args);
  });
});

describe("manifest list paging", () => {
  it("requests the next page number until a short page", async () => {
    const pages: number[] = [];
    const full = Array.from({ length: VEKTOR_LIST_PER_PAGE }, (_, index) =>
      manifestRow(`id-${index}`),
    );
    await fetchManifestsFromTools({
      from: "2026-09-21",
      to: "2026-09-27",
      callTool: async (name, args) => {
        if (name !== "core_Manifests_Get") return {};
        pages.push(Number(args.page));
        expectAcceptedListArgs(args);
        if (args.page === 1) return { manifests: full };
        return { manifests: [manifestRow("id-last")] };
      },
    });
    expect(pages).toEqual([1, 2]);
  });
});

function manifestRow(manifestId: string): VektorManifest {
  return {
    manifestId,
    status: "STATUS_BOOKED",
    orders: [{ orderId: "order-1" }],
    stops: [{ orderStopType: "dropoff" }],
  };
}
