import type { FeeRuleKind, TruckClass } from "@/lib/fee-engine";

export const FEE_KIND_LABELS: Record<FeeRuleKind, string> = {
  DRIVER_PAY: "Driver pay",
  MANAGEMENT_FEE: "Management fee",
  DISPATCH_FEE: "Dispatch fee",
  FACTORING_FEE: "Factoring fee",
  TOLSON_PAYABLE: "Tolson payable",
  LEGACY_RETAINED: "Legacy retained",
};

export function allowedFeeKindsForClass(truckClass: TruckClass): FeeRuleKind[] {
  if (truckClass === "third_party") {
    return [
      "DRIVER_PAY",
      "MANAGEMENT_FEE",
      "TOLSON_PAYABLE",
      "LEGACY_RETAINED",
      "DISPATCH_FEE",
      "FACTORING_FEE",
    ];
  }
  return ["DRIVER_PAY", "TOLSON_PAYABLE", "DISPATCH_FEE", "FACTORING_FEE"];
}

export function mandatoryFeeKindsForClass(truckClass: TruckClass): FeeRuleKind[] {
  if (truckClass === "third_party") {
    return ["MANAGEMENT_FEE", "TOLSON_PAYABLE", "LEGACY_RETAINED"];
  }
  return [];
}

export function truckClassLabel(truckClass: TruckClass): string {
  return truckClass === "legacy_owned" ? "Legacy-owned" : "Third-party";
}

/** Internal split lines shown under management for third-party calculator. */
export function isInternalSplitKind(
  truckClass: TruckClass,
  kind: FeeRuleKind,
): boolean {
  return (
    truckClass === "third_party" &&
    (kind === "TOLSON_PAYABLE" || kind === "LEGACY_RETAINED")
  );
}
