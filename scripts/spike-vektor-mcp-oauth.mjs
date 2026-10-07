/**
 * Spike v2 — Vektor MCP OAuth via MCP SDK authProvider
 * (authorization code + PKCE + dynamic client registration).
 *
 * Tokens → gitignored .vektor-mcp-tokens.json only. Never printed.
 * Usage: node scripts/spike-vektor-mcp-oauth.mjs
 * Callback: http://127.0.0.1:8787/callback
 */
import { createServer } from "node:http";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  UnauthorizedError,
  discoverOAuthProtectedResourceMetadata,
  discoverAuthorizationServerMetadata,
  refreshAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";

const MCP_URL = "https://mcp.vektortms.com/mcp";
const REDIRECT = "http://127.0.0.1:8787/callback";
const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = resolve(__dirname, "..", ".vektor-mcp-tokens.json");
const REPORT_PATH = resolve(__dirname, "..", ".vektor-mcp-spike-report.json");

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

function loadStore() {
  if (!existsSync(TOKEN_PATH)) return {};
  return JSON.parse(readFileSync(TOKEN_PATH, "utf8"));
}

function saveStore(store) {
  writeFileSync(
    TOKEN_PATH,
    JSON.stringify({ ...store, savedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
}

function waitForCallback() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      try {
        const u = new URL(req.url ?? "/", REDIRECT);
        if (u.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const code = u.searchParams.get("code");
        const error = u.searchParams.get("error");
        const errorDesc = u.searchParams.get("error_description");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><p>Sign-in complete. Close this window and return to the terminal.</p></body></html>",
        );
        server.close();
        if (error) {
          reject(
            new Error(
              `OAuth error: ${error}${errorDesc ? ` — ${errorDesc}` : ""}`,
            ),
          );
        } else if (!code) {
          reject(new Error("No authorization code in callback"));
        } else {
          resolvePromise(code);
        }
      } catch (e) {
        reject(e);
      }
    });
    server.listen(8787, "127.0.0.1", () => {
      console.log("Waiting for OAuth callback on", REDIRECT);
    });
  });
}

/** File-backed OAuthClientProvider for the MCP SDK transport. */
function createFileProvider({ onRedirect }) {
  const store = loadStore();
  return {
    get redirectUrl() {
      return REDIRECT;
    },
    get clientMetadata() {
      return {
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_name: "TRET.AI spike v2",
        scope: "read",
      };
    },
    clientInformation() {
      return store.clientInformation;
    },
    saveClientInformation(info) {
      store.clientInformation = info;
      saveStore(store);
    },
    tokens() {
      return store.tokens;
    },
    saveTokens(tokens) {
      store.tokens = tokens;
      saveStore(store);
    },
    redirectToAuthorization(authorizationUrl) {
      onRedirect(authorizationUrl.toString());
    },
    saveCodeVerifier(codeVerifier) {
      store.codeVerifier = codeVerifier;
      saveStore(store);
    },
    codeVerifier() {
      if (!store.codeVerifier) throw new Error("Missing PKCE code_verifier");
      return store.codeVerifier;
    },
    _store: store,
  };
}

async function connectAndListTools(provider) {
  const client = new Client({ name: "tret-ai-spike-v2", version: "0.0.0.4" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    authProvider: provider,
  });
  await client.connect(transport);
  const listed = await client.listTools();
  await client.close();
  return listed.tools ?? [];
}

async function callReadTool(provider, toolName, args = {}) {
  const client = new Client({ name: "tret-ai-spike-v2", version: "0.0.0.4" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    authProvider: provider,
  });
  await client.connect(transport);
  const result = await client.callTool({ name: toolName, arguments: args });
  await client.close();
  return result;
}

async function main() {
  const report = {
    discovery: "FAIL",
    login: "FAIL",
    toolsList: "FAIL",
    readCall: "FAIL",
    refresh1: "FAIL",
    refresh2: "FAIL",
    tokenLifetime: "OPEN",
    refreshTokenIssued: false,
    registrationEndpoint: null,
    grantTypes: [],
    scopes: [],
    tokenEndpointAuthMethods: [],
    toolNames: [],
    notes: [],
  };

  try {
    // --- Discovery (no login) ---
    const resource = await discoverOAuthProtectedResourceMetadata(MCP_URL);
    const asUrl =
      resource.authorization_servers?.[0] ?? "https://mcp.vektortms.com";
    const meta = await discoverAuthorizationServerMetadata(asUrl);
    if (!meta) throw new Error("AS metadata discovery returned undefined");

    report.discovery = "PASS";
    report.registrationEndpoint = meta.registration_endpoint ?? null;
    report.grantTypes = meta.grant_types_supported ?? [];
    report.scopes = meta.scopes_supported ?? [];
    report.tokenEndpointAuthMethods =
      meta.token_endpoint_auth_methods_supported ?? [];
    report.notes.push(
      `resource=${resource.resource}; AS=${asUrl}; DCR=${Boolean(meta.registration_endpoint)}; refresh_token grant=${report.grantTypes.includes("refresh_token")}; offline scope=${report.scopes.some((s) => /offline/i.test(s))}`,
    );

    if (!report.grantTypes.includes("refresh_token")) {
      report.notes.push(
        "STOP: refresh_token not in grant_types_supported — no workaround.",
      );
      writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }

    let pendingAuthUrl = null;
    const provider = createFileProvider({
      onRedirect: (url) => {
        pendingAuthUrl = url;
      },
    });

    // --- Login (browser) if no tokens ---
    const existing = provider.tokens();
    if (!existing?.access_token && !existing?.refresh_token) {
      const callbackPromise = waitForCallback();
      try {
        await connectAndListTools(provider);
      } catch (e) {
        if (!(e instanceof UnauthorizedError) && !pendingAuthUrl) throw e;
      }
      if (!pendingAuthUrl) {
        throw new Error("Expected redirectToAuthorization; none fired");
      }
      console.log("Opening browser for Vektor sign-in...");
      openBrowser(pendingAuthUrl);

      const code = await callbackPromise;
      const finishTransport = new StreamableHTTPClientTransport(
        new URL(MCP_URL),
        { authProvider: provider },
      );
      await finishTransport.finishAuth(code);
      await finishTransport.close();
      report.login = "PASS";
    } else {
      report.login = "PASS";
      report.notes.push("Reused tokens from .vektor-mcp-tokens.json");
    }

    const tokensAfterLogin = provider.tokens();
    report.refreshTokenIssued = Boolean(tokensAfterLogin?.refresh_token);
    report.tokenLifetime =
      tokensAfterLogin?.expires_in != null
        ? `${tokensAfterLogin.expires_in} seconds (expires_in from token response)`
        : "OPEN — expires_in not present on stored token object";

    if (!tokensAfterLogin?.refresh_token) {
      report.notes.push("STOP: no refresh_token issued — no workaround.");
      writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }

    // --- tools/list ---
    const tools = await connectAndListTools(provider);
    report.toolNames = tools.map((t) => t.name);
    report.toolsList = tools.length > 0 ? "PASS" : "FAIL";
    if (tools.length === 0) {
      report.notes.push(
        "tools/list empty after login. On the Vektor consent screen, enable the read tools this client may use, then re-run. Cursor IDE '0 tools' is a different client and is irrelevant.",
      );
    }

    // --- read call (Get/Ping only) ---
    const readTool = tools.find(
      (t) =>
        /Users_Ping$/i.test(t.name) ||
        /Manifests_Get$/i.test(t.name) ||
        /Orders_Get$/i.test(t.name) ||
        /_Get$|_Ping$/i.test(t.name),
    );
    if (readTool) {
      try {
        // Prefer empty args; many Get tools require filters — capture exact error if so.
        await callReadTool(provider, readTool.name, {});
        report.readCall = "PASS";
        report.notes.push(`read tool: ${readTool.name}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // InvalidArgument for missing filters still proves auth + tool invoke.
        if (/InvalidArgument|required/i.test(msg)) {
          report.readCall = "PASS";
          report.notes.push(
            `read tool invoked (${readTool.name}) — server validation: ${msg}`,
          );
        } else {
          report.readCall = "FAIL";
          report.notes.push(`read call FAIL (${readTool.name}): ${msg}`);
        }
      }
    } else if (tools.length > 0) {
      report.notes.push("No *_Get / *_Ping tool found among listed names");
    }

    // --- Force expiry + refresh ×2 (discard access_token, keep refresh_token) ---
    for (let i = 1; i <= 2; i++) {
      const before = provider.tokens();
      if (!before?.refresh_token) {
        report[`refresh${i}`] = "FAIL";
        report.notes.push(`STOP: refresh #${i} — no refresh_token`);
        break;
      }
      provider.saveTokens({
        ...before,
        access_token: "expired-invalid-token-force-refresh",
        expires_in: 0,
      });

      // Explicit refreshAuthorization (proves refresh without human)
      const refreshed = await refreshAuthorization(asUrl, {
        metadata: meta,
        clientInformation: provider.clientInformation(),
        refreshToken: before.refresh_token,
        resource: resource.resource,
      });
      if (!refreshed.access_token) {
        report[`refresh${i}`] = "FAIL";
        report.notes.push(`STOP: refresh #${i} returned no access_token`);
        break;
      }
      provider.saveTokens({
        ...refreshed,
        refresh_token: refreshed.refresh_token ?? before.refresh_token,
      });

      // Prove new access token works (tools/list)
      const after = await connectAndListTools(provider);
      report[`refresh${i}`] = Array.isArray(after) ? "PASS" : "FAIL";
      report.notes.push(`refresh #${i}: tools/list returned ${after.length} tools`);
    }

    if (report.refresh1 === "FAIL" || report.refresh2 === "FAIL") {
      report.notes.push("STOP: refresh failed — no workaround.");
      writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }
  } catch (err) {
    report.notes.push(err instanceof Error ? err.message : String(err));
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const ok =
    report.discovery === "PASS" &&
    report.login === "PASS" &&
    report.toolsList === "PASS" &&
    report.refresh1 === "PASS" &&
    report.refresh2 === "PASS";
  process.exit(ok ? 0 : 2);
}

main();
