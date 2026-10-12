import { describe, expect, it } from "vitest";
import { staleIssueIds, type StaleIssue } from "./stale";

function issue(partial: Partial<StaleIssue> & Pick<StaleIssue, "id">): StaleIssue {
  return {
    rule: "row_count_drop",
    ref: "fuel",
    status: "open",
    createdAt: "2026-10-11T00:00:00Z",
    importRunId: "run-new",
    kind: "fuel",
    runFinishedAt: "2026-10-11T00:00:00Z",
    ...partial,
  };
}

describe("stale import issues", () => {
  it("resolves issues from an older run of the same kind and keeps the latest", () => {
    const ids = staleIssueIds([
      issue({ id: "old", importRunId: "run-old", runFinishedAt: "2026-10-01T00:00:00Z", createdAt: "2026-10-01T00:00:00Z" }),
      issue({ id: "new", importRunId: "run-new", runFinishedAt: "2026-10-11T00:00:00Z" }),
    ]);
    expect(ids).toEqual(["old"]);
  });

  it("resolves an older copy of the same rule and ref, including a row with no run", () => {
    const ids = staleIssueIds([
      issue({
        id: "older",
        importRunId: null,
        kind: null,
        runFinishedAt: null,
        createdAt: "2026-10-01T00:00:00Z",
        rule: "unlinked_fuel",
        ref: "T2",
      }),
      issue({
        id: "newer",
        importRunId: null,
        kind: null,
        runFinishedAt: null,
        createdAt: "2026-10-11T00:00:00Z",
        rule: "unlinked_fuel",
        ref: "T2",
      }),
    ]);
    expect(ids).toEqual(["older"]);
  });

  it("leaves a resolved row and a different ref alone", () => {
    const ids = staleIssueIds([
      issue({ id: "done", status: "resolved", importRunId: "run-old", runFinishedAt: "2026-10-01T00:00:00Z" }),
      issue({ id: "other", ref: "tolls" }),
    ]);
    expect(ids).toEqual([]);
  });
});
