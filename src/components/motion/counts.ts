export type FlowCounts = {
  rowsNew: number;
  duplicate: number;
  flagged: number;
  caption: string;
};

const EMPTY: FlowCounts = {
  rowsNew: 0,
  duplicate: 0,
  flagged: 0,
  caption: "No preview yet.",
};

/** Loads preview on Imports. New will import. A skip that says duplicate is Duplicate. Other skips are Flagged. */
export function loadsPreviewCounts(
  rows: Array<{ action: "import" | "skip"; reason: string | null }> | null,
): FlowCounts {
  if (!rows) return EMPTY;
  let rowsNew = 0;
  let duplicate = 0;
  let flagged = 0;
  for (const row of rows) {
    if (row.action === "import") {
      rowsNew += 1;
      continue;
    }
    if ((row.reason ?? "").toLowerCase().includes("duplicate")) duplicate += 1;
    else flagged += 1;
  }
  return {
    rowsNew,
    duplicate,
    flagged,
    caption: "This loads preview. New will import. Flagged is skipped. Duplicate is a skip that says duplicate.",
  };
}

/** Fuel or toll file preview. The status on each row is already New, Duplicate, or Flagged. */
export function filePreviewCounts(
  rows: Array<{ status: "new" | "duplicate" | "flagged" }> | null,
): FlowCounts {
  if (!rows) return EMPTY;
  return {
    rowsNew: rows.filter((row) => row.status === "new").length,
    duplicate: rows.filter((row) => row.status === "duplicate").length,
    flagged: rows.filter((row) => row.status === "flagged").length,
    caption: "This file preview.",
  };
}
