# Decisions log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-10-05 | Build v0.0.0.1 as foundation: Next.js App Router, Supabase Auth, `allowed_users` allowlist, Overview, Health, docs, CI | Needed before fee engine or Vektor import |
| 2026-10-05 | App version lives only in the plain-text `VERSION` file; `package.json` version stays `0.0.0` | npm cannot store 4-part versions like `0.0.0.1` |
| 2026-10-05 | Only `alphaassistant.alpha@gmail.com` (role `owner`) is seeded in `allowed_users` | Initial access control for bootstrap |
| 2026-10-05 | Login = email + password, Google removed | Simpler setup |
| 2026-10-05 | OPEN: dispatch fee base (full gross vs reduced) | Not decided; do not guess |
| 2026-10-05 | OPEN: 15% management fee base (gross vs after factoring) | Not decided; do not guess |
| 2026-10-05 | OPEN: meaning of unlabeled $228 line in sample report | Not decided; do not guess |
| 2026-10-05 | OPEN: Quicken version (Windows confirmed; QIF planned) | Not decided; do not guess |
| 2026-10-05 | OPEN: Vektor long-lived access for scheduled server jobs | Not decided; do not guess |
| 2026-10-05 | OPEN: Bestpass API keys (tolls may stay via Vektor) | Not decided; do not guess |
| 2026-10-05 | OPEN: two-factor login (MFA) | Not decided; do not build yet |
| 2026-10-05 | OPEN: password reset process | Not decided; do not build yet |
