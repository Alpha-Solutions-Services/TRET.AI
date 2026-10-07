/**
 * Date filters for core_Manifests_Get.
 *
 * v0.0.0.12 nested first_stop_appointment_start_date under filters because
 * the live error only named rejected top-level keys. That object map is
 * accepted: an empty list, not an argument error.
 *
 * v0.0.0.14 added a fallback that sent filters as an array of
 * { field, from, to }. Live import then failed with MCP -32602 unknown
 * arguments filters[0].field, filters[0].from, and filters[0].to.
 * Accepted top-level arguments are still only aggregationKeys, filters,
 * page, perPage, sortDirection, and sortKey.
 *
 * Every probe is an object map under filters. A schema that describes
 * filters as an array is read only to pick the date field name.
 */

export type ManifestFilterCandidate = {
  label: string;
  filters: Record<string, unknown>;
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

/** Object-map filters named by the tool inputSchema. Never an array. */
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
  ];

  const seen = new Set<string>([stable(input.alreadyTried)]);
  const unique: ManifestFilterCandidate[] = [];
  for (const probe of probes) {
    if (Array.isArray(probe.filters)) continue;
    const key = stable(probe.filters);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(probe);
  }
  return unique;
}
