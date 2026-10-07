# Checkpoint v0.0.0.5

1. Test table

| Check | How | Expected | Result |
| --- | --- | --- | --- |
| Sample A manifest 1152 | Vitest `live-loads-import.test.ts` for week 2026-09-21..2026-09-27 | rate 220000 cents, loaded 332, deadhead 14, pickup 2026-09-25 16:38:52, delivery 2026-09-26 12:29:26, week 2026-09-21..2026-09-27 | PASS |
| Manifest 1146 | Same test, Sample C | Not promoted | PASS |
| Samples A/B/C | `vektor-import.test.ts` plus full `npm test` | Still green | PASS (62 tests) |
| Delivered counts | Same week, fixtures plus two synthetic rows | First-stop date count and delivery-date count are both reported. They differ when a TYPE_START falls in the week but delivery does not, or delivery falls in the week but the first stop was earlier (the −14/+7 window). Historical fleet first-stop count was about 16; this build does not call live Vektor, so that live count is not measured here. | Reported by the import message and `import_runs.meta.fetchReport` |
| Connect Vektor button | Settings page | Always visible | In this PR |
| Zero rows / sign-in failure | Refresh failure test + import action | Needs sign-in, run Failed, Block issue. Empty success is not silent. | Unit-tested |

2. What was built

- Settings shows Connect Vektor, Connected / Needs sign-in, Test connection, and Disconnect.
- OAuth PKCE + dynamic client registration, encrypted token RPCs, refresh lock, read-only MCP allowlist.
- Import uses the first-stop window (from − 14 days, to + 7 days) and keeps delivery dates in range. MCP can be selected only after Test connection sets `mcp_verified`.
- Migration file only. Not applied to live Supabase.

3. Click-by-click owner test

1. Apply the migration and set `VEKTOR_TOKEN_ENCRYPTION_KEY` (setup guide section 9). Redeploy.
2. Sign in to https://tret.ai.alphasolutions.software.
3. Open Settings. Click **Connect Vektor**. Sign in on the Vektor page.
4. Back on Settings, status reads **Connected**. Click **Test connection**.
5. Choose **Vektor MCP**. Click **Save**.
6. Open Imports. Set From 2026-09-21 and To 2026-09-27. Click **Import now**.
7. Open Loads. Manifest 1152 should match Sample A (rate 220000 cents, 332 loaded, 14 deadhead, week 2026-09-21 through 2026-09-27). Manifest 1146 should be absent.

4. Manual owner steps

- Run `supabase/migrations/20261007120000_vektor_mcp_oauth.sql` in the Supabase SQL editor (owner says go).
- Add `VEKTOR_TOKEN_ENCRYPTION_KEY` in Vercel and locally. Optional `VEKTOR_OAUTH_REDIRECT_URI` = `https://tret.ai.alphasolutions.software/api/vektor/oauth/callback`.
- Click **Connect Vektor** and sign in once. That is the only interactive blocker.

5. Not done / OPEN

- Live OAuth was not completed in this cloud run (no owner browser). Test connection against real Vektor is the owner's step after deploy.
- Exact MCP argument names are a working assumption (`first_stop_appointment_start_date`, `{ids}`, `{manifest_id}`) until Test connection confirms them.
- Driver and broker name tools are not called until `tools/list` shows exact read-only names.
- Fuel, tolls, weekly close, PDF, and Blocks 2–7 are not started.
- Quicken format stays OPEN.
- Migration was not applied to live Supabase.
