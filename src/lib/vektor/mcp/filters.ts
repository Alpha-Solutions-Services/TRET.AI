/**
 * Date filters for core_Manifests_Get.
 *
 * v0.0.0.12 nested first_stop_appointment_start_date under filters because
 * the live error only named rejected top-level keys. That object map came
 * back as an empty list, not an argument error.
 *
 * v0.0.0.14 sent filters as an array of { field, from, to }. Live import
 * failed with MCP -32602 unknown arguments filters[0].field, filters[0].from,
 * and filters[0].to. Accepted top-level arguments are still only
 * aggregationKeys, filters, page, perPage, sortDirection, and sortKey.
 *
 * v0.0.0.15 kept object maps, including {}. Live import then failed every
 * probe with proto: syntax error (line 1:12): unexpected token {. Column 12
 * of {"filters": is the `{` that opens a nested object. The proto field does
 * not accept an object, so the wire value is a JSON string (see args.ts).
 * These candidates are the logical values. The list call stringifies them.
 * A schema that describes an array contributes a stringified array as well
 * as an object map built from the date field name.
 */

export type ManifestFilterCandidate = {
  label: string;
  /** Logical filter. The list call JSON-encodes this into the filters string. */
  filters: unknown;
};

const DATE_KEY_RANK = [
  /firstStopAppointment/i,
  /first_stop_appointment/i,
  /deliveryDate/i,
  /delivery_date/i,
  /appointment/i,
  /deliver/i,
  /pickup/i,
  /date/i,
];

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

function dateKeys(keys: string[]): string[] {
  const picked: string[] = [];
  for (const pattern of DATE_KEY_RANK) {
    for (const key of keys) {
      if (!pattern.test(key) || picked.includes(key)) continue;
      picked.push(key);
    }
  }
  return picked;
}

/**
 * Range object nested under a date field.
 * from/to is the shape that already returned a successful empty list.
 * gte/lte or start/end is used only when the schema names those keys and
 * does not name from/to.
 */
function rangeValue(childSchema: unknown, from: string, to: string): Record<string, string> {
  const keys = Object.keys(propertiesOf(childSchema) ?? {});
  const hasFromTo = keys.includes("from") || keys.includes("to");
  if (!hasFromTo && (keys.includes("gte") || keys.includes("lte"))) return { gte: from, lte: to };
  if (!hasFromTo && (keys.includes("start") || keys.includes("end"))) return { start: from, end: to };
  return { from, to };
}

function schemaBranches(schema: unknown): unknown[] {
  const record = asRecord(schema);
  if (!record) return [];
  const branches: unknown[] = [schema];
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) branches.push(...schemaBranches(item));
  }
  return branches;
}

function objectMap(dateKey: string, childSchema: unknown, from: string, to: string): Record<string, unknown> {
  return { [dateKey]: rangeValue(childSchema, from, to) };
}

/** JSON Schema type of the filters argument, when tools/list provided one. */
export function filtersSchemaType(schema: unknown): string | null {
  const record = asRecord(propertiesOf(schema)?.filters);
  const type = record?.type;
  if (typeof type === "string" && type.trim()) return type;
  if (!Array.isArray(type)) return null;
  const names = type.filter((value): value is string => typeof value === "string" && value.trim() !== "");
  return names.length > 0 ? names.join("|") : null;
}

/** Object-map filters named by the tool inputSchema. */
export function schemaManifestFilters(
  schema: unknown,
  from: string,
  to: string,
): ManifestFilterCandidate[] {
  const filtersSchema = propertiesOf(schema)?.filters;
  const probes: ManifestFilterCandidate[] = [];
  const seen = new Set<string>();
  const push = (label: string, filters: Record<string, unknown>) => {
    const key = JSON.stringify(filters);
    if (seen.has(key)) return;
    seen.add(key);
    probes.push({ label, filters });
  };

  for (const branch of schemaBranches(filtersSchema)) {
    const filterProps = propertiesOf(branch);
    if (filterProps) {
      for (const dateKey of dateKeys(Object.keys(filterProps))) {
        push(`schema ${dateKey}`, objectMap(dateKey, filterProps[dateKey], from, to));
      }
      continue;
    }

    const branchRecord = asRecord(branch);
    const items = asRecord(branchRecord?.items);
    const itemProps = propertiesOf(items);
    if (branchRecord?.type !== "array" || !itemProps) continue;
    const names = dateKeys([
      ...enumStrings(itemProps.field),
      ...enumStrings(itemProps.key),
      ...enumStrings(itemProps.name),
    ]);
    for (const dateKey of names) {
      push(`schema ${dateKey}`, objectMap(dateKey, items, from, to));
    }
  }

  return probes;
}

/**
 * Array body described by an array schema. Sent only as a JSON string, never
 * as a raw array (that becomes filters[0].field).
 */
export function schemaArrayFilters(
  schema: unknown,
  from: string,
  to: string,
): ManifestFilterCandidate[] {
  const filtersSchema = propertiesOf(schema)?.filters;
  const probes: ManifestFilterCandidate[] = [];
  const seen = new Set<string>();
  for (const branch of schemaBranches(filtersSchema)) {
    const branchRecord = asRecord(branch);
    const items = asRecord(branchRecord?.items);
    const itemProps = propertiesOf(items);
    if (branchRecord?.type !== "array" || !itemProps) continue;
    const names = dateKeys([
      ...enumStrings(itemProps.field),
      ...enumStrings(itemProps.key),
      ...enumStrings(itemProps.name),
    ]);
    for (const dateKey of names) {
      const filters = [{ field: dateKey, from, to }];
      const key = JSON.stringify(filters);
      if (seen.has(key)) continue;
      seen.add(key);
      probes.push({ label: `schema array ${dateKey}`, filters });
    }
  }
  return probes;
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

/** Extra object-map shapes to try after the default filter returns no manifests. */
export function manifestFilterProbes(input: {
  queryFrom: string;
  queryTo: string;
  schema?: unknown;
  alreadyTried: unknown;
}): ManifestFilterCandidate[] {
  const probes: ManifestFilterCandidate[] = [
    ...schemaManifestFilters(input.schema, input.queryFrom, input.queryTo),
    ...schemaArrayFilters(input.schema, input.queryFrom, input.queryTo),
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
    {
      label: "firstStopAppointmentStartDate array",
      filters: [
        {
          field: "firstStopAppointmentStartDate",
          from: input.queryFrom,
          to: input.queryTo,
        },
      ],
    },
    { label: "no date filter", filters: {} },
    { label: "empty string", filters: "" },
  ];

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
