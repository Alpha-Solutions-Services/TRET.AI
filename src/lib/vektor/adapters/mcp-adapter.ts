import type {
  AdapterStatus,
  FetchManifestsInput,
  FetchManifestsResult,
  ImportSourceAdapter,
} from "./types";

export type McpAdapterOptions = {
  verified: boolean;
  hasTokens: boolean;
  needsSignIn?: boolean;
  fetchManifests?: (input: FetchManifestsInput) => Promise<FetchManifestsResult>;
};

/**
 * Live Vektor MCP path. Selectable only after tokens exist and Test connection
 * has set mcp_verified. Fetch is injected so tests never call the network.
 */
export class McpAdapter implements ImportSourceAdapter {
  readonly id = "mcp" as const;

  constructor(private readonly opts: McpAdapterOptions = { verified: false, hasTokens: false }) {}

  status(): AdapterStatus {
    if (!this.opts.hasTokens || this.opts.needsSignIn) {
      return {
        id: "mcp",
        label: "Vektor MCP",
        selectable: false,
        configured: false,
        message: this.opts.hasTokens
          ? "Needs sign-in. Click Connect Vektor, then Test connection. Import stays unverified until that passes."
          : "Needs sign-in. Click Connect Vektor (unverified until Test connection passes).",
      };
    }
    if (!this.opts.verified) {
      return {
        id: "mcp",
        label: "Vektor MCP",
        selectable: false,
        configured: false,
        message:
          "Connected. Run Test connection before choosing MCP. mcp_verified stays false until that passes.",
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

  async fetchManifests(input: FetchManifestsInput): Promise<FetchManifestsResult> {
    const st = this.status();
    if (!st.selectable) {
      throw new Error("Vektor connection needs sign-in");
    }
    if (!this.opts.fetchManifests) {
      throw new Error("Vektor connection needs sign-in");
    }
    const result = await this.opts.fetchManifests(input);
    if (!result || !Array.isArray(result.manifests)) {
      throw new Error("Vektor connection needs sign-in");
    }
    return result;
  }
}
