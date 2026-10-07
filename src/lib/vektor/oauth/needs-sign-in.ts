export class NeedsSignInError extends Error {
  constructor() {
    super("Vektor connection needs sign-in");
    this.name = "NeedsSignInError";
  }
}

/** Strip credential-shaped fragments before any message is shown or stored. */
export function safeErrorMessage(err: unknown): string {
  const raw = err instanceof NeedsSignInError
    ? err.message
    : err instanceof Error
      ? err.message
      : "Vektor request failed";
  return raw
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(access_token|refresh_token|code_verifier|authorization_code)(["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, "$1$2[redacted]")
    .slice(0, 400);
}
