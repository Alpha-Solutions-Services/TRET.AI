# Week close runbook — 21–27 Sep 2026

Monday 2026-09-21 through Sunday 2026-09-27. This is the fixture week the app is tested against. It does not call Vektor and it does not apply database migrations.

## Two fixture sets

They are not the same ledger.

| Set | File | What it is |
| --- | --- | --- |
| Import | `fixtures/vektor/sample-a-manifest-1152.json` | Manifest 1152. Promotes. Load ID `TBH--1152`. Rate 220000 cents. Loaded 332 miles. Deadhead 14. Delivery 2026-09-26. Week 2026-09-21..27. Unit `02`. Origin Irving, TX. Destination Little Rock, AR. |
| Import | `fixtures/vektor/sample-b-manifest-1101.json` | Delivered, but the delivery day is 2026-09-11, so it is outside this week. The import records a Warn. |
| Import | `fixtures/vektor/sample-c-manifest-1146.json` | Deleted and merged. Not promoted. The exclusion is Info, so it stays out of the Issues inbox. |
| Import | `fixtures/vektor/fuel-week-2026-09-21.json` | Stand-in for units 02–08. Unit 03 retail is 100 cents above discounted. Not the live Vektor dollar table. |
| Import | `fixtures/vektor/tolls-week-2026-09-21.json` | 66 tolls, 32153 cents ($321.53). |
| Close | `fixtures/statements/week-2026-09-21.json` | Hand-calculated statement. Unit 02 net 134686 cents. Unit 03 net 305630 cents. Fleet net 440316 cents. Fuel on that file is 50000 and 25000 cents. Tolls are 1234 and 500 cents. |
| Close | `fixtures/overview/week-2026-09-21.json` | Operating expenses and import issues for the management P&L and the inbox. |

Sample A is the same money and miles as statement load `load-02-a`. The other statement loads, the statement fuel, and the statement tolls are not in the Vektor fixture files. Booking the fuel stand-in onto the statement week blocks Close: units 04–08 have fuel and no delivered load in that statement.

## Automated smoke

From the repo root, with no `.env.local` and no Vektor token:

```bash
npm test
```

The week path is `src/lib/week-close/week-2026-09-21.e2e.test.ts`. It imports the fixtures, resolves fixed expenses, computes the reference statement, locks it, reads the PDF text, then checks the Overview snapshot, the management P&L, and the Issues inbox.

## Owner path in the app

Sign in at https://tret.ai.alphasolutions.software. The smoke above does not click these screens.

1. Apply any of these migrations that are not already on the project, in this order, only after you say go. Do not apply them from a cloud agent.
   - `supabase/migrations/20261007120000_vektor_mcp_oauth.sql`
   - `supabase/migrations/20261007130000_fixed_expenses_monday_rule.sql`
   - `supabase/migrations/20261007140000_fuel_tolls_import.sql`
   - `supabase/migrations/20261007150000_weekly_statements.sql`
   - `supabase/migrations/20261007160000_resolve_issue.sql`
2. Open **Settings**. **Connect Vektor**, then **Test connection**. Import source can be Vektor MCP only after that test passes. This smoke does not sign in.
3. Open **Imports**. Set From `2026-09-21` and To `2026-09-27`. Click **Import loads**, then **Import fuel and tolls**.
4. Open **Fuel** and **Tolls** for the week starting `2026-09-21`. Compare the live unit totals with Vektor. The fuel fixture is only a stand-in. Tolls in that fixture are 66 transactions and $321.53.
5. Open each truck. On **Fixed expenses**, confirm the weekly amounts for this Monday. Charged to Owner is the default. Charged to Management stays off the owner net and goes to the P&L.
6. Open **Statements**. Set the week to `2026-09-21`. If Close is blocked, the reasons are on the page. **Close week** asks you to confirm. There is no reopen.
7. **Download PDF** stays off while the week has blockers. The file is `tret-statement-2026-09-21.pdf`. Trailer, VIN, dispatcher, compliance, and the operations note print “Not stored”. There is no logo file in the repo. The header is the name Legacy Inc Global.
8. Open **Overview** for `2026-09-21`. The snapshot matches the statement. Management P&L income is Legacy retained on managed trucks plus the dispatch fee. Tolson payable is listed and is not in that net.
9. Open **Issues** for the same week. Close checks have no **Mark resolved** button. **Mark resolved** is only for a stored Warn or Block import issue, and it waits on the resolve migration.

Live dollars from Vektor can differ from both fixture files. When they do, the fixture statement is no longer the reference. Record the live cents before treating a locked week as the owner’s report.
