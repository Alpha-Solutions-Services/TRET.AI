# Business rules

## DECIDED

- Reporting week runs Monday to Sunday (taken from the sample report). Week helper: for any date, Monday is the start and Sunday is the end (example: week of 2026-09-21 ends 2026-09-27).
- Loads, fuel and tolls come from Vektor. v0.0.0.5 connects loads through Vektor MCP after the owner signs in once. v0.0.0.7 imports fuel and tolls through staging. v0.0.0.8 builds the weekly statement and can lock the week. v0.0.0.9 renders that statement as a PDF. v0.0.0.10 shows that week on Overview, with the management P&L and the Issues inbox. v0.0.0.11 runs 21–27 Sep 2026 from fixtures only. v0.0.0.17 also promotes loads from CSV or the truck Google Sheet Load Ledger, and can call Vektor REST when those variables are set. MCP stays available and is currently broken on filters proto.
- Fuel is booked at the discounted amount (integer cents). Retail is stored beside it. Unit 03 in the week of 2026-09-21 differs by $1.00 (100 cents) between retail and discounted. See decisions.
- Fuel matches `trucks.unit_number` exactly (`02` is not `2`). Tolls match the Vektor truck id, resolved to that same unit number. Unmatched rows stay in staging with a Warn issue.
- Fee rules are per truck, stored in the database with effective dates, never hardcoded. The number of trucks is not fixed; adding a truck must be easy.
- Legacy-owned trucks: 10% of each load goes to TOLSON BLACKHAWK LLC (MC authority). Their report goes to Legacy and shows the Tolson payable. Everything else belongs to Legacy. Legacy pays the expenses. Contracts for this class must not include `MANAGEMENT_FEE` or `LEGACY_RETAINED`.
- Third-party trucks: owner is charged a 15% management fee. The report shows only "Management Fee 15%" and never names Tolson. Internally the split is 10% Tolson payable and 5% Legacy income and is recorded in the database. `TOLSON_PAYABLE` + `LEGACY_RETAINED` rates must equal `MANAGEMENT_FEE`, and all three use the same `base_pct_bp`.
- Dispatch fee is a per-truck rate (currently 5.5% or 5%) and can change per truck.
- If the database and a Google Sheet disagree on the same load, a Warn issue is flagged and nothing is overwritten silently. Overview and Ins and Outs still show the sheet figures. The Weekly Asset Management Report uses the sheet, then database fuel or tolls only when those sheet cells are blank.
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
- Dispatch is deducted from the owner. It is also Legacy income on the management P&L, on its own line.
- Owner net = gross − driver − (management fee, or Tolson on a Legacy-owned truck) − dispatch − factoring − discounted fuel − tolls − fixed expenses charged to the owner.
- A fixed expense charged to management is stored and left out of owner net. A kind with no row is zero. Overlapping versions block the close.
- Close is blocked by unlinked fuel, a row-count drop on an import whose dates overlap the week, a missing or mid-week contract, a load whose stored week disagrees with its delivery date, or a net that does not reconcile.

## Weekly PDF

- The file is one week: each unit, then fleet totals. Money on the page is dollars formatted from integer cents.
- A locked week uses the snapshot. An unlocked week can be downloaded when that week has no blockers. The PDF is refused when the net, statement lines, load rows, discounted fuel, or tolls do not match those totals.
- Owner earnings on a managed unit show one management fee. Tolson payable and Legacy retained stay off that unit. The fleet page shows them as internal totals.
- Fuel on the PDF is the discounted amount. Diesel gallons are used for MPG. DEF gallons are listed and are not part of MPG.
- The unlabeled $228 line is not printed.

## Dashboard and Management cards

- Income is the summed management fee on sheet loads for the selected Monday–Sunday week. The fee is the portal amount: org default, truck week percent, or a saved load percent or dollar amount.
- Tolson payable is a setting on each truck: percent of that truck's week gross, or a fixed weekly amount. Both stay empty until someone sets them on Edit truck. An empty setting is $0. The week total is the sum of those trucks.
- Expenses are portal operating costs whose date falls in the expense month of that week's Monday. The whole month is shown. It is not a one-seventh share of the month.
- Tolson payable is its own expense line. Net is income minus portal expenses minus Tolson payable.
- Legacy kept is income minus Tolson payable. It matches that same Tolson total.
- Dashboard Outs are the Weekly Expenses row for that truck and week, using the same money columns as the asset report. Mgmt Expenses is used only when the Weekly Expenses header is missing. Portal monthly costs are not added into Outs.

## Management P&L

This section is the statement close. The Dashboard and Management pages use the card rules above.

- Income is Legacy retained on managed trucks, taken from the statement, plus the dispatch fee Legacy keeps. The retained rate is the contract rate. It is not hardcoded.
- Legacy-owned trucks do not add Legacy retained, even if a number is stored on that unit.
- Expenses are fixed weekly costs charged to management, plus operating expenses whose date is inside the Monday–Sunday week.
- Net is income minus those expenses, in integer cents.
- Tolson payable is shown and is not part of that net.
- A locked week uses the statement snapshot for retained, dispatch, fixed-to-management, and Tolson. Operating expenses stay the current rows for those dates.

## QuickBooks (v0.0.0.25)

- One company. Admins only (`owner` or `admin`).
- Import writes portal expenses only after confirm, and only for a QuickBooks id that is not already saved.
- A credit (negative amount) is not a portal expense.
- The weekly post uses the Management card income and Tolson payable. It is one journal entry. It does not run by itself.
- Posting again for a week that already has a log row is allowed. The new QuickBooks id is logged too.
- Unless `QUICKBOOKS_API_ENABLED` is `true`, Integrations does not show Connect QuickBooks. The weekly file is a journal entry CSV. The expense file is saved only after confirm, and a repeated row hash is skipped.

## Issues

- The inbox lists Warn and Block only. Info is not listed.
- An import issue is in the week when its import run overlaps that week. An issue with no run range stays visible in every week.
- Close checks are the live statement blockers. They are not stored. They cannot be marked resolved. They leave the list when the check passes.
- Mark resolved changes `issues.status` for one open Warn or Block import issue. It does not change imported rows and does not unlock a week.

## OPEN

Locked Assumption Log defaults are in `docs/decisions.md` (2026-10-07). Still open:

- Quicken export format (build last). Not started.
- Live Vektor fuel and toll dollars for 21–27 Sep 2026. The uploaded handoff has no per-unit fuel table. `fixtures/vektor/fuel-week-2026-09-21.json` is a stand-in (unit 03 retail minus discounted is 100 cents). `fixtures/vektor/tolls-week-2026-09-21.json` is 66 tolls and 32153 cents. Those cents are not the statement fixture.
- The owner statement dollar table for 21–27 Sep 2026 was not in the uploaded handoff. `fixtures/statements/week-2026-09-21.json` is the close reference until a live compare. The PDF smoke uses those cents. Unit 02 net is 134686 cents. Unit 03 net is 305630 cents. Fleet net is 440316 cents.
- Connect Vektor. The v0.0.0.11 smoke does not sign in and does not set `mcp_verified`. The owner still connects once in Settings and passes Test connection before a live import.
- The weekly statement PDF has no logo file. The Weekly Asset Management Report cover uses the Legacy truck artwork extracted from the template.
- The weekly statement PDF still prints “Not stored” for trailer, VIN, dispatcher, compliance, and the operations note.
- The Weekly Asset Management Report reads trailer, VIN, dispatcher, and status from the truck sheet when those fields are present. Asset partner is `trucks.owner_name`. There is no trailer or VIN column on `trucks`. A missing dispatcher prints Legacy Dispatch Team and does not add a note. The Driver line uses the truck name or owner name when it continues the sheet first name. The operations note is omitted when there are no notes. That report does not print “Not stored”. The weekly expense line is Maintenance Escrow Weekly. The escrow card is Escrow Balance when the sheet has that column, and Escrow Balance (this week) when it does not.
- Loads on one trip are one group. The sheet Trip Group and Primary columns are the signal. Trip M-1195 is the same group as Vektor manifest 1195. Loaded miles count only from the row marked Primary. The other rows on that trip show as partial. When the sheet has no Primary flag, loaded miles count from the load with the most loaded miles, using the Vektor manifest. Revenue still sums every load. Dispatch miles, rate per mile, and fuel cost per mile use the counted loaded miles plus every deadhead mile. Truck Miles on the sheet is 0 for a non-primary row and is not added again.
- The Dashboard week snapshot uses sheet Ins and Outs for the selected week. Gross is Ins. Fees, fuel, tolls, and fixed split Outs. Net is Ins minus Outs.
- Vektor REST list path. Probes are documented in decisions. Set `VEKTOR_API_MANIFESTS_PATH` when Vektor confirms it.
- Truck Pymts and Trailer Pymts are not lines on the asset report. They are not combined into MC Lease.
- A separate PDF file per truck is OPEN. This version downloads one week file.
- The locked snapshot does not store load rows. Current loads must still sum to the snapshot or the PDF is refused.
- Whether an import may keep updating source rows inside a locked week. The snapshot itself does not change. Default: source updates are still allowed.
- Per-load fee rounding. This version rounds once on the week’s gross.
- Vektor long-lived access for scheduled server jobs.
- Bestpass API keys (tolls may stay via Vektor).
- Two-factor login (MFA).
- Password reset process.
- QuickBooks credit memos and vendor credits. Negative amounts are shown and not imported.
- Whether a second journal entry for the same week should be blocked. This version warns and still posts when the admin confirms.
