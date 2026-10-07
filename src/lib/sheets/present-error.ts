/** Shown when OpenSSL cannot read the service account private key. */
export const PRIVATE_KEY_FORMAT_HEADLINE = "Google private key on the server is the wrong format";

const DECODER = /DECODER routines|1E08010C|routines::unsupported/i;

export function presentCopyableError(
  headline: string,
  detail?: string | null,
): { headline: string; detail: string } {
  const cleanHeadline = headline.replace(/\s+/g, " ").trim();
  const cleanDetail = (detail ?? "").replace(/\s+/g, " ").trim();
  if (DECODER.test(cleanHeadline) || DECODER.test(cleanDetail)) {
    return {
      headline: PRIVATE_KEY_FORMAT_HEADLINE,
      detail: cleanDetail || cleanHeadline,
    };
  }
  if (cleanDetail && cleanDetail !== cleanHeadline) {
    return { headline: cleanHeadline, detail: cleanDetail };
  }
  return { headline: cleanHeadline || "Something went wrong.", detail: cleanDetail || cleanHeadline };
}

/** Text copied when the operator clicks the error or Copy. */
export function copyableErrorText(headline: string, detail?: string | null): string {
  return presentCopyableError(headline, detail).detail;
}
