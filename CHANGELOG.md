# Changelog

## v0.0.0.1 — 2026-10-05

- Project skeleton: Next.js App Router, TypeScript strict, Tailwind, lint, typecheck, Vitest, GitHub Actions CI.
- Supabase Auth with email + password sign-in; access limited to `allowed_users` (seed: `alphaassistant.alpha@gmail.com`, role `owner`). Google sign-in removed.
- Local `npm run create-owner` script to create or reset the owner Auth user (service role key stays local; never on Vercel).
- Pages: `/login`, Overview `/`, `/health`, and Access denied. Signed-in shell includes Sign out.
- UI foundation: Inter, navy accent, light theme, button actions, skeleton, toast, signed-in footer with version.
- Database migration: `allowed_users` with Row Level Security.
- Automated test that fails if `SECRETS/` or non-example `.env*` files are tracked by git.
- Documentation for overview, business rules, decisions, architecture, data sources, setup, modules, and versioning.
- Fix: refresh `package-lock.json` so GitHub Actions `npm ci` succeeds; document Vercel Framework Preset = Next.js (not static/`public` output).
