/**
 * SPIKE ONLY — prove Vektor MCP connect + tools/list unattended.
 * Does not print tokens. Run: node --experimental-strip-types OR npx tsx scripts/spike-vektor-mcp.mjs
 *
 * Expected outcomes reported to owner:
 * - connect + read OK?
 * - token refresh after expiry without human?
 * - token/refresh lifetime?
 * - exact tool and parameter names?
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = "https://mcp.vektortms.com/mcp";

async function main() {
  const report = {
    connectOk: false,
    toolsListOk: false,
    toolNames: [],
    error: null,
    refreshVerified: false,
    refreshLifetime: "OPEN — not observed",
    accessTokenLifetime: "OPEN — not observed",
    note: "",
  };

  try {
    const client = new Client({ name: "tret-ai-spike", version: "0.0.0.4" });
    // No authProvider: if server requires OAuth, we get Unauthorized and cannot refresh.
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    await client.connect(transport);
    report.connectOk = true;

    const listed = await client.listTools();
    report.toolsListOk = true;
    report.toolNames = (listed.tools ?? []).map((t) => t.name);
    report.note =
      report.toolNames.length === 0
        ? "Connected but tools/list returned zero tools (same as Cursor: 0 tools enabled)."
        : `Listed ${report.toolNames.length} tools.`;
    await client.close();
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    report.note =
      "Without a stored OAuthClientProvider + refresh_token, unattended refresh cannot be proven. " +
      "Cursor Vektor connection authenticates but exposes 0 tools — read spike blocked.";
  }

  // Never log secrets — only the report object (no tokens).
  console.log(JSON.stringify(report, null, 2));
  if (!report.connectOk || !report.toolsListOk || report.toolNames.length === 0) {
    process.exitCode = 2;
  }
}

main();
