# Changelog

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
