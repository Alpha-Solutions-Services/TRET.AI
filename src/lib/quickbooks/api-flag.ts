/** Intuit API screens stay hidden unless this is exactly true. */
export function quickbooksApiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.QUICKBOOKS_API_ENABLED ?? "").trim().toLowerCase() === "true";
}
