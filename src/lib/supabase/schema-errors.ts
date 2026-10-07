/** PostgREST / Postgres signals that a table or function from an unapplied migration is missing. */
export function isMissingSchemaError(error: { code?: string; message: string }): boolean {
  if (error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42P01") {
    return true;
  }
  return /schema cache|does not exist|could not find the/i.test(error.message);
}
