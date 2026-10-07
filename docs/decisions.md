# Decisions log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-10-05 | Build v0.0.0.1 as foundation: Next.js App Router, Supabase Auth, `allowed_users` allowlist, Overview, Health, docs, CI | Needed before fee engine or Vektor import |
| 2026-10-05 | App version lives only in the plain-text `VERSION` file; `package.json` version stays `0.0.0` | npm cannot store 4-part versions like `0.0.0.1` |
| 2026-10-05 | Only `alphaassistant.alpha@gmail.com` (role `owner`) is seeded in `allowed_users` | Initial access control for bootstrap |
| 2026-10-05 | Login = email + password, Google removed | Simpler setup |
| 2026-10-05 | OPEN: dispatch fee base (full gross vs reduced) | Not decided; do not guess |
| 2026-10-05 | OPEN: 15% management fee base (gross vs after factoring) | Not decided; do not guess |
| 2026-10-05 | OPEN: meaning of unlabeled $228 line in the sample report | Not decided; do not guess |
| 2026-10-05 | OPEN: Quicken version (Windows confirmed; QIF planned) | Not decided; do not guess |
| 2026-10-05 | OPEN: Vektor long-lived access for scheduled server jobs | Not decided; do not guess |
| 2026-10-05 | OPEN: Bestpass API keys (tolls may stay via Vektor) | Not decided; do not guess |
| 2026-10-05 | OPEN: two-factor login (MFA) | Not decided; do not build yet |
| 2026-10-05 | OPEN: password reset process | Not decided; do not build yet |
| 2026-10-05 | App domain = `tret.ai.alphasolutions.software`; `tretai.alphasolutions.software` is reserved for Resend email and must not host the app | Clear split between app traffic and email sending |
| 2026-10-06 | Owner chose to keep `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_PASSWORD` in Vercel; recommendation is to remove them; the app code never reads them | Owner preference; local create-owner script only; guard test blocks app-code references |
| 2026-10-06 | Module 2: trucks / fee_contracts / fee_rules migration (not applied until go) + pure TypeScript fee engine with integer cents and half-up rounding | Fee model needed before imports and weekly close |
| 2026-10-06 | OPEN: who receives the dispatch fee | Not decided; do not guess |
| 2026-10-06 | OPEN: factoring-based fee bases unsupported until confirmed | Engine only supports explicit `base_pct_bp` on each rule |
| 2026-10-06 | Module 2b: Trucks and fee rules screens; `change_log`; `create_fee_rate_version` / `delete_latest_fee_rate_version` RPCs (apply migration on go) | Staff can manage trucks and rates without editing old versions |
| 2026-10-06 | Old rate versions are never edited; fix mistakes by deleting the latest version only while no weekly statements exist | Keeps history stable; weekly close not built yet |
| 2026-10-06 | Load ID = order friendlyId as-is; also store manifest friendlyId; idempotency = manifestId UUID | From real Vektor samples |
| 2026-10-06 | Deadhead = emptyDistance; always store autoLoadedDistance and autoEmptyDistance | From real Vektor samples |
| 2026-10-06 | Import only STATUS_DELIVERED; never STATUS_DELETED; never MERGED_INTO | Avoid double-counting deleted merges |
| 2026-10-06 | Trip Group / Primary Load not built; store lineage raw; tour is empty in real data | OPEN |
| 2026-10-06 | OPEN: other statuses (CANCELED, TONU, …); multi-order Load ID; Vektor REST list path/shape | Do not guess |
| 2026-10-06 | Module 3: Vektor loads import (manual only, no Sheets, no cron) | Staging → validate → loads |
| 2026-10-07 | Assumption Log defaults locked for this build | See the list below. Do not reopen these without the owner. |
| 2026-10-07 | Dispatch fee base | Owner types it per truck. Calculated-on % of gross is required and has no default. |
| 2026-10-07 | Who receives the dispatch fee | Legacy management income, on its own line. |
| 2026-10-07 | Management fee base | Gross (100%), not after factoring. |
| 2026-10-07 | Unlabeled $228 line | Do not reproduce it. |
| 2026-10-07 | Expenses moved to management | Fixed-expense rows have `charged_to` (`owner` or `management`). Default is owner. Built in v0.0.0.6. |
| 2026-10-07 | TONU and other non-delivered statuses | Count them in the import report. Do not import them. |
| 2026-10-07 | Multi-order manifests | Warn, and leave Load ID empty. |
| 2026-10-07 | Load ID | Vektor order friendlyId, untouched. |
| 2026-10-07 | Deadhead | `emptyDistance`. |
| 2026-10-07 | Trip Group / Primary Load | Stay empty. Store raw lineage fields only. |
| 2026-10-07 | Which trucks exist | Whatever the owner adds. Do not hardcode a count. |
| 2026-10-07 | Quicken format | OPEN. Build last. |
| 2026-10-07 | Vektor MCP OAuth lives in the app | PKCE + dynamic client registration. Tokens encrypted at rest. `mcp_verified` is true only after Test connection passes. |
| 2026-10-07 | Manifest query window | Ask Vektor for first-stop dates from 14 days before `from` through 7 days after `to`, then keep loads whose delivery date is inside the requested range. |
| 2026-10-07 | OPEN: exact `core_Manifests_Get` argument envelope | Working request uses `first_stop_appointment_start_date` `{from, to}`, `page_size`, and `page_token`. `fleet_Trucks_GetByIDs` uses `{ids}`. `core_Manifests_OrderDetailsGet` uses `{manifest_id}`. Confirm on the first live Test connection. |
| 2026-10-07 | OPEN: driver and broker name tools | Not called until `tools/list` shows the exact read-only names. Names are cached only when they are already on the payload. |
| 2026-10-07 | Fixed expenses are one row per truck and kind | Each kind has its own Monday effective dates and weekly amount in integer cents. A new version closes the previous open row for that kind. |
| 2026-10-07 | Week override replaces that week | For one Monday–Sunday week, the override amount and `charged_to` replace the effective-dated version. |
| 2026-10-07 | Fee and expense versions start on Monday | Enforced in the form, the server action, and `assert_effective_monday` inside the database functions. No new check on existing `fee_contracts` rows, because v0.0.0.3 is already applied. |
| 2026-10-07 | Operating expenses are a manual list | Date, category, integer cents, note. This is not the management-company P&L. |
| 2026-10-07 | OPEN: override after a weekly statement exists | Weekly statements are not built. Deleting the latest expense version uses the same guard as rate versions. Whether an override may change a locked week stays open. |
| 2026-10-07 | Fuel ledger amount is the discounted price | `amount_cents` is what is booked. `retail_amount_cents` is stored beside it. |
| 2026-10-07 | Truck 3 (unit 03) $1 fuel gap is discounted vs retail | For the week of 2026-09-21, retail minus discounted is 100 cents ($1.00). That gap is expected. It is not a second transaction. |
| 2026-10-07 | OPEN: live per-unit fuel dollar totals for 21–27 Sep 2026 | The uploaded handoff says “see original handoff” and does not include the unit 02–08 dollar table. The fixture totals are a stand-in, not those missing figures. Tolls for that week are 66 transactions and 32153 cents ($321.53). |
| 2026-10-07 | OPEN: fuel and toll MCP tool names and date arguments | Working names: `fuel_Transactions_Get`, `fuel_Transactions_AggregateGet`, `core_Tolls_Get`, `core_Tolls_StatsGet`, with `transaction_date` `{from, to}`. Test connection still requires only the three load tools. Confirm on the first live fuel import. |
| 2026-10-07 | OPEN: fuel validation thresholds | Seeded in `import_settings`: price $1.50–$10.00 per gallon, diesel tank 300 gal, DEF tank 50 gal, MPG 2–12, row-count drop 50%. Change the rows. Do not hardcode replacements. |
| 2026-10-07 | Toll duplicate key | Fuel duplicates are the same card, time, and amount. Tolls use card or transponder when present, otherwise the Vektor truck id, plus time and amount. |
| 2026-10-07 | A fuel or toll day with no load does not promote | Warn, row stays in staging. Impossible MPG is a week Warn and the fuel rows still promote. Unlinked fuel at week close is a Block check. Week close itself is not built. |
| 2026-10-07 | CSV fuel and toll mappings stay empty until a real export | MCP is primary. CSV runs only after `fuel_csv_column_mapping` and `toll_csv_column_mapping` are set. |
| 2026-10-07 | Weekly statement uses the delivery-date week | Fees are one half-up line per rule on that week’s gross. Pickup does not choose the week. |
| 2026-10-07 | Managed statement shows one management fee | Tolson payable and Legacy retained are stored and are not deducted again. Legacy-owned statements deduct Tolson payable. |
| 2026-10-07 | Dispatch is an owner deduction | It is also stored as Legacy income. The management-company P&L is not this version. |
| 2026-10-07 | Fixed expenses charged to management stay out of owner net | A missing kind is zero. Overlapping versions block the close. |
| 2026-10-07 | Close locks a snapshot and does not reopen | Blockers: unlinked fuel, row-count drop on an overlapping import, missing or mid-week contract, delivery week mismatch, net that does not reconcile. Adjustment rows are later. |
| 2026-10-07 | A locked week refuses a fixed-expense override | Resolves the v0.0.0.6 question. Delete-latest still refuses once any weekly statement exists for the truck. |
| 2026-10-07 | OPEN: 21–27 Sep 2026 owner statement dollars | The uploaded handoff has no PDF dollar table. The fixture statement is the reference. Live per-unit fuel dollars stay OPEN. |
| 2026-10-07 | OPEN: source edits after lock | The locked snapshot does not change. Whether imports should freeze source rows in that week is open. Default: imports may still update source rows. |
| 2026-10-07 | Weekly PDF uses the locked snapshot when the week is locked | Otherwise it uses the computed statement when that week has no blockers. Net, lines, loads, discounted fuel, and tolls are checked again. A mismatch refuses the file. |
| 2026-10-07 | PDF money is dollars formatted from integer cents | No floating-point money. Performance rates use the same half-up divide as fees. |
| 2026-10-07 | Managed unit PDF omits the internal split | Tolson payable and Legacy retained stay off that unit. The fleet page shows them. The unlabeled $228 line is not printed. |
| 2026-10-07 | Asset partner is `trucks.owner_name` | Trailer, VIN, and dispatcher are not columns. Compliance and the operations note are not stored. Those lines print “Not stored”. |
| 2026-10-07 | OPEN: Legacy logo file | The handoff asks for a logo. None is in the repo. The PDF prints “Legacy Inc Global” in the navy bar. |
| 2026-10-07 | OPEN: one PDF file per truck | This version downloads one week file: each unit, then fleet totals. |
| 2026-10-07 | MPG on the PDF uses diesel gallons only | DEF gallons are listed and are not included in MPG. Gallons are not on the locked snapshot; they are read from current fuel rows, which must sum to the statement’s discounted cents. |
| 2026-10-07 | OPEN: load rows are not in the snapshot | Current loads must sum to the statement gross and miles. If a later edit breaks that, the PDF is refused. |
| 2026-10-07 | OPEN: 21–27 Sep 2026 owner PDF dollar table | The uploaded handoff still has no dollar table. The v0.0.0.8 fixture remains the reference the PDF is tested against. |
