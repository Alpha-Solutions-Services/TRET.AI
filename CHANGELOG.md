# Changelog

## v0.0.0.2 — 2026-10-06

- Database migration (not applied until go): `trucks`, `fee_contracts`, `fee_rules` with RLS for `allowed_users`; exclusion constraint blocks overlapping contracts for the same truck.
- Pure TypeScript fee engine: integer cents, basis points, half-up rounding in one function; contract date lookup; Monday–Sunday week helper.
- Vitest coverage for sample weeks, dispatch bases, rounding, date lookup, invalid inputs, and week bounds.
- Guard test: files outside `scripts/` must not reference privileged local script env names (docs and `.env.example` exempt).
- Docs: `data-model.md`, fee model and OPEN items in business rules, Module 2 marked done.

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
