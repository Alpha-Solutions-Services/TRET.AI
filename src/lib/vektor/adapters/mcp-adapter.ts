import type {
  AdapterStatus,
  FetchManifestsInput,
  FetchManifestsResult,
  ImportSourceAdapter,
} from "./types";

/**
 * PRIMARY import path when verified. Flagged unverified until OAuth spike passes
 * (refresh_token proven). Cannot be selected as default until then.
 */
export class McpAdapter implements ImportSourceAdapter {
  readonly id = "mcp" as const;

  constructor(
    private readonly opts: {
      verified: boolean;
      hasTokens: boolean;
    } = { verified: false, hasTokens: false },
  ) {}

  status(): AdapterStatus {
    if (!this.opts.hasTokens) {
      return {
        id: "mcp",
        label: "Vektor MCP",
        selectable: false,
        configured: false,
        message:
          "unverified — connect Vektor once in the app (OAuth). Local spike proved refresh; app sign-in not wired yet.",
      };
    }
    if (!this.opts.verified) {
      return {
        id: "mcp",
        label: "Vektor MCP",
        selectable: false,
        configured: false,
        message:
          "unverified — tokens present but mcp_verified is not true yet. Set after app OAuth is wired.",
      };
    }
    return {
      id: "mcp",
      label: "Vektor MCP",
      selectable: true,
      configured: true,
      message: "Ready (read-only MCP tools).",
    };
  }

  async fetchManifests(_input: FetchManifestsInput): Promise<FetchManifestsResult> {
    const st = this.status();
    if (!st.selectable) {
      throw new Error(
        "Vektor connection needs sign-in (MCP unverified or not connected).",
      );
    }
    // Live tool names/params OPEN until spike tools/list succeeds.
    throw new Error(
      "MCP fetch not enabled until spike lists exact tool names (OPEN).",
    );
  }
}
