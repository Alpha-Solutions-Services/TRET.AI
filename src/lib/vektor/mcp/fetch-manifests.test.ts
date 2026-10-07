import { describe, expect, it } from "vitest";
import { fetchManifestsFromTools } from "./fetch-manifests";
import { manifestsFromPayload, summarizePayloadShape, unwrapToolPayload } from "./parse";
import type { VektorManifest } from "../types";

function delivered(manifestId: string): VektorManifest {
  return {
    manifestId,
    friendlyId: manifestId,
    status: "STATUS_DELIVERED",
    grossAmount: "100.00",
    orders: [{ orderId: "order-1", friendlyId: "TBH-1" }],
    stops: [
      {
        orderStopType: "dropoff",
        checkedOutAt: "2026-10-07 12:00:00",
        appointmentType: "APPOINTMENT_TYPE_FIXED",
      },
    ],
  };
}

describe("manifest payload parsing", () => {
  it("uses the text body when structuredContent is empty", () => {
    const payload = unwrapToolPayload({
      structuredContent: {},
      content: [
        {
          type: "text",
          text: JSON.stringify({ data: { items: [delivered("manifest-1")] } }),
        },
      ],
    });
    expect(manifestsFromPayload(payload).map((row) => row.manifestId)).toEqual(["manifest-1"]);
  });

  it("maps a delivered status that is not the STATUS_ enum", () => {
    const [row] = manifestsFromPayload([
      { id: "manifest-2", manifestStatus: { code: "delivered" }, grossAmount: "10.00" },
    ]);
    expect(row?.status).toBe("STATUS_DELIVERED");
    expect(row?.manifestId).toBe("manifest-2");
  });

  it("summarizes keys and counts without row values", () => {
    const note = summarizePayloadShape({
      manifests: [{ manifestId: "secret-id", driverName: "Hidden" }],
    });
    expect(note).toContain("manifests length 1");
    expect(note).toContain("manifestId");
    expect(note).not.toContain("secret-id");
    expect(note).not.toContain("Hidden");
  });
});

function logicalFilters(value: unknown): unknown {
  expect(typeof value).toBe("string");
  if (value === "") return "";
  return JSON.parse(value as string);
}

describe("empty Vektor list probe", () => {
  it("uses the schema date field when the snake_case filter returns nothing", async () => {
    const calls: unknown[] = [];
    const fetched = await fetchManifestsFromTools({
      from: "2026-10-05",
      to: "2026-10-07",
      listTools: async () => [
        {
          name: "core_Manifests_Get",
          inputSchema: {
            type: "object",
            properties: {
              filters: {
                type: "object",
                properties: {
                  firstStopAppointmentStartDate: {
                    type: "object",
                    properties: { from: { type: "string" }, to: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      ],
      callTool: async (name, args) => {
        if (name !== "core_Manifests_Get") return {};
        calls.push(args.filters);
        expect(JSON.stringify(args)[11]).toBe('"');
        const filters = logicalFilters(args.filters);
        if (
          filters &&
          typeof filters === "object" &&
          !Array.isArray(filters) &&
          "firstStopAppointmentStartDate" in filters
        ) {
          return { manifests: [delivered("manifest-live")] };
        }
        return { manifests: [] };
      },
    });
    expect(logicalFilters(calls[0])).toEqual({
      first_stop_appointment_start_date: { from: "2026-09-21", to: "2026-10-14" },
    });
    expect(logicalFilters(calls[1])).toEqual({
      firstStopAppointmentStartDate: { from: "2026-09-21", to: "2026-10-14" },
    });
    expect(fetched.manifests.map((row) => row.manifestId)).toEqual(["manifest-live"]);
    expect(fetched.report?.filterLabel).toBe("schema firstStopAppointmentStartDate");
    expect(fetched.report?.payloadNote).toMatch(/Used schema firstStopAppointmentStartDate/);
  });

  it("keeps delivery dates from an unfiltered list when every date filter is empty", async () => {
    const fetched = await fetchManifestsFromTools({
      from: "2026-10-05",
      to: "2026-10-07",
      callTool: async (name, args) => {
        if (name !== "core_Manifests_Get") return {};
        const filters = logicalFilters(args.filters);
        if (filters && typeof filters === "object" && !Array.isArray(filters) && Object.keys(filters).length === 0) {
          return { manifests: [delivered("manifest-open")] };
        }
        return { isError: true, content: [{ type: "text", text: "unknown filter field" }] };
      },
    });
    expect(fetched.report?.filterLabel).toBe("no date filter");
    expect(fetched.manifests).toHaveLength(1);
    expect(fetched.report?.keptForImport).toBe(1);
  });

  it("fails the import when every list call is a tool error", async () => {
    await expect(
      fetchManifestsFromTools({
        from: "2026-10-05",
        to: "2026-10-07",
        callTool: async () => ({
          isError: true,
          content: [{ type: "text", text: "unknown filter field" }],
        }),
      }),
    ).rejects.toThrow(/unknown filter field/);
  });

  it("records the payload shape when Vektor returns no rows", async () => {
    const fetched = await fetchManifestsFromTools({
      from: "2026-10-05",
      to: "2026-10-07",
      callTool: async () => ({ manifests: [], total: 0 }),
    });
    expect(fetched.manifests).toHaveLength(0);
    expect(fetched.report?.fetchedInWindow).toBe(0);
    expect(fetched.report?.payloadNote).toMatch(/manifests length 0/);
    expect(fetched.report?.payloadNote).toMatch(/did not|Payload/);
    expect(fetched.report?.payloadNote).toMatch(/Tried filters: first_stop_appointment_start_date/);
    expect(fetched.report?.filterLabel).toBe("first_stop_appointment_start_date");
  });

  it("does not send a field/from/to array when the schema describes one", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetched = await fetchManifestsFromTools({
      from: "2026-10-05",
      to: "2026-10-07",
      listTools: async () => [
        {
          name: "core_Manifests_Get",
          inputSchema: {
            type: "object",
            properties: {
              filters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: {
                      type: "string",
                      enum: ["firstStopAppointmentStartDate", "status"],
                    },
                    from: { type: "string" },
                    to: { type: "string" },
                  },
                },
              },
            },
          },
        },
      ],
      callTool: async (name, args) => {
        if (name !== "core_Manifests_Get") return {};
        calls.push(args);
        expect(typeof args.filters).toBe("string");
        expect(JSON.stringify(args).includes('"filters":[')).toBe(false);
        expect(JSON.stringify(args).includes('"filters":{')).toBe(false);
        const filters = logicalFilters(args.filters);
        const record =
          filters && typeof filters === "object" && !Array.isArray(filters)
            ? (filters as Record<string, { from?: string } | undefined>)
            : null;
        const range = record?.firstStopAppointmentStartDate;
        if (range?.from) return { manifests: [delivered("manifest-live")] };
        return { manifests: [] };
      },
    });
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.some((args) => Array.isArray(args.filters) || JSON.stringify(args).includes('"filters":['))).toBe(
      false,
    );
    expect(fetched.manifests.map((row) => row.manifestId)).toEqual(["manifest-live"]);
    expect(fetched.report?.keptForImport).toBe(1);
    expect(fetched.report?.filterLabel).toBe("schema firstStopAppointmentStartDate");
  });

  it("uses a JSON string array when object filters are tool errors and promotes the delivered row", async () => {
    const fetched = await fetchManifestsFromTools({
      from: "2026-10-05",
      to: "2026-10-07",
      callTool: async (name, args) => {
        if (name !== "core_Manifests_Get") return {};
        expect(typeof args.filters).toBe("string");
        expect(JSON.stringify(args)[11]).toBe('"');
        const parsed = logicalFilters(args.filters);
        const first = Array.isArray(parsed) ? (parsed[0] as { field?: string } | undefined) : undefined;
        if (first?.field === "firstStopAppointmentStartDate") {
          return { manifests: [delivered("manifest-array")] };
        }
        return {
          isError: true,
          content: [{ type: "text", text: "proto: syntax error (line 1:12): unexpected token {" }],
        };
      },
    });
    expect(fetched.manifests.map((row) => row.manifestId)).toEqual(["manifest-array"]);
    expect(fetched.manifests[0]?.status).toBe("STATUS_DELIVERED");
    expect(fetched.report?.keptForImport).toBe(1);
    expect(fetched.report?.filterLabel).toBe("firstStopAppointmentStartDate array");
  });
});
