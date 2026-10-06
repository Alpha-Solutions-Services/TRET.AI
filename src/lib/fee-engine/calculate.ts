import { applyRateToGrossCents, assertInteger, assertNonNegativeInteger } from "./money";
import type { FeeLineResult, FeeRuleInput, TruckClass } from "./types";

/**
 * Pure fee engine. No database access.
 * Factoring-based fee bases are NOT supported until confirmed (OPEN).
 */
export function calculateFeeLines(input: {
  grossCents: number;
  truckClass: TruckClass;
  rules: FeeRuleInput[];
}): FeeLineResult[] {
  const { grossCents, truckClass, rules } = input;

  assertNonNegativeInteger(grossCents, "grossCents");
  for (const rule of rules) {
    assertInteger(rule.rateBp, `rateBp for ${rule.kind}`);
    assertInteger(rule.basePctBp, `basePctBp for ${rule.kind}`);
    if (rule.rateBp < 0 || rule.rateBp > 10000) {
      throw new Error(
        `rateBp for ${rule.kind} must be between 0 and 10000 (got ${rule.rateBp})`,
      );
    }
    if (rule.basePctBp < 0 || rule.basePctBp > 10000) {
      throw new Error(
        `basePctBp for ${rule.kind} must be between 0 and 10000 (got ${rule.basePctBp})`,
      );
    }
  }

  const kinds = rules.map((r) => r.kind);
  const uniqueKinds = new Set(kinds);
  if (uniqueKinds.size !== kinds.length) {
    throw new Error("Each fee kind may appear at most once per contract");
  }

  validateTruckClassRules(truckClass, rules);

  return rules.map((rule) => ({
    kind: rule.kind,
    amountCents: applyRateToGrossCents(grossCents, rule.basePctBp, rule.rateBp),
    rateBp: rule.rateBp,
    basePctBp: rule.basePctBp,
  }));
}

function validateTruckClassRules(
  truckClass: TruckClass,
  rules: FeeRuleInput[],
): void {
  const byKind = new Map(rules.map((r) => [r.kind, r]));

  if (truckClass === "third_party") {
    const management = byKind.get("MANAGEMENT_FEE");
    if (!management) {
      throw new Error(
        "third_party contracts must include a MANAGEMENT_FEE rule",
      );
    }

    const tolson = byKind.get("TOLSON_PAYABLE");
    const legacy = byKind.get("LEGACY_RETAINED");
    if (!tolson || !legacy) {
      throw new Error(
        "third_party contracts must include TOLSON_PAYABLE and LEGACY_RETAINED",
      );
    }
    if (
      tolson.basePctBp !== management.basePctBp ||
      legacy.basePctBp !== management.basePctBp
    ) {
      throw new Error(
        "TOLSON_PAYABLE and LEGACY_RETAINED must use the same base_pct_bp as MANAGEMENT_FEE",
      );
    }
    if (tolson.rateBp + legacy.rateBp !== management.rateBp) {
      throw new Error(
        `TOLSON_PAYABLE (${tolson.rateBp}) + LEGACY_RETAINED (${legacy.rateBp}) must equal MANAGEMENT_FEE (${management.rateBp})`,
      );
    }
    return;
  }

  // legacy_owned
  if (byKind.has("MANAGEMENT_FEE")) {
    throw new Error("legacy_owned contracts must not include MANAGEMENT_FEE");
  }
  if (byKind.has("LEGACY_RETAINED")) {
    throw new Error("legacy_owned contracts must not include LEGACY_RETAINED");
  }
}
