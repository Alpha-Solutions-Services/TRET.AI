import { describe, expect, it } from "vitest";
import { buildManifestListArgs, filtersWireColumn12 } from "./args";
import { manifestFilterProbes, schemaArrayFilters, schemaManifestFilters } from "./filters";

const ARRAY_SCHEMA = {
  type: "object",
  properties: {
    filters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["firstStopAppointmentStartDate", "status", "deliveryDate"],
          },
          operator: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
        },
      },
    },
  },
};

function assertJsonStringWire(filters: unknown): void {
  const args = buildManifestListArgs(filters, 1);
  expect(typeof args.filters).toBe("string");
  expect(filtersWireColumn12(args)).toBe('"');
  expect(JSON.stringify(args).includes('"filters":{')).toBe(false);
  expect(JSON.stringify(args).includes('"filters":[')).toBe(false);
}

describe("manifest filter probes", () => {
  it("turns a field/from/to array schema into object maps", () => {
    const fromSchema = schemaManifestFilters(ARRAY_SCHEMA, "2026-09-21", "2026-10-14");
    expect(fromSchema.map((probe) => probe.label)).toEqual([
      "schema firstStopAppointmentStartDate",
      "schema deliveryDate",
    ]);
    for (const probe of fromSchema) assertJsonStringWire(probe.filters);
    expect(fromSchema[0]?.filters).toEqual({
      firstStopAppointmentStartDate: { from: "2026-09-21", to: "2026-10-14" },
    });
  });

  it("stringifies array schemas instead of sending filters[0].field", () => {
    const probes = manifestFilterProbes({
      queryFrom: "2026-09-21",
      queryTo: "2026-10-14",
      schema: ARRAY_SCHEMA,
      alreadyTried: {
        first_stop_appointment_start_date: { from: "2026-09-21", to: "2026-10-14" },
      },
    });
    expect(probes.length).toBeGreaterThan(0);
    for (const probe of probes) assertJsonStringWire(probe.filters);
    expect(probes.some((probe) => probe.label === "firstStopAppointmentStartDate gte/lte")).toBe(true);
    expect(probes.some((probe) => probe.label === "no date filter")).toBe(true);
    expect(probes.some((probe) => probe.label === "empty string")).toBe(true);
    const gte = probes.find((probe) => probe.label === "firstStopAppointmentStartDate gte/lte");
    expect(gte?.filters).toEqual({
      firstStopAppointmentStartDate: { gte: "2026-09-21", lte: "2026-10-14" },
    });
    expect(schemaArrayFilters(ARRAY_SCHEMA, "2026-09-21", "2026-10-14")).toEqual([
      {
        label: "schema array firstStopAppointmentStartDate",
        filters: [{ field: "firstStopAppointmentStartDate", from: "2026-09-21", to: "2026-10-14" }],
      },
      {
        label: "schema array deliveryDate",
        filters: [{ field: "deliveryDate", from: "2026-09-21", to: "2026-10-14" }],
      },
    ]);
    const arrayProbe = probes.find((probe) => probe.label === "schema array firstStopAppointmentStartDate");
    expect(JSON.stringify(buildManifestListArgs(arrayProbe?.filters, 1))).toContain('\\"field\\"');
    expect(JSON.stringify(buildManifestListArgs(arrayProbe?.filters, 1))).not.toContain('"filters":[');
  });

  it("uses gte/lte only when the schema date field has those keys and not from/to", () => {
    const probes = schemaManifestFilters(
      {
        type: "object",
        properties: {
          filters: {
            type: "object",
            properties: {
              firstStopAppointmentStartDate: {
                type: "object",
                properties: { gte: { type: "string" }, lte: { type: "string" } },
              },
            },
          },
        },
      },
      "2026-09-21",
      "2026-10-14",
    );
    expect(probes).toEqual([
      {
        label: "schema firstStopAppointmentStartDate",
        filters: {
          firstStopAppointmentStartDate: { gte: "2026-09-21", lte: "2026-10-14" },
        },
      },
    ]);
  });
});
