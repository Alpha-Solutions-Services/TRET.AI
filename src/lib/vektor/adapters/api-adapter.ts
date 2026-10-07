import type {
  AdapterStatus,
  FetchManifestsInput,
  FetchManifestsResult,
  ImportSourceAdapter,
} from "./types";

/**
 * Typed stub for a future paid Vektor REST API.
 * Never called while keys are empty. Not implemented.
 */
export class ApiAdapter implements ImportSourceAdapter {
  readonly id = "api" as const;

  constructor(
    private readonly opts: {
      baseUrl: string;
      token: string;
    } = { baseUrl: "", token: "" },
  ) {}

  status(): AdapterStatus {
    if (!this.opts.baseUrl.trim() || !this.opts.token.trim()) {
      return {
        id: "api",
        label: "Vektor API",
        selectable: false,
        configured: false,
        message:
          "not configured — API is paid / optional. Keys empty; this adapter is never called.",
      };
    }
    return {
      id: "api",
      label: "Vektor API",
      selectable: false,
      configured: false,
      message:
        "not implemented — keys present but REST import is deferred to a later module.",
    };
  }

  async fetchManifests(_input: FetchManifestsInput): Promise<FetchManifestsResult> {
    throw new Error("API adapter is not implemented and must not be called.");
  }
}
