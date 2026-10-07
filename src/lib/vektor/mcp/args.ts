/**
 * Working request for core_Manifests_Get.
 * The verified filter field is first_stop_appointment_start_date.
 * Exact envelope is recorded in docs/decisions.md until the first live Test connection confirms it.
 */
export function buildManifestsGetArgs(input: {
  queryFrom: string;
  queryTo: string;
  pageToken?: string;
}): Record<string, unknown> {
  return {
    first_stop_appointment_start_date: {
      from: input.queryFrom,
      to: input.queryTo,
    },
    page_size: 100,
    page_token: input.pageToken ?? "",
  };
}

export function buildOrderDetailsGetArgs(manifestId: string): Record<string, unknown> {
  return { manifest_id: manifestId };
}

export function buildTrucksGetByIdsArgs(ids: string[]): Record<string, unknown> {
  return { ids };
}
