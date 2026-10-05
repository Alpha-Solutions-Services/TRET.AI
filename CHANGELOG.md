# Changelog

## v0.0.0.1 — 2026-10-05

- Project skeleton: Next.js App Router, TypeScript strict, Tailwind, lint, typecheck, Vitest, GitHub Actions CI.
- Supabase Auth with Google sign-in; access limited to `allowed_users` (seed: `alphaassistant.alpha@gmail.com`, role `owner`).
- Pages: `/login`, Overview `/`, `/health`, and Access denied.
- UI foundation: Inter, navy accent, light theme, button actions, skeleton, toast, signed-in footer with version.
- Database migration: `allowed_users` with Row Level Security.
- Documentation for overview, business rules, decisions, architecture, data sources, setup, modules, and versioning.
