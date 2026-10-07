/**
 * List-tool arguments for Vektor MCP.
 *
 * Live Test connection (v0.0.0.11) rejected top-level
 * first_stop_appointment_start_date, page_size, and page_token.
 * Accepted top-level arguments: aggregationKeys, filters, page, perPage,
 * sortDirection, sortKey.
 *
 * Date ranges stay inside filters. Page is 1-based. perPage stays 100,
 * the previous page size. Sort and aggregation are not sent.
 *
 * v0.0.0.16: `filters` is a JSON string. Compact arguments
 * {"filters":{...}} fail protojson at column 12, the `{` that opens the
 * value (`unexpected token {`). A string field expects `"` there. A raw
 * array is still not sent: the server expands it to filters[0].field.
 */

export const VEKTOR_LIST_PER_PAGE = 100;

export const VEKTOR_LIST_ARGUMENT_NAMES = [
  "aggregationKeys",
  "filters",
  "page",
  "perPage",
  "sortDirection",
  "sortKey",
] as const;

/**
 * Encode the logical filter as the string Vektor's proto decoder accepts.
 * Objects and arrays are JSON.stringify'd once. A string is sent as itself
 * so an empty filter is "" and is not quoted twice.
 */
export function encodeFiltersArgument(filters: unknown): string {
  if (typeof filters === "string") return filters;
  if (filters == null) return "";
  if (typeof filters !== "object") {
    throw new Error("Vektor list filters must be a JSON value encoded as a string.");
  }
  return JSON.stringify(filters);
}

/** Column 12 (1-based) of the compact arguments JSON. A string value puts `"` there. */
export function filtersWireColumn12(args: Record<string, unknown>): string {
  return JSON.stringify(args).charAt(11);
}

export function buildManifestListArgs(
  filters: unknown,
  page: number | undefined,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    filters: encodeFiltersArgument(filters),
    page: page ?? 1,
    perPage: VEKTOR_LIST_PER_PAGE,
  };
  for (const key of Object.keys(args)) {
    if (!VEKTOR_LIST_ARGUMENT_NAMES.includes(key as (typeof VEKTOR_LIST_ARGUMENT_NAMES)[number])) {
      throw new Error(`Vektor list call refused unknown argument ${key}.`);
    }
  }
  return args;
}

export function buildManifestsGetArgs(input: {
  queryFrom: string;
  queryTo: string;
  page?: number;
}): Record<string, unknown> {
  return buildManifestListArgs(
    {
      first_stop_appointment_start_date: {
        from: input.queryFrom,
        to: input.queryTo,
      },
    },
    input.page,
  );
}

export function buildOrderDetailsGetArgs(manifestId: string): Record<string, unknown> {
  return { manifest_id: manifestId };
}

export function buildTrucksGetByIdsArgs(ids: string[]): Record<string, unknown> {
  return { ids };
}

/**
 * Date filter for fuel and toll list tools.
 * Same top-level envelope as manifests. The inner transaction_date field
 * stays the working name until the first live fuel import confirms it.
 */
export function buildTransactionDateArgs(input: {
  from: string;
  to: string;
  page?: number;
}): Record<string, unknown> {
  return buildManifestListArgs(
    {
      transaction_date: {
        from: input.from,
        to: input.to,
      },
    },
    input.page,
  );
}
