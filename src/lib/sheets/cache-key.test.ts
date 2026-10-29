import { describe, expect, it } from "vitest";
import { sheetCacheKey } from "@/lib/sheets/read";

describe("sheet cache key", () => {
  it("scopes a spreadsheet read by week", () => {
    const id = "sheet-123";
    expect(sheetCacheKey(id, "2026-10-05")).toBe("2026-10-05:sheet-123");
    expect(sheetCacheKey(id, "2026-10-12")).toBe("2026-10-12:sheet-123");
    expect(sheetCacheKey(id, "2026-10-05")).not.toBe(sheetCacheKey(id, "2026-10-12"));
  });
});
