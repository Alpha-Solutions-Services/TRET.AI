export type PresentedIssue = {
  headline: string;
  detail: string;
};

const RULE_LABELS: Record<string, string> = {
  import_error: "Import",
  vektor_auth: "Sign-in",
  promote_failed: "Could not save",
  unlinked_fuel: "Fuel not linked",
  unlinked_fuel_week_close: "Fuel not linked",
  missing_fee_contract: "Missing fee setup",
  delivery_week_mismatch: "Delivery week",
  row_count_drop: "Fewer rows than last time",
  sheet_load_missing: "Sheet load missing from loads",
  sheet_rate_diff: "Sheet rate differs",
  truck_unmatched: "Truck not matched",
};

/** Short label under the headline. Unknown rule codes stay out of the cell. */
export function issueRuleLabel(rule: string): string | null {
  return RULE_LABELS[rule] ?? null;
}

/**
 * Headline is plain English. Detail is the stored cause, copied on click.
 * A proto or JSON dump never becomes the headline.
 */
export function presentIssue(message: string, rule?: string | null): PresentedIssue {
  const detail = message.replace(/\s+/g, " ").trim();
  if (!detail) {
    return { headline: "Something went wrong.", detail: "Something went wrong." };
  }
  if (/no loads, fuel, tolls, or fixed expenses to close/i.test(detail)) {
    return { headline: "This week has nothing to close yet.", detail };
  }
  if (looksTechnical(detail)) {
    return { headline: headlineForTechnical(detail, rule), detail };
  }
  return { headline: firstPlainSentence(detail), detail };
}

function looksTechnical(text: string): boolean {
  if (/proto:|unexpected token|syntax error|DECODER|PGRST|error:\d|stack trace|filters\[/i.test(text)) {
    return true;
  }
  return text.includes("{") && text.includes("}") && text.length > 80;
}

function headlineForTechnical(text: string, rule?: string | null): string {
  if (/sign-in|unauthorized|unverified/i.test(text) || rule === "vektor_auth") {
    return "Vektor needs sign-in.";
  }
  if (/unexpected token|proto:|syntax error|filter/i.test(text)) {
    return "Vektor import failed. Date filters are wrong.";
  }
  if (rule === "promote_failed") return "A load could not be saved.";
  if (/vektor/i.test(text) || rule === "import_error") return "Vektor import failed.";
  return "Something went wrong. Copy the details.";
}

function firstPlainSentence(text: string): string {
  const sentence = text.split(/(?<=\.)\s/)[0] ?? text;
  if (sentence.length <= 160) return sentence;
  return `${sentence.slice(0, 157).trimEnd()}.`;
}
