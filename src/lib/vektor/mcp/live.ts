import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import { VEKTOR_MCP_URL, vektorClientMetadata } from "../oauth/flow";
import { NeedsSignInError, safeErrorMessage } from "../oauth/needs-sign-in";
import { MCP_READ_ALLOWLIST, assertMcpToolAllowed } from "./allowlist";
import type { ToolCaller } from "./fetch-manifests";
import { buildManifestsGetArgs } from "./args";
import { withRetry, withTimeout } from "./retry";

function staticProvider(
  accessToken: string,
  clientInformation: OAuthClientInformationMixed | null,
): OAuthClientProvider {
  const redirectUrl = "https://tret.ai.alphasolutions.software/api/vektor/oauth/callback";
  return {
    get redirectUrl() {
      return redirectUrl;
    },
    get clientMetadata() {
      return vektorClientMetadata(redirectUrl);
    },
    clientInformation() {
      return clientInformation ?? undefined;
    },
    tokens() {
      return { access_token: accessToken, token_type: "Bearer" };
    },
    saveTokens() {
      return undefined;
    },
    redirectToAuthorization() {
      throw new NeedsSignInError();
    },
    saveCodeVerifier() {
      return undefined;
    },
    codeVerifier() {
      throw new NeedsSignInError();
    },
  };
}

function asAuthFailure(err: unknown): never {
  const msg = safeErrorMessage(err);
  if (/unauthorized|invalid_grant|needs sign-in|401/i.test(msg)) {
    throw new NeedsSignInError();
  }
  throw new Error(msg);
}

export async function withVektorMcp<T>(opts: {
  accessToken: string;
  clientInformation: OAuthClientInformationMixed | null;
  run: (tools: { callTool: ToolCaller; listToolNames: () => Promise<string[]> }) => Promise<T>;
}): Promise<T> {
  const client = new Client({ name: "tret-ai", version: "0.0.0.5" });
  const transport = new StreamableHTTPClientTransport(new URL(VEKTOR_MCP_URL), {
    authProvider: staticProvider(opts.accessToken, opts.clientInformation),
  });
  try {
    await withTimeout(client.connect(transport));
    const callTool: ToolCaller = async (name, args) => {
      assertMcpToolAllowed(name);
      try {
        return await withRetry(() =>
          withTimeout(client.callTool({ name, arguments: args })),
        );
      } catch (err) {
        asAuthFailure(err);
      }
    };
    const listToolNames = async () => {
      const names: string[] = [];
      let cursor: string | undefined;
      const seen = new Set<string>();
      for (let page = 0; page < 40; page++) {
        let listed: { tools?: Array<{ name: string }>; nextCursor?: string };
        try {
          listed = await withRetry(() =>
            withTimeout(client.listTools(cursor ? { cursor } : undefined)),
          );
        } catch (err) {
          asAuthFailure(err);
        }
        for (const tool of listed.tools ?? []) names.push(tool.name);
        const next = listed.nextCursor;
        if (!next || seen.has(next)) break;
        seen.add(next);
        cursor = next;
      }
      return names;
    };
    return await opts.run({ callTool, listToolNames });
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function probeVektorConnection(tools: {
  callTool: ToolCaller;
  listToolNames: () => Promise<string[]>;
}): Promise<{ toolCount: number }> {
  const names = await tools.listToolNames();
  for (const required of MCP_READ_ALLOWLIST) {
    if (!names.includes(required)) {
      throw new Error(
        `Vektor did not expose required read tool ${required}. On the consent screen, enable read tools and try Test connection again.`,
      );
    }
  }
  const day = new Date().toISOString().slice(0, 10);
  try {
    await tools.callTool(
      "core_Manifests_Get",
      buildManifestsGetArgs({ queryFrom: day, queryTo: day }),
    );
  } catch (err) {
    if (err instanceof NeedsSignInError) throw err;
    const msg = safeErrorMessage(err);
    if (!/invalidargument|invalid argument|required/i.test(msg)) {
      throw new Error(msg);
    }
  }
  return { toolCount: names.length };
}
