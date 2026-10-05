# Setup checklist (manual steps)

Do these once (or when credentials change). The app cannot finish login or health checks until they are done.

## 1. GitHub

1. Confirm you have access to `https://github.com/Alpha-Solutions-Services/TRET.AI`.
2. Work on branch `build/v0.0.0.1` and merge to `main` via pull request (do not push straight to `main`).

## 2. Supabase project

1. Create or pick a Supabase project for TRET.AI (dev only for now — no real Legacy data until you say so).
2. In SQL Editor (or CLI), run the migration file: `supabase/migrations/20261005100000_allowed_users.sql`.
3. Confirm table `allowed_users` exists with one row: `alphaassistant.alpha@gmail.com` / role `owner`.
4. Copy **Project URL**, **anon public** key, and **service_role** key from Settings → API (service_role stays on your laptop only).
5. In Authentication → Providers: leave Email enabled. Turn **Google off** if it was on.
6. In Authentication → Settings (or Providers): **disable public sign-ups** so strangers cannot create accounts.
7. Set Site URL to your app URL (local: `http://localhost:3000`, production: `https://tretai.alphasolutions.software`).

## 3. Environment variables (local)

1. Copy `.env.example` to `.env.local` (or fill `SECRETS/TRETAI.env.local` and run `powershell -File ".\SECRETS\sync-envs.ps1"` from the Alpha workspace root).
2. Set locally:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (local create-owner only)
   - `ADMIN_EMAIL` (use the allowlisted owner email)
   - `ADMIN_PASSWORD` (at least 14 characters)

3. Never commit `.env.local`. Never put `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_PASSWORD` in Vercel or in any `NEXT_PUBLIC_*` variable.

## 4. Create the owner Auth user (one time)

1. From the `TRETAI` folder run: `npm run create-owner`
2. You should see only: `Owner ready`
3. The script creates the Supabase Auth user (email confirmed) or updates the password if the user already exists.

## 5. Vercel

1. Import the `TRET.AI` GitHub repo into the Alpha Vercel team.
2. In Project → Settings → General / Build & Development Settings:
   - **Framework Preset:** Next.js (required — do not leave as Other/static)
   - **Root Directory:** empty for this dedicated repo
   - **Output Directory:** leave blank / override OFF (Next.js manages output; do not set `public`)
   - **Build Command:** leave default (`next build`) or blank for auto-detect
3. In Vercel → Environment Variables, set **only**:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. Do **not** add `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_PASSWORD` to Vercel.
5. Deploy from `main` after the PR is merged (or use a preview from the PR branch for testing).
6. Keep an eye on Vercel free Fluid Active CPU — avoid extra always-on serverless work.

## 6. DNS (production)

1. Point `tretai.alphasolutions.software` to the Vercel project (CNAME or as Vercel instructs).
2. Wait for HTTPS to become ready in Vercel → Domains.
3. Update the Supabase Site URL to the production domain if you have not already.

## 7. First login test

1. Open the app → Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` → should reach Overview.
2. Sign in with a wrong password → must show **Email or password is incorrect.**
3. In Supabase, create a temporary Auth user that is **not** in `allowed_users`, try to sign in → **Access denied**, then delete that temporary user.
4. While signed in as the owner, open `/health` → database connection should show **OK**.
5. Confirm the footer shows `TRET.AI v0.0.0.1` and that **Sign out** works.
