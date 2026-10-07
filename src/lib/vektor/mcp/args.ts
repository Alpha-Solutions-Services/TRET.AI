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
 */

export const VEKTOR_LIST_PER_PAGE = 100;

function listEnvelope(
  filters: Record<string, unknown>,
  page: number | undefined,
): Record<string, unknown> {
  return {
    filters,
    page: page ?? 1,
    perPage: VEKTOR_LIST_PER_PAGE,
  };
}

export function buildManifestsGetArgs(input: {
  queryFrom: string;
  queryTo: string;
  page?: number;
}): Record<string, unknown> {
  return listEnvelope(
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
  return listEnvelope(
    {
      transaction_date: {
        from: input.from,
        to: input.to,
      },
    },
    input.page,
  );
}
