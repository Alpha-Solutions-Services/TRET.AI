import { assertIsoDate, assertMonday } from "@/lib/fee-engine";
import { assertCents } from "@/lib/money/cents";
import {
  isChargedTo,
  isFixedExpenseKind,
  type ChargedTo,
  type FixedExpenseKind,
} from "./kinds";

export type FixedExpenseVersion = {
  id: string;
  truckId: string;
  kind: FixedExpenseKind;
  weeklyAmountCents: number;
  chargedTo: ChargedTo;
  /** Inclusive Monday. */
  effectiveFrom: string;
  /** Inclusive end. Null means still open. */
  effectiveTo: string | null;
};

export type FixedExpenseOverride = {
  id: string;
  truckId: string;
  kind: FixedExpenseKind;
  /** Monday that starts the week. */
  weekStart: string;
  amountCents: number;
  chargedTo: ChargedTo;
};

export type ResolvedFixedExpense = {
  amountCents: number;
  chargedTo: ChargedTo;
  source: "override" | "version";
  sourceId: string;
};

function assertKind(value: string, label: string): asserts value is FixedExpenseKind {
  if (!isFixedExpenseKind(value)) {
    throw new Error(`${label} is not a fixed expense kind`);
  }
}

function assertCharge(value: string, label: string): asserts value is ChargedTo {
  if (!isChargedTo(value)) {
    throw new Error(`${label} must be owner or management`);
  }
}

function coversWeek(version: FixedExpenseVersion, weekStart: string): boolean {
  if (version.effectiveFrom > weekStart) return false;
  if (version.effectiveTo !== null && version.effectiveTo < weekStart) return false;
  return true;
}

/**
 * Weekly amount for one truck and kind on the Monday that starts the week.
 * A per-week override replaces the effective-dated version for that week.
 * Throws if the week is not a Monday, if no row covers it, or if two versions overlap.
 */
export function lookupWeeklyFixedExpense(input: {
  versions: FixedExpenseVersion[];
  overrides: FixedExpenseOverride[];
  truckId: string;
  kind: FixedExpenseKind;
  weekStart: string;
}): ResolvedFixedExpense {
  assertMonday(input.weekStart, "Week start");
  assertKind(input.kind, "Kind");

  const overrides = input.overrides.filter(
    (row) => row.truckId === input.truckId && row.kind === input.kind,
  );
  for (const row of overrides) {
    assertMonday(row.weekStart, `override ${row.id} week start`);
    assertCents(row.amountCents, `override ${row.id} amount`);
    assertCharge(row.chargedTo, `override ${row.id} charged to`);
  }

  const versions = input.versions.filter(
    (row) => row.truckId === input.truckId && row.kind === input.kind,
  );
  for (const row of versions) {
    assertMonday(row.effectiveFrom, `expense ${row.id} effective from`);
    if (row.effectiveTo !== null) {
      assertIsoDate(row.effectiveTo, `expense ${row.id} effective to`);
    }
    assertCents(row.weeklyAmountCents, `expense ${row.id} weekly amount`);
    assertCharge(row.chargedTo, `expense ${row.id} charged to`);
    assertKind(row.kind, `expense ${row.id} kind`);
  }

  const override = overrides.find((row) => row.weekStart === input.weekStart);
  if (override) {
    return {
      amountCents: override.amountCents,
      chargedTo: override.chargedTo,
      source: "override",
      sourceId: override.id,
    };
  }

  const matches = versions.filter((row) => coversWeek(row, input.weekStart));
  if (matches.length === 0) {
    throw new Error(`No fixed expense covers week ${input.weekStart}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `More than one fixed expense covers week ${input.weekStart}: ${matches.map((row) => row.id).join(", ")}`,
    );
  }

  const version = matches[0]!;
  return {
    amountCents: version.weeklyAmountCents,
    chargedTo: version.chargedTo,
    source: "version",
    sourceId: version.id,
  };
}
