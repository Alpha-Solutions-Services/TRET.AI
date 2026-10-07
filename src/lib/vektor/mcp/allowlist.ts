/**
 * Read-only Vektor MCP tools this app may call. Anything else throws.
 * Fuel and toll names are a working assumption until tools/list confirms them.
 * Test connection still requires only the load tools that are already verified.
 */
export const MCP_CONNECTION_TOOLS = [
  "core_Manifests_Get",
  "core_Manifests_OrderDetailsGet",
  "fleet_Trucks_GetByIDs",
] as const;

export const MCP_FUEL_LIST_TOOL = "fuel_Transactions_Get";
export const MCP_FUEL_AGGREGATE_TOOL = "fuel_Transactions_AggregateGet";
export const MCP_TOLLS_LIST_TOOL = "core_Tolls_Get";
export const MCP_TOLLS_STATS_TOOL = "core_Tolls_StatsGet";

export const MCP_FUEL_TOLL_TOOLS = [
  MCP_FUEL_LIST_TOOL,
  MCP_FUEL_AGGREGATE_TOOL,
  MCP_TOLLS_LIST_TOOL,
  MCP_TOLLS_STATS_TOOL,
] as const;

export const MCP_READ_ALLOWLIST = [
  ...MCP_CONNECTION_TOOLS,
  ...MCP_FUEL_TOLL_TOOLS,
] as const;

export type AllowlistedTool = (typeof MCP_READ_ALLOWLIST)[number];

const ALLOWED = new Set<string>(MCP_READ_ALLOWLIST);

export function assertMcpToolAllowed(name: string): void {
  if (!ALLOWED.has(name)) {
    throw new Error(`MCP tool is not allowlisted: ${name}`);
  }
}
