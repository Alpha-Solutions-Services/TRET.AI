# Checkpoint v0.0.0.6

1. Test table

| Check | How | Expected | Result |
| --- | --- | --- | --- |
| Monday rule | Vitest `fixed-expenses.test.ts` and a local throwaway Postgres (not live Supabase) | 2026-09-21 accepted. 2026-09-22 rejected for fee versions, expense versions, and overrides | PASS |
| Effective-date lookup | Vitest | Week 2026-09-14 is 1500 cents, owner. Week 2026-09-21 is 2000 cents, management. A week with no row errors. Two overlapping versions error | PASS |
| Overrides | Vitest and local Postgres | Override replaces amount and charged_to for that Monday only. Saving the same week again updates the one row (750 cents) | PASS |
| Cents | Vitest | `10.10` → 1010, `0.29` → 29, `1.15` → 115. Extra decimals, negatives, and non-integers are rejected | PASS |
| Default charged_to | Local Postgres | Empty charged_to is stored as owner | PASS |
| Close and delete | Local Postgres | A new Monday closes the previous version on the day before. Delete latest reopens that previous row and writes change_log | PASS |
| Overlap | Local Postgres | A second range for the same truck and kind is rejected | PASS |
| Operating expense | Local Postgres | Create and delete of a manual row, with change_log | PASS |
| RLS | Local Postgres | `truck_fixed_expenses`, `truck_fixed_expense_overrides`, and `mgmt_operating_expenses` have row security on | PASS |
| Full suite | `npm test` | Earlier tests stay green | PASS (71 tests) |
| Live migration | Not run | Unapplied until the owner says go | Not applied |
| Signed-in screens | Browser | Fixed expenses tab and Operating expenses page | Not clicked. This run has no app env, so the site cannot sign in |

2. What was built

- Fixed weekly expenses: one effective-dated row per truck and kind, weekly amount in integer cents, charged to owner (default) or management. From-date must be a Monday. Overlaps are rejected. Changes go to change_log.
- Per-week override for one Monday.
- Fee rate versions must also start on a Monday (form, server action, and database function). Existing fee rows are not rechecked.
- Trucks page tab: new expense version, delete latest, week override, week lookup.
- Operating expenses page: date, category, amount in cents, note. Not a profit and loss statement.
- Migration file only. Not applied to live Supabase.

3. Click-by-click owner test

1. Run `supabase/migrations/20261007130000_fixed_expenses_monday_rule.sql` in the Supabase SQL editor when you say go. Redeploy is not required for the tables, but the new screens ship with this version.
2. Sign in to https://tret.ai.alphasolutions.software.
3. Open Trucks and a truck. Open **Fixed expenses**.
4. Click **New expense version**. Choose ELD Fee, a Monday, `20.00`, Charged to Owner. Save. The row should show `$20.00` and Owner.
5. Save another version of the same kind on a later Monday. The first row should close the day before that Monday.
6. Try a Tuesday. The form should say the date must be a Monday.
7. Click **Add week override** for that kind and the first Monday. Enter a different amount. **Week lookup** for that Monday should show the override. The next Monday should still show the version.
8. Open **Rates** and try **New rate version** with a Tuesday. It should be refused.
9. Open **Operating expenses**. Add a date, category, and amount. The row and the total should appear. Delete asks you to confirm.

4. Manual owner steps

- Run `supabase/migrations/20261007130000_fixed_expenses_monday_rule.sql` in the Supabase SQL editor (owner says go).
- No new environment variables.

5. Not done / OPEN

- Migration was not applied to live Supabase.
- Signed-in screens were not clicked in this run (no app env).
- Weekly statements, fuel, tolls, PDF, and the management-company P&L are not started.
- OPEN: whether a week override may change a week after a weekly statement exists. Deleting the latest expense version uses the same guard as rate versions.
- Quicken format stays OPEN.
- Blocks 3–7 were not started.
