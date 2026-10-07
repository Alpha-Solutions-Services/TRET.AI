# Checkpoint v0.0.0.7

1. Test table

| Check | How | Expected | Result |
| --- | --- | --- | --- |
| Units 02–08 fuel week | Vitest on `fixtures/vektor/fuel-week-2026-09-21.json` | Every unit promotes. Unit 03 retail minus discounted = 100 cents | PASS |
| Tolls 21–27 Sep 2026 | Same test, toll fixture | 66 transactions, 32153 cents ($321.53) | PASS |
| CSV fallback | Same totals from the CSV fixtures | Fuel $1 gap and 66 tolls / 32153 cents | PASS |
| Unit match | Vitest | `02` matches. `2` stays unmatched (Warn, not promoted) | PASS |
| Toll truck id | Vitest | `vektor-truck-02` resolves to `02`. A lookup of `2` does not | PASS |
| Duplicate | Vitest | Same card, time, and amount: first id promotes, second is Warn | PASS |
| Price, tank, no load | Vitest | Each is Warn and does not promote | PASS |
| Impossible MPG | Vitest | Warn, fuel still promotes | PASS |
| Row-count drop | Vitest | Block, nothing promoted | PASS |
| Unlinked fuel at week close | Vitest | Block when that unit has no delivered load that week | PASS |
| Allowlist | Vitest | Fuel and toll read tools allowed. Create/Delete names throw | PASS |
| Idempotent id | Vitest | Two rows with one Vektor id collapse to the later amount | PASS |
| Full suite | `npm test` | Earlier tests stay green | PASS (89 tests) |
| Live migration | Not run | Unapplied until the owner says go | Not applied |
| Signed-in screens | Browser | Fuel, Tolls, Import fuel and tolls | Not clicked. This run has no app env, so the site cannot sign in |

2. What was built

- Import fuel and tolls for a date range. MCP is primary. CSV runs when both column mappings are set and both files are chosen.
- Rows land in staging, then validation, then `fuel_transactions` or `toll_transactions`. The same Vektor transaction id updates the existing row.
- Fuel books the discounted amount. Retail is stored. The Truck 3 gap is $1.00 retail over discounted on unit 03.
- Fuel and Tolls pages: week filter and per-unit totals.
- Migration file only. Not applied to live Supabase.

3. Click-by-click owner test

1. Run `supabase/migrations/20261007140000_fuel_tolls_import.sql` in the Supabase SQL editor when you say go.
2. Sign in to https://tret.ai.alphasolutions.software. Connect Vektor and pass Test connection if that is not done yet.
3. Open **Imports**. Set From `2026-09-21` and To `2026-09-27`. Click **Import loads**, then **Import fuel and tolls**.
4. Open **Fuel**. Set the week starting `2026-09-21`. Each unit 02–08 should have a discounted total. Unit 03 retail should be $1.00 higher than discounted.
5. Open **Tolls** for the same week. The count should be 66 and the amount $321.53, within normal drift if Vektor has changed a transaction.
6. A truck whose unit is `2` instead of `02` should stay out of the totals and open a Warn issue.

4. Manual owner steps

- Run `supabase/migrations/20261007140000_fuel_tolls_import.sql` in the Supabase SQL editor (owner says go).
- No new environment variables.
- Confirm the live fuel and toll MCP tool names on the first import. The working names are in `docs/decisions.md`.

5. Not done / OPEN

- Migration was not applied to live Supabase.
- Signed-in screens were not clicked in this run (no app env).
- The uploaded handoff does not include the per-unit fuel dollar table (“see original handoff”). Fixture totals are a stand-in. Live unit 02–08 dollars stay OPEN until you compare them with Vektor. Tolls 66 / $321.53 are in the fixture.
- Exact fuel and toll MCP tool names and the `transaction_date` argument are OPEN until the first live import.
- Price, tank, and MPG thresholds are seeded and marked OPEN.
- Week close, PDF, the Issues inbox screen, and Blocks 4–7 were not started.
- Quicken format stays OPEN.
