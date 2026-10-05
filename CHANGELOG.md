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
- Fix: missing required env vars show a plain **Setup incomplete** page instead of a 500; missing names are logged server-side only.
- Production app domain set to `tret.ai.alphasolutions.software` (`tretai.alphasolutions.software` reserved for Resend).
- Fix: read Supabase public env via shared helper (avoids empty build-time inlining) and set cookieEncoding base64url.
- Fix: bake `VERSION` into `TRET_AI_VERSION` at build so Vercel serverless does not 500 on missing VERSION file; soft-fail middleware and show Setup incomplete on unexpected errors.
