/**
 * Date filters for core_Manifests_Get.
 *
 * v0.0.0.12 nested first_stop_appointment_start_date under filters because
 * the live error only named rejected top-level keys. The inner field was
 * not in that error. An accepted filter that matches nothing returns an
 * empty list and the import still looks successful.
 */

export type ManifestFilterCandidate = {
  label: string;
  filters: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function propertiesOf(schema: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(schema)?.properties);
}

function enumStrings(schema: unknown): string[] {
  const record = asRecord(schema);
  const values = record?.enum;
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string" && value.trim() !== "");
}

function pickDateKey(keys: string[]): string | null {
  const ranked = [
    /firstStopAppointment/i,
    /first_stop_appointment/i,
    /deliveryDate/i,
    /delivery_date/i,
    /appointment/i,
    /deliver/i,
    /date/i,
  ];
  for (const pattern of ranked) {
    const found = keys.find((key) => pattern.test(key));
    if (found) return found;
  }
  return null;
}

function rangeValue(childSchema: unknown, from: string, to: string): Record<string, string> {
  const keys = Object.keys(propertiesOf(childSchema) ?? {});
  if (keys.includes("gte") || keys.includes("lte")) return { gte: from, lte: to };
  if (keys.includes("start") || keys.includes("end")) return { start: from, end: to };
  return { from, to };
}

/** Best filter from the tool inputSchema, when that schema names a date field. */
export function filtersFromToolSchema(
  schema: unknown,
  from: string,
  to: string,
): ManifestFilterCandidate | null {
  const filtersSchema = propertiesOf(schema)?.filters;
  const filterProps = propertiesOf(filtersSchema);
  if (filterProps) {
    const dateKey = pickDateKey(Object.keys(filterProps));
    if (!dateKey) return null;
    return {
      label: `schema ${dateKey}`,
      filters: { [dateKey]: rangeValue(filterProps[dateKey], from, to) },
    };
  }

  const items = asRecord(asRecord(filtersSchema)?.items);
  const itemProps = propertiesOf(items);
  if (asRecord(filtersSchema)?.type === "array" && itemProps) {
    const dateField =
      pickDateKey(enumStrings(itemProps.field)) ??
      pickDateKey(Object.keys(itemProps)) ??
      "firstStopAppointmentStartDate";
    return {
      label: `schema array ${dateField}`,
      filters: [{ field: dateField, operator: "between", from, to }],
    };
  }
  return null;
}

export function defaultManifestFilters(queryFrom: string, queryTo: string): ManifestFilterCandidate {
  return {
    label: "first_stop_appointment_start_date",
    filters: {
      first_stop_appointment_start_date: { from: queryFrom, to: queryTo },
    },
  };
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

/** Extra shapes to try after the default filter returns no manifests. */
export function manifestFilterProbes(input: {
  queryFrom: string;
  queryTo: string;
  schema?: unknown;
  alreadyTried: unknown;
}): ManifestFilterCandidate[] {
  const probes: ManifestFilterCandidate[] = [];
  const fromSchema = filtersFromToolSchema(input.schema, input.queryFrom, input.queryTo);
  if (fromSchema) probes.push(fromSchema);
  probes.push(
    {
      label: "firstStopAppointmentStartDate",
      filters: {
        firstStopAppointmentStartDate: { from: input.queryFrom, to: input.queryTo },
      },
    },
    {
      label: "firstStopAppointmentStartDate gte/lte",
      filters: {
        firstStopAppointmentStartDate: { gte: input.queryFrom, lte: input.queryTo },
      },
    },
    {
      label: "deliveryDate",
      filters: { deliveryDate: { from: input.queryFrom, to: input.queryTo } },
    },
    { label: "no date filter", filters: {} },
  );

  const seen = new Set<string>([stable(input.alreadyTried)]);
  const unique: ManifestFilterCandidate[] = [];
  for (const probe of probes) {
    const key = stable(probe.filters);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(probe);
  }
  return unique;
}
