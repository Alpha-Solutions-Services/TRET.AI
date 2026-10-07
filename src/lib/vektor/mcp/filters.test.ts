import { describe, expect, it } from "vitest";
import { manifestFilterProbes, schemaManifestFilters } from "./filters";

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

function assertObjectMap(filters: unknown): void {
  expect(Array.isArray(filters)).toBe(false);
  expect(filters && typeof filters === "object").toBe(true);
  const encoded = JSON.stringify(filters);
  expect(encoded).not.toContain('"field"');
  expect(encoded).not.toContain("[0]");
}

describe("manifest filter probes", () => {
  it("turns a field/from/to array schema into object maps", () => {
    const fromSchema = schemaManifestFilters(ARRAY_SCHEMA, "2026-09-21", "2026-10-14");
    expect(fromSchema.map((probe) => probe.label)).toEqual([
      "schema firstStopAppointmentStartDate",
      "schema deliveryDate",
    ]);
    for (const probe of fromSchema) assertObjectMap(probe.filters);
    expect(fromSchema[0]?.filters).toEqual({
      firstStopAppointmentStartDate: { from: "2026-09-21", to: "2026-10-14" },
    });
  });

  it("never probes with filters[0].field", () => {
    const probes = manifestFilterProbes({
      queryFrom: "2026-09-21",
      queryTo: "2026-10-14",
      schema: ARRAY_SCHEMA,
      alreadyTried: {
        first_stop_appointment_start_date: { from: "2026-09-21", to: "2026-10-14" },
      },
    });
    expect(probes.length).toBeGreaterThan(0);
    for (const probe of probes) assertObjectMap(probe.filters);
    expect(probes.some((probe) => probe.label === "firstStopAppointmentStartDate gte/lte")).toBe(true);
    expect(probes.some((probe) => probe.label === "no date filter")).toBe(true);
    const gte = probes.find((probe) => probe.label === "firstStopAppointmentStartDate gte/lte");
    expect(gte?.filters).toEqual({
      firstStopAppointmentStartDate: { gte: "2026-09-21", lte: "2026-10-14" },
    });
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
