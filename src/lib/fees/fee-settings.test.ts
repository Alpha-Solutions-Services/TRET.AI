import { describe, expect, it } from "vitest";
import { FEE_CSV_HEADER, feeTotalLabel, parseFeeCsv, parseFeeForm, viewFromStored } from "./fee-settings";

describe("fee settings", () => {
  it("stores both percents and shows the total", () => {
    const parsed = parseFeeForm({ legacyFeePct: "10", tolsonLeaseFeePct: "8", effectiveFrom: "2026-10-05" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.legacyFeeBp).toBe(1000);
    expect(parsed.value.tolsonLeaseFeeBp).toBe(800);
    expect(feeTotalLabel("10", "8")).toBe("18");
  });

  it("allows a zero line", () => {
    const parsed = parseFeeForm({ legacyFeePct: "0", tolsonLeaseFeePct: "10", effectiveFrom: "2026-10-05" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.legacyFeeBp).toBe(0);
    expect(parsed.value.tolsonLeaseFeeBp).toBe(1000);
    expect(feeTotalLabel("0", "10")).toBe("10");
  });

  it("reads the template columns", () => {
    const csv = `${FEE_CSV_HEADER}\n4,10,8,2026-10-05\n`;
    const rows = parseFeeCsv(csv, [{ id: "t4", unitNumber: "4" }]);
    expect(rows[0]?.error).toBeNull();
    expect(rows[0]?.form?.legacyFeePct).toBe("10");
    expect(rows[0]?.form?.tolsonLeaseFeePct).toBe("8");
  });

  it("shows the seed when the columns are still empty", () => {
    expect(viewFromStored({ id: "a", unit_number: "3" })).toMatchObject({
      legacyFeePct: "10",
      tolsonLeaseFeePct: "0",
    });
    expect(viewFromStored({ id: "b", unit_number: "6", legacy_fee_bp: 1000, tolson_lease_fee_bp: 800 })).toMatchObject({
      legacyFeePct: "10",
      tolsonLeaseFeePct: "8",
      effectiveFrom: "2026-10-05",
    });
  });
});
