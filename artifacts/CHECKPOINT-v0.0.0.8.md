# Checkpoint v0.0.0.8

1. Test table

| Check | How | Expected | Result |
| --- | --- | --- | --- |
| Week 21–27 Sep 2026 reference | Vitest on `fixtures/statements/week-2026-09-21.json` | Unit 02 net 134686 cents. Unit 03 net 305630 cents. Fleet net 440316 cents. Prior Sunday and next Monday loads stay out | PASS |
| Owned vs managed | Same test | Unit 02 shows Tolson 32000 and no management line. Unit 03 shows management 87000. Tolson 58000 and Legacy 29000 are internal and not deducted again | PASS |
| Integer cents | Same test | Lock payload money fields are integers | PASS |
| Unlinked fuel | Vitest | Block, lock payload refused | PASS |
| Row-count drop | Vitest | Block when the overlapping fuel import drops past the setting. A drop in August does not block this week | PASS |
| Delivery week mismatch | Vitest | Block. That load’s gross is left out | PASS |
| Float gross | Vitest | Rejected | PASS |
| Fuel and toll fixtures | Vitest on the v0.0.0.7 week files | Fleet tolls 32153 cents. Each unit’s fuel is the discounted total, not retail | PASS |
| lock_week | Throwaway local Postgres, not live Supabase | First lock stores unit 02 net 134686. Second lock, a bad net, and a float are refused. A locked-week override is refused. RLS is on | PASS |
| Full suite | `npm test` | Earlier tests stay green | PASS (98 tests) |
| Live migration | Not run | Unapplied until the owner says go | Not applied |
| Signed-in screens | Browser | Statements week selector, tables, Close | Not clicked. This run has no app env, so the site cannot sign in |

2. What was built

- Monday–Sunday statements by delivery date. Per-unit and fleet totals from loads, fee contracts, discounted fuel, tolls, and fixed expenses. Money is integer cents. Rates are basis points.
- Legacy-owned trucks deduct Tolson payable. Managed trucks deduct one management fee. The 10% and 5% split is stored and is not deducted again.
- Close checks unlinked fuel, a row-count drop on an import that overlaps the week, and contract or reconcile problems, then locks a snapshot. There is no reopen.
- Statements page: week selector, tables, and Close with the blocker list.
- Migration file only. Not applied to live Supabase.

3. Click-by-click owner test

1. Run `supabase/migrations/20261007150000_weekly_statements.sql` in the Supabase SQL editor when you say go. It belongs after the v0.0.0.6 and v0.0.0.7 scripts.
2. Sign in to https://tret.ai.alphasolutions.software.
3. Open **Statements**. Set the week to `2026-09-21`.
4. Each unit with loads, fuel, tolls, or fixed expenses should show a row. Click the unit number for its lines. Managed units show one management fee. Lines marked internal are not in the net.
5. If Close is blocked, the reasons are listed. Fix those first.
6. **Close week** asks you to confirm. After that the week says Locked and the numbers stay the snapshot. Closing it again should be refused.

4. Manual owner steps

- Run `supabase/migrations/20261007150000_weekly_statements.sql` in the Supabase SQL editor (owner says go).
- No new environment variables.

5. Not done / OPEN

- Migration was not applied to live Supabase.
- Signed-in screens were not clicked in this run (no app env). The lock function was run on a throwaway local database only.
- The uploaded handoff has no owner PDF dollar table for 21–27 Sep 2026. The fixture statement is the reference until you compare it with the real week. Live per-unit fuel dollars stay OPEN.
- No reopen. Adjustment rows are not built. Imports may still update source rows after a lock. The snapshot does not change.
- PDF, the Issues inbox screen, the management-company P&L, and Blocks 5–7 were not started.
- Quicken format stays OPEN.
