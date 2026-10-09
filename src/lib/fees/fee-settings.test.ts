import { describe, expect, it } from "vitest";
import { parseFeeCsv, parseFeeForm, FEE_CSV_HEADER } from "./fee-settings";

describe("fee settings", () => {
  it("keeps an owner truck at 10 percent with the split not set", () => {
    const parsed = parseFeeForm({
      feeModel: "owner_management",
      managementFeePct: "",
      tolsonPayablePct: "",
      tolsonFixedWeekly: "",
      legacyRetainedPct: "",
      legacyFixedWeekly: "",
      effectiveFrom: "",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.truckClass).toBe("third_party");
    expect(parsed.value.managementFeeBp).toBeNull();
    expect(parsed.value.tolsonPayableType).toBeNull();
    expect(parsed.value.legacyRetainedType).toBeNull();
  });

  it("requires the split to add up to the fee", () => {
    const bad = parseFeeForm({
      feeModel: "Owner truck, management fee",
      managementFeePct: "10",
      tolsonPayablePct: "6",
      tolsonFixedWeekly: "",
      legacyRetainedPct: "5",
      legacyFixedWeekly: "",
      effectiveFrom: "2026-10-05",
    });
    expect(bad.ok).toBe(false);
    const good = parseFeeForm({
      feeModel: "owner_management",
      managementFeePct: "10",
      tolsonPayablePct: "6",
      tolsonFixedWeekly: "",
      legacyRetainedPct: "4",
      legacyFixedWeekly: "",
      effectiveFrom: "2026-10-05",
    });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.value.tolsonPayableValue).toBe(600);
    expect(good.value.legacyRetainedValue).toBe(400);
  });

  it("stores a lease truck as a Tolson lease fee", () => {
    const parsed = parseFeeForm({
      feeModel: "lease_to_tolson",
      managementFeePct: "",
      tolsonPayablePct: "",
      tolsonFixedWeekly: "",
      legacyRetainedPct: "",
      legacyFixedWeekly: "",
      effectiveFrom: "",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.truckClass).toBe("legacy_owned");
    expect(parsed.value.tolsonPayableType).toBeNull();
    expect(parsed.value.managementFeeBp).toBeNull();
  });

  it("reads the template columns", () => {
    const csv = `${FEE_CSV_HEADER}\n03,owner_management,10,,,,,\n`;
    const rows = parseFeeCsv(csv, [{ id: "t3", unitNumber: "03" }]);
    expect(rows[0]?.error).toBeNull();
    expect(rows[0]?.truckId).toBe("t3");
  });
});
