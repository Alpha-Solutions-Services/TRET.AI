import type { FeeRuleKind, TruckClass } from "@/lib/fee-engine";
import { unitDigits } from "@/lib/fees/two-lines";

export const FEE_KIND_LABELS: Record<FeeRuleKind, string> = {
  DRIVER_PAY: "Driver pay",
  MANAGEMENT_FEE: "Management fee",
  DISPATCH_FEE: "Dispatch fee",
  FACTORING_FEE: "Factoring fee",
  TOLSON_PAYABLE: "Tolson lease fee",
  LEGACY_RETAINED: "Legacy fee",
};

/** Third-party and Tolson-owned trucks deduct the management total once. */
export function ownerPaysManagementTotal(truckClass: TruckClass): boolean {
  return truckClass === "third_party" || truckClass === "tolson_owned";
}

export function allowedFeeKindsForClass(truckClass: TruckClass): FeeRuleKind[] {
  if (ownerPaysManagementTotal(truckClass)) {
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
  if (ownerPaysManagementTotal(truckClass)) {
    return ["MANAGEMENT_FEE", "TOLSON_PAYABLE", "LEGACY_RETAINED"];
  }
  return [];
}

export function truckClassLabel(truckClass: TruckClass): string {
  if (truckClass === "tolson_owned") return "Tolson owned";
  return truckClass === "legacy_owned" ? "Legacy-owned" : "Third-party";
}

/**
 * Unit 3 is Tolson's truck. Show that class even before the enum migration is applied
 * and the stored row still says third-party.
 */
export function statementClassLabel(unitNumber: string, truckClass: TruckClass): string {
  if (truckClass === "tolson_owned") return "Tolson owned";
  if (unitDigits(unitNumber) === "3" && truckClass === "third_party") return "Tolson owned";
  return truckClassLabel(truckClass);
}

/** Internal split lines shown under management for third-party calculator. */
export function isInternalSplitKind(
  truckClass: TruckClass,
  kind: FeeRuleKind,
): boolean {
  return (
    ownerPaysManagementTotal(truckClass) &&
    (kind === "TOLSON_PAYABLE" || kind === "LEGACY_RETAINED")
  );
}
