# Checkpoint v0.0.0.10

1. Test table

| Check | How | Expected | Result |
| --- | --- | --- | --- |
| Week snapshot | Vitest on `fixtures/statements/week-2026-09-21.json` | Unit 02 net 134686. Unit 03 net 305630. Fleet net 440316. Fees are driver + management or Tolson + dispatch + factoring | PASS |
| Snapshot identity | Same test | Gross − fees − fuel − tolls − owner fixed = net for each unit and the fleet | PASS |
| Float gross | Vitest | Rejected | PASS |
| Management P&L | Vitest on `fixtures/overview/week-2026-09-21.json` plus the statement fixture | Retained 29000 (managed only). Dispatch 46600. Income 75600. Fixed to management 500. Operating expenses 12500 (21 Sep and 27 Sep). Net 62600. Tolson 90000 is not in the net | PASS |
| Owned retained | Vitest | A leftover retained amount on unit 02 is not income | PASS |
| Float expense | Vitest | Rejected | PASS |
| Issues inbox | Same overview fixture | Overlapping Warn/Block and a close check are listed. The prior week, Info, and ignored are not. Resolve is only for an open import issue | PASS |
| Full suite | `npm test` | Earlier tests stay green | PASS (112 tests) |
| Live migration | Not run | Unapplied until the owner says go | Not applied |
| Signed-in screens | Browser | Overview, P&L, Issues, Mark resolved | Not clicked. This run has no app env, so the site cannot sign in |

2. What was built

- Overview for one Monday–Sunday week: unit and fleet snapshot from the statement, close status, and the open issue count.
- Management P&L in integer cents. Income is Legacy retained on managed trucks plus the dispatch fee Legacy keeps. Expenses are fixed costs charged to management and operating expenses dated in the week. Tolson payable is shown and is not in the net.
- Issues inbox for Warn and Block import issues and live close checks. Filters are week, severity, and status. Mark resolved is a stored import issue only.
- Migration file only. Not applied to live Supabase.

3. Click-by-click owner test

1. Run `supabase/migrations/20261007160000_resolve_issue.sql` in the Supabase SQL editor when you say go. Overview and Issues load before that. Mark resolved waits on it.
2. Sign in to https://tret.ai.alphasolutions.software.
3. Open **Overview**. Set the week to `2026-09-21`.
4. Each unit with a statement should show gross, fees, fuel, tolls, owner fixed, and net. The fleet row is the sum. Close status says Open or Locked.
5. Management P&L is under that table. Managed-truck Legacy retained and the dispatch fee are income. Fixed costs charged to management and operating expenses dated that week are expenses. Tolson payable is listed under the net and is not subtracted.
6. Open **Issues** from the open-issues link. Warn and Block rows for imports that overlap the week are listed, plus close checks.
7. **Mark resolved** asks you to confirm. The row leaves the open list. Loads, fuel, tolls, and a locked week do not change.
8. A close check has no Mark resolved button. It leaves the list when that check passes.

4. Manual owner steps

- Run `supabase/migrations/20261007160000_resolve_issue.sql` in the Supabase SQL editor (owner says go).
- No new environment variables.

5. Not done / OPEN

- Migration was not applied to live Supabase. `resolve_issue` was not executed on a database in this run.
- Signed-in screens were not clicked in this run (no app env).
- The uploaded handoff has no owner dollar table for 21–27 Sep 2026. The fixture statement is still the reference.
- Operating expenses dated in a locked week are not frozen.
- An import issue with no run range is shown in every week.
- AI (`llm-gateway`), Tolson payable payments, recurring charges, Quicken, and Block 7 end-to-end were not started.
- Quicken format stays OPEN.
