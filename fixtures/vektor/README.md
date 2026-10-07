# Vektor fixtures

Throwaway / anonymized JSON for Vitest only. Never write to Legacy live data.

| File | Purpose |
|------|---------|
| `sample-a-manifest-1152.json` | Real owner values (manifest 1152): completion timestamps, TYPE_START ignored, NEED_TO_SET ignored; promotes clean. |
| `sample-b-manifest-1101.json` | Owner Sample B — FIXED appointment delivery fallback; Warn loaded 0 vs auto. |
| `sample-c-manifest-1146.json` | Owner Sample C — deleted + merged; never promote. |
| `fuel-week-2026-09-21.json` / `.csv` | Units 02–08 for 21–27 Sep 2026. Stand-in totals. Unit 03 retail is $1.00 above discounted. Not the missing handoff dollar table. |
| `tolls-week-2026-09-21.json` / `.csv` | 66 tolls, 32153 cents ($321.53), same week. Truck id resolves to the unit number. |

The statement file `fixtures/statements/week-2026-09-21.json` is a different ledger. Its fuel is 75000 cents and its tolls are 1734 cents. The week smoke in `src/lib/week-close/week-2026-09-21.e2e.test.ts` keeps them apart. See `docs/WEEK-CLOSE-RUNBOOK.md`.
