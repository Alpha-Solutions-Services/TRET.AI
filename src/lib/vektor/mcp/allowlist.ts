/** Read-only Vektor MCP tools this app may call. Anything else throws. */
export const MCP_READ_ALLOWLIST = [
  "core_Manifests_Get",
  "core_Manifests_OrderDetailsGet",
  "fleet_Trucks_GetByIDs",
] as const;

export type AllowlistedTool = (typeof MCP_READ_ALLOWLIST)[number];

const ALLOWED = new Set<string>(MCP_READ_ALLOWLIST);

export function assertMcpToolAllowed(name: string): void {
  if (!ALLOWED.has(name)) {
    throw new Error(`MCP tool is not allowlisted: ${name}`);
  }
}
