# Changelog

## v0.0.0.14 — 2026-10-07

- Import loads: a successful Vektor call with zero rows was the unconfirmed date filter `filters.first_stop_appointment_start_date`. The list now reads the `core_Manifests_Get` input schema when that page is empty, tries the schema date field and camelCase delivery filters, and if only an unfiltered list has rows, keeps manifests by delivery date. An empty result stores payload keys and counts on the run and in Notes. Tool errors are no longer counted as an empty list. An empty `structuredContent` no longer hides rows that arrived in the text body.
- Promoted manifests still land in `loads` on `manifest_id`. The import does not write Google Sheets.
- Overview Ins and Outs, per active truck, for the selected Monday–Sunday week. Ins are the sheet load ledger Rate (integer cents) for deliveries in the week. Outs are Mgmt Expenses dated in the week: Vektor Fee, Sintra AI, Quickbooks, Job Post, Accountant Salary, MVR, Drug Test, and Spare Expense 1 through 5. Blank amounts are skipped.
- Sheet reads use a public CSV export, or `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` when the sheet is private. `GOOGLE_SHEETS_API_KEY` is optional for sheets that are already public. No new migration.

## v0.0.0.13 — 2026-10-07

- Trucks list and truck page: **Edit** opens the same side panel as Add truck and saves unit number, name, class, and owner. Trucks are still never deleted.
- Optional **Google Sheet** link on the truck. Shown on the list and the truck page, and opened as a link. Paste it on Add truck or Edit.
- Migration `20261007170000_truck_google_sheet_url.sql` adds `trucks.google_sheet_url`. It is not applied until the owner says go. Until then, the other truck fields still save.

## v0.0.0.12 — 2026-10-07

- Live Test connection failed because `core_Manifests_Get` sent `first_stop_appointment_start_date`, `page_size`, and `page_token`. Vektor accepts `filters`, `page`, `perPage`, `sortDirection`, `sortKey`, and `aggregationKeys`.
- Manifest list calls now send the first-stop date range inside `filters`, with 1-based `page` and `perPage` 100. Fuel and toll list calls use that same envelope. Truck and order-detail arguments are unchanged.
- `mcp_verified` can become true only after the owner clicks Test connection again.

## v0.0.0.11 — 2026-10-07

- Fixture smoke for Monday 2026-09-21 through Sunday 2026-09-27. Vitest imports Sample A/B/C, the fuel stand-in, and the toll fixture, resolves fixed expenses, computes the reference statement, locks it, reads the PDF, then checks Overview, the management P&L, and Issues.
- Sample A is the same cents and miles as statement load 1152. The fuel stand-in and the 66 tolls are not the statement ledger. Booking that fuel file blocks Close for units 04–08 and refuses the PDF.
- Runbook: `docs/WEEK-CLOSE-RUNBOOK.md`. No live Vektor call. No migration applied.

## v0.0.0.10 — 2026-10-07

- Overview for the selected Monday–Sunday week: fleet and unit snapshot from the statement (gross, fees, discounted fuel, tolls, owner fixed, net), open issues, and close status. A locked week uses the snapshot.
- Management P&L in integer cents. Income is Legacy retained on managed trucks plus the dispatch fee Legacy keeps. Expenses are fixed costs charged to management and operating expenses dated in the week. Tolson payable is shown and is not in the net.
- Issues inbox: Warn and Block import issues for the week, plus live close checks. Filter by week, severity, and status. Mark resolved updates a stored open issue only. Close checks are not stored and cannot be resolved.
- Migration `20261007160000_resolve_issue.sql` is not applied until the owner says go. No new table.

## v0.0.0.9 — 2026-10-07

- Weekly PDF for a selected week: one file, a section per unit, then fleet totals. Dollars are formatted from integer cents.
- Figures are recomputed from the locked snapshot, or from the computed statement when that week has no blockers. If net, lines, loads, discounted fuel, or tolls do not match, the PDF is refused.
- Statements page: **Download PDF**.
- Layout covers the header, load table, performance, owner earnings, discounted fuel, and fixed expenses that the statement already stores. Trailer, VIN, dispatcher, compliance, operations note, and a logo file are not stored.
- No new migration and no new environment variables.

## v0.0.0.8 — 2026-10-07

- Weekly statements for a Monday–Sunday week, using each load’s delivery date. Per-unit and fleet totals from loads, fee contracts, discounted fuel, tolls, and fixed weekly expenses.
- Money stays integer cents. Rates stay basis points. One half-up rounding per fee line on the week’s gross.
- Legacy-owned trucks deduct Tolson payable. Managed trucks deduct one management fee. The 10% Tolson and 5% Legacy split is stored and is not deducted again. Fixed expenses charged to management are stored and are not in owner net.
- Close week checks unlinked fuel, a row-count drop on an import that overlaps the week, missing or mid-week contracts, and that net reconciles. A clean week locks a snapshot. There is no reopen.
- Statements page: week selector, fleet and unit tables, Close with the blocker list.
- Migration `20261007150000_weekly_statements.sql` is not applied until the owner says go.

## v0.0.0.7 — 2026-10-07

- Fuel and tolls import: MCP first, CSV when column mapping is set. Staging, then `fuel_transactions` and `toll_transactions`. Idempotent on the Vektor transaction id.
- Fuel matches `unit_number` exactly. Tolls resolve the Vektor truck id to that unit. Unmatched rows stay in staging with a Warn issue.
- Validation uses `import_settings`: duplicate card/time/amount, price per gallon, tank size, no load that day, impossible MPG (Warn), row-count drop (Block), unlinked fuel at week close (Block check only).
- Fuel and Tolls pages show per-unit week totals. Discounted fuel is booked. Unit 03 retail minus discounted is $1.00 in the reference fixture.
- Read MCP allowlist adds the fuel list/aggregate and tolls list/stats tools. Any other tool name throws. Migration `20261007140000_fuel_tolls_import.sql` is not applied until the owner says go.

## v0.0.0.6 — 2026-10-07

- Fixed weekly expenses per truck: one effective-dated row per kind, weekly amount in integer cents, `charged_to` owner (default) or management.
- Kinds: Maintenance Escrow Weekly, ELD Fee, Yard Fee, GPS Tracker, Insurance, Truck Payments, Trailer Payments, Toll Pass, Permits, Misc.
- Per-week override table. Overlap protection and `change_log` on create, delete latest, and override changes.
- Fee rate versions and fixed-expense versions must start on a Monday (form, server action, and database function).
- Trucks page: Fixed expenses tab (new version, delete latest, week override, week lookup).
- Management-company operating expenses: manual date, category, amount in cents, note. Not a P&L.
- Migration `20261007130000_fixed_expenses_monday_rule.sql` is not applied until the owner says go.

## v0.0.0.5 — 2026-10-07

- Settings: Connect Vektor, status Connected / Needs sign-in, Test connection, Disconnect.
- App OAuth (PKCE + dynamic client registration) at `/api/vektor/oauth/start` and `/api/vektor/oauth/callback`. Tokens encrypted with `VEKTOR_TOKEN_ENCRYPTION_KEY`. Tables are RLS deny-all; ciphertext only via security-definer RPCs.
- Refresh before expiry under a database lock; rotated refresh token saved in one update. Failure sets Needs sign-in, marks the import run Failed, and opens Block issue "Vektor connection needs sign-in".
- MCP read allowlist: `core_Manifests_Get`, `core_Manifests_OrderDetailsGet`, `fleet_Trucks_GetByIDs`. Any other tool name throws.
- Live load fetch uses the first-stop window (from − 14 days, to + 7 days), then keeps rows whose delivery date is in range. `mcp_verified` becomes true only after Test connection passes; only then can Import source be MCP.
- Migration `20261007120000_vektor_mcp_oauth.sql` is not applied until the owner says go.
- Assumption Log defaults recorded in `docs/decisions.md`.

## v0.0.0.4 — 2026-10-06

- Vektor loads import (manual only): staging → validate → `loads`; idempotent on `manifestId`.
- Tables (migration not applied until go): `import_settings`, `import_runs`, `vektor_loads_staging`, `loads`, `issues` with RLS.
- Mapping per owner decisions: order friendlyId as Load ID, manifest grossAmount → cents, delivery-date fallback chain, deadhead = emptyDistance, lineage stored, Trip Group not built.
- Truck match: `truckId` → trucks lookup `referenceId` → exact `trucks.unit_number`.
- Import adapters: interface + Settings “Import source”; `McpAdapter` (unverified until spike), `CsvExportAdapter` (not configured), `ApiAdapter` stub; cross-source natural key = manifest `friendlyId`.
- Additive migration (unapplied until go): `import_runs.source`, staging `manifest_friendly_id`, unique loads friendlyId index, adapter settings keys.
- Sample A real values (1152) + Samples B/C + Vitest.
- Spike v2 script: `scripts/spike-vektor-mcp-oauth.mjs` (OAuth PKCE + refresh proof; tokens gitignored).
- Imports page (Import now, default last 14 days) and read-only Loads page (week + truck filters, totals).
- No Google Sheets. No scheduler.

## v0.0.0.3 — 2026-10-06

- Left nav: Overview and Trucks (button-style, current page highlighted).
- Trucks list: search, activate/deactivate (never delete), empty state, current fee summary, Add truck side panel.
- Truck detail: rate version history, New rate version form (rate % and calculated-on % of gross, no base default), test calculator using the pure fee engine, last-changed from `change_log`.
- Migration (not applied until go): `change_log` + `create_fee_rate_version` / `delete_latest_fee_rate_version` (single transaction, `allowed_users` check).
- Vitest: percent ↔ basis points (5.5 → 550, 2.65 → 265) and form data through the fee engine.
- Docs: data model, user guide, Module 2b marked done.

## v0.0.0.2 — 2026-10-06

- Database migration (not applied until go): `trucks`, `fee_contracts`, `fee_rules` with RLS for `allowed_users`; exclusion constraint blocks overlapping contracts for the same truck.
- Pure TypeScript fee engine: integer cents, basis points, half-up rounding in one function; contract date lookup; Monday–Sunday week helper.
- Vitest coverage for sample weeks, dispatch bases, rounding, date lookup, invalid inputs, and week bounds.
- Guard test: files outside `scripts/` must not reference privileged local script env names (docs and `.env.example` exempt).
- Docs: `data-model.md`, fee model and OPEN items in business rules, Module 2 marked done.

## v0.0.0.1 — 2026-10-05

- Project skeleton: Next.js App Router, TypeScript strict, Tailwind, lint, typecheck, Vitest, GitHub Actions CI.
- Supabase Auth with email + password sign-in; access limited to `allowed_users` (seed: `alphaassistant.alpha@gmail.com`, role `owner`). Google sign-in removed.
- Local `npm run create-owner` script to create or reset the owner Auth user (service role key stays local; never on Vercel).
- Pages: `/login`, Overview `/`, `/health`, and Access denied. Signed-in shell includes Sign out.
- UI foundation: Inter, navy accent, light theme, button actions, skeleton, toast, signed-in footer with version.
- Database migration: `allowed_users` with Row Level Security.
- Automated test that fails if `SECRETS/` or non-example `.env*` files are tracked by git.
- Documentation for overview, business rules, decisions, architecture, data sources, setup, modules, and versioning.
- Fix: refresh `package-lock.json` so GitHub Actions `npm ci` succeeds; document Vercel Framework Preset = Next.js (not static/`public` output).
- Fix: missing required env vars show a plain **Setup incomplete** page instead of a 500; missing names are logged server-side only.
- Production app domain set to `tret.ai.alphasolutions.software` (`tretai.alphasolutions.software` reserved for Resend).
- Fix: read Supabase public env via shared helper (avoids empty build-time inlining) and set cookieEncoding base64url.
- Fix: bake `VERSION` into `TRET_AI_VERSION` at build so Vercel serverless does not 500 on missing VERSION file; soft-fail middleware and show Setup incomplete on unexpected errors.
