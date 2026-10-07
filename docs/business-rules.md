# Business rules

## DECIDED

- Reporting week runs Monday to Sunday (taken from the sample report). Week helper: for any date, Monday is the start and Sunday is the end (example: week of 2026-09-21 ends 2026-09-27).
- Loads, fuel and tolls come from Vektor. v0.0.0.5 connects loads through Vektor MCP after the owner signs in once. v0.0.0.7 imports fuel and tolls through staging. v0.0.0.8 builds the weekly statement and can lock the week. v0.0.0.9 renders that statement as a PDF.
- Fuel is booked at the discounted amount (integer cents). Retail is stored beside it. Unit 03 in the week of 2026-09-21 differs by $1.00 (100 cents) between retail and discounted. See decisions.
- Fuel matches `trucks.unit_number` exactly (`02` is not `2`). Tolls match the Vektor truck id, resolved to that same unit number. Unmatched rows stay in staging with a Warn issue.
- Fee rules are per truck, stored in the database with effective dates, never hardcoded. The number of trucks is not fixed; adding a truck must be easy.
- Legacy-owned trucks: 10% of each load goes to TOLSON BLACKHAWK LLC (MC authority). Their report goes to Legacy and shows the Tolson payable. Everything else belongs to Legacy. Legacy pays the expenses. Contracts for this class must not include `MANAGEMENT_FEE` or `LEGACY_RETAINED`.
- Third-party trucks: owner is charged a 15% management fee. The report shows only "Management Fee 15%" and never names Tolson. Internally the split is 10% Tolson payable and 5% Legacy income and is recorded in the database. `TOLSON_PAYABLE` + `LEGACY_RETAINED` rates must equal `MANAGEMENT_FEE`, and all three use the same `base_pct_bp`.
- Dispatch fee is a per-truck rate (currently 5.5% or 5%) and can change per truck.
- If the database and a Google Sheet disagree on the same data, the database wins and an issue is flagged; nothing is overwritten silently.
- An approved week is locked; later fixes are adjustment entries. v0.0.0.8 stores the locked snapshot and does not reopen it. Adjustment rows are not built yet.
- A new fee rate version starts on a Monday.
- Fixed weekly expenses are per truck and per kind, stored as integer cents, effective from a Monday. `charged_to` is `owner` (the default) or `management`.
- A per-week override replaces that kind’s amount and `charged_to` for one Monday–Sunday week.
- Management-company operating expenses are typed in by hand: date, category, amount in cents, and an optional note. They are not truck fixed expenses.

## Fee model (engine)

- Money is integer cents. Rates and bases are integer basis points. Never use floating-point for money.
- Each configured rule produces one line:
  - `amount_cents = round( gross_cents × base_pct_bp / 10000 × rate_bp / 10000 )`
- Rounding is **half up to the cent**, per line, in one shared function.
- `base_pct_bp` has no default. Examples:
  - `10000` = apply the rate to 100% of gross
  - `9500` = apply the rate to 95% of gross
  - On $5,800.00 gross, dispatch 5.5% on full gross = $319.00; 5.5% on a 95% base = $303.05. The engine does what the rule says; which base is correct for each truck is OPEN.
- Contract lookup for a calendar date returns exactly one contract (inclusive dates). Error if none or more than one.
- Fixed-expense lookup for a Monday returns the week override when one exists, otherwise exactly one version that covers that Monday. Error if none or more than one version covers it.
- Factoring-based fee bases (for example “after factoring”) are **not** supported until confirmed (OPEN).

## Weekly statement

- The week is the delivery date’s Monday–Sunday. Pickup does not choose the week.
- One fee line per rule, on the sum of that truck’s gross for the week. Half up, once.
- Legacy-owned net deducts Tolson payable. Managed net deducts the management fee only. Tolson payable and Legacy retained on a managed truck are stored and are not deducted a second time.
- Dispatch is deducted from the owner. It is also kept on the statement as Legacy income. This is not the management-company P&L.
- Owner net = gross − driver − (management fee, or Tolson on a Legacy-owned truck) − dispatch − factoring − discounted fuel − tolls − fixed expenses charged to the owner.
- A fixed expense charged to management is stored and left out of owner net. A kind with no row is zero. Overlapping versions block the close.
- Close is blocked by unlinked fuel, a row-count drop on an import whose dates overlap the week, a missing or mid-week contract, a load whose stored week disagrees with its delivery date, or a net that does not reconcile.

## Weekly PDF

- The file is one week: each unit, then fleet totals. Money on the page is dollars formatted from integer cents.
- A locked week uses the snapshot. An unlocked week can be downloaded when that week has no blockers. The PDF is refused when the net, statement lines, load rows, discounted fuel, or tolls do not match those totals.
- Owner earnings on a managed unit show one management fee. Tolson payable and Legacy retained stay off that unit. The fleet page shows them as internal totals.
- Fuel on the PDF is the discounted amount. Diesel gallons are used for MPG. DEF gallons are listed and are not part of MPG.
- The unlabeled $228 line is not printed.

## OPEN

Locked Assumption Log defaults are in `docs/decisions.md` (2026-10-07). Still open:

- Quicken export format (build last).
- The owner statement dollar table for 21–27 Sep 2026 was not in the uploaded handoff. `fixtures/statements/week-2026-09-21.json` is the reference until a live compare. The PDF uses those same cents.
- Trailer, VIN, dispatcher, compliance items, and an operations note are not stored. The PDF prints “Not stored”. Asset partner is `trucks.owner_name`.
- There is no Legacy logo file in this repo. The PDF prints the name Legacy Inc Global.
- A separate PDF file per truck is OPEN. This version downloads one week file.
- The locked snapshot does not store load rows. Current loads must still sum to the snapshot or the PDF is refused.
- Whether an import may keep updating source rows inside a locked week. The snapshot itself does not change. Default: source updates are still allowed.
- Per-load fee rounding. This version rounds once on the week’s gross.
- Vektor long-lived access for scheduled server jobs.
- Bestpass API keys (tolls may stay via Vektor).
- Two-factor login (MFA).
- Password reset process.
