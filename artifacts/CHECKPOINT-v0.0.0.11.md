# Checkpoint v0.0.0.11

1. Test table

| Check | How | Expected | Result |
| --- | --- | --- | --- |
| Sample A | Vitest `src/lib/week-close/week-2026-09-21.e2e.test.ts` | Promotes. Week 2026-09-21..27. Load ID TBH--1152. Rate 220000 cents. Loaded 332. Deadhead 14. Unit 02. Delivery 2026-09-26 | PASS |
| Sample B | Same test | Promotes, delivery 2026-09-11 is outside this week, Warn `date_outside_range` | PASS |
| Sample C | Same test | Not promoted | PASS |
| Fuel stand-in | Same test, `fixtures/vektor/fuel-week-2026-09-21.json` | Every unit promotes. Unit 03 retail minus discounted = 100 cents. Total is not the statement fuel of 75000 cents | PASS |
| Tolls | Same test, toll fixture | 66 transactions, 32153 cents. Not the statement tolls of 1734 cents | PASS |
| Fixed expenses | Same test, statement fixture | Escrow 10000 and ELD 2000 charged to owner, yard 500 to management, permits 1500 to owner | PASS |
| Reference close | Same test. Sample A replaces `load-02-a` | Unit 02 net 134686. Unit 03 net 305630. Fleet net 440316. Prior Sunday and next Monday stay out. Lock payload stored | PASS |
| PDF | Same test reads the page text | Legacy Inc Global, TBH--1152, Test Broker LLC, Irving, TX, Little Rock, AR, the three nets, discounted fuel, Not stored, version 0.0.0.11. No $228.00 line | PASS |
| Stand-in fuel on the statement | Same test | Close blocked for units 04–08. Lock refused. PDF refused | PASS |
| Overview and P&L | Same test | Fleet net 440316. Income 75600. Expenses 13000. P&L net 62600. Tolson 90000 is not in that net | PASS |
| Issues | Same test | Open import warns include the Sample B warns. Info is absent. Close checks cannot be marked resolved | PASS |
| Full suite | `npm test` | Earlier tests stay green | PASS (119 tests) |
| Live migration | Not run | Unapplied until the owner says go | Not applied |
| Signed-in screens | Browser | Imports, Statements, PDF, Overview, Issues | Not clicked. This run has no app env, so the site cannot sign in |

2. What was built

- One Vitest path for Monday 2026-09-21 through Sunday 2026-09-27. It uses the existing import, fixed-expense, statement, PDF, Overview, and Issues functions. No new money rule.
- Sample A is booked as the statement’s 1152 load. The fuel stand-in and the 66 tolls are checked as imports and are not copied into the reference statement.
- Runbook: `docs/WEEK-CLOSE-RUNBOOK.md`.
- No new table and no new environment variable. Migration files were not applied.

3. Click-by-click owner test

1. Apply the unapplied migrations in `docs/WEEK-CLOSE-RUNBOOK.md` when you say go.
2. Sign in to https://tret.ai.alphasolutions.software. Connect Vektor and pass Test connection if that is not done yet.
3. Open **Imports**. Set From `2026-09-21` and To `2026-09-27`. Click **Import loads**, then **Import fuel and tolls**.
4. Open **Fuel** and **Tolls** for that week and compare the live unit totals with Vektor. The fuel fixture is a stand-in. The toll fixture is 66 transactions and $321.53.
5. Open **Statements** for `2026-09-21`. Fix any blockers, then **Close week**. **Download PDF**.
6. Open **Overview** for the same week. The snapshot matches the statement. Tolson payable is under the management P&L net and is not inside it.
7. Open **Issues**. Close checks have no **Mark resolved** button.

4. Manual owner steps

- Run the migrations listed in the runbook in the Supabase SQL editor (owner says go).
- No new environment variables.
- Connect Vektor once in Settings before a live import. This smoke did not do that.

5. Not done / OPEN

- Migrations were not applied to live Supabase.
- Signed-in screens were not clicked in this run (no app env).
- Live Vektor fuel dollars for units 02–08 are still missing from the handoff. The fuel fixture is a stand-in. The statement fixture is a different ledger (fuel 75000 cents, tolls 1734 cents).
- There is still no owner PDF dollar table. The reference nets are unit 02 $1,346.86, unit 03 $3,056.30, fleet $4,403.16.
- Connect Vektor was not signed in. `mcp_verified` was not set by this version.
- No logo file. Trailer, VIN, dispatcher, compliance, and the operations note still print “Not stored”.
- One PDF file per truck is still not built.
- Quicken format stays OPEN and was not built.
- `llm-gateway` was not created.
