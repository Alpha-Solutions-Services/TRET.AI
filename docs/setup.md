# Setup checklist (manual steps)

Do these once (or when credentials change). The app cannot finish Google login or health checks until they are done.

## 1. GitHub

1. Confirm you have access to `https://github.com/Alpha-Solutions-Services/TRET.AI`.
2. Work on branch `build/v0.0.0.1` and merge to `main` via pull request (do not push straight to `main`).

## 2. Supabase project

1. Create or pick a Supabase project for TRET.AI (dev only for now — no real Legacy data until you say so).
2. In SQL Editor (or CLI), run the migration file: `supabase/migrations/20261005100000_allowed_users.sql`.
3. Confirm table `allowed_users` exists with one row: `alphaassistant.alpha@gmail.com` / role `owner`.
4. Copy **Project URL** and **anon public** key from Settings → API.

## 3. Google sign-in in Supabase

1. In Google Cloud Console, create OAuth credentials (Web application).
2. Add authorized redirect URI from Supabase Auth → Providers → Google (the Supabase callback URL).
3. In Supabase → Authentication → Providers → Google: turn on Google, paste Client ID and Client Secret.
4. In Supabase → Authentication → URL configuration, set Site URL to your app URL (local: `http://localhost:3000`, production: `https://tretai.alphasolutions.software`).
5. Add redirect URLs: `http://localhost:3000/auth/callback` and `https://tretai.alphasolutions.software/auth/callback`.

## 4. Environment variables (local)

1. Copy `.env.example` to `.env.local`.
2. Set:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Never commit `.env.local`. Prefer keeping values in the Alpha `SECRETS/` vault and syncing when ready.

## 5. Vercel

1. Import the `TRET.AI` GitHub repo into the Alpha Vercel team.
2. Set the same two public env vars in Vercel Project → Settings → Environment Variables.
3. Deploy from `main` after the first PR is merged (or a preview from the PR branch for testing).
4. Keep an eye on Vercel free Fluid Active CPU — avoid extra always-on serverless work.

## 6. DNS (production)

1. Point `tretai.alphasolutions.software` to the Vercel project (CNAME or as Vercel instructs).
2. Wait for HTTPS to become ready in Vercel → Domains.
3. Update Supabase Site URL and redirect URLs to the production domain if you have not already.

## 7. First login test

1. Open the app → Sign in with Google as `alphaassistant.alpha@gmail.com` → should reach Overview.
2. Sign in with a different Google account → must see **Access denied** and not stay signed in.
3. While signed in as the allowed user, open `/health` → database connection should show **OK**.
4. Confirm the footer shows `TRET.AI v0.0.0.1`.
