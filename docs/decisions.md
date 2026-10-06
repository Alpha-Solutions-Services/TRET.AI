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
