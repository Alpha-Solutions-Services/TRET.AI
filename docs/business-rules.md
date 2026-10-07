# Business rules

## DECIDED

- Reporting week runs Monday to Sunday (taken from the sample report). Week helper: for any date, Monday is the start and Sunday is the end (example: week of 2026-09-21 ends 2026-09-27).
- Loads, fuel and tolls come from Vektor. v0.0.0.5 connects loads through Vektor MCP after the owner signs in once. Fuel and tolls are not built yet.
- Fee rules are per truck, stored in the database with effective dates, never hardcoded. The number of trucks is not fixed; adding a truck must be easy.
- Legacy-owned trucks: 10% of each load goes to TOLSON BLACKHAWK LLC (MC authority). Their report goes to Legacy and shows the Tolson payable. Everything else belongs to Legacy. Legacy pays the expenses. Contracts for this class must not include `MANAGEMENT_FEE` or `LEGACY_RETAINED`.
- Third-party trucks: owner is charged a 15% management fee. The report shows only "Management Fee 15%" and never names Tolson. Internally the split is 10% Tolson payable and 5% Legacy income and is recorded in the database. `TOLSON_PAYABLE` + `LEGACY_RETAINED` rates must equal `MANAGEMENT_FEE`, and all three use the same `base_pct_bp`.
- Dispatch fee is a per-truck rate (currently 5.5% or 5%) and can change per truck.
- If the database and a Google Sheet disagree on the same data, the database wins and an issue is flagged; nothing is overwritten silently.
- An approved week is locked; later fixes are adjustment entries.
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

## OPEN

Locked Assumption Log defaults are in `docs/decisions.md` (2026-10-07). Still open:

- Quicken export format (build last).
- Vektor long-lived access for scheduled server jobs.
- Bestpass API keys (tolls may stay via Vektor).
- Two-factor login (MFA).
- Password reset process.
