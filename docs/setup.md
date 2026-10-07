# Setup checklist (manual steps)

Do these once (or when credentials change). The app cannot finish login or health checks until they are done.

## 1. GitHub

1. Confirm you have access to `https://github.com/Alpha-Solutions-Services/TRET.AI`.
2. Work on a feature branch and merge to `main` via pull request (do not push straight to `main`).

## 2. Supabase project

1. Create or pick a Supabase project for TRET.AI (dev only for now — no real Legacy data until you say so).
2. In SQL Editor (or CLI), run the migration file: `supabase/migrations/20261005100000_allowed_users.sql`.
3. Confirm table `allowed_users` exists with one row: `alphaassistant.alpha@gmail.com` / role `owner`.
4. Find the Project URL and anon key (exact clicks):
   1. Open your project in the Supabase dashboard.
   2. Click **Project Settings** (gear) in the left sidebar.
   3. Click **API**.
   4. Copy **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`.
   5. Under **Project API keys**, copy the **anon** **public** key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   6. Copy **service_role** only for your laptop (create-owner). Never put it in Vercel.
5. In Authentication → Providers: leave Email enabled. Turn **Google off** if it was on.
6. In Authentication → Settings (or Providers): **disable public sign-ups** so strangers cannot create accounts.
7. Set **Site URL** to `https://tret.ai.alphasolutions.software` (local testing can use `http://localhost:3000` while developing).

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

## 5. Vercel project settings and env vars

1. Import the `TRET.AI` GitHub repo into the Alpha Vercel team (project name may be `tretai`).
2. Framework and directories (exact):
   1. Open the project → **Settings** → **General** (or **Build and Deployment**).
   2. **Framework Preset** = **Next.js**.
   3. **Output Directory** override = **OFF** (do not set `public`).
   4. **Root Directory**: leave **empty** when `package.json` is at the repo root (this dedicated `TRET.AI` repo). Set a subfolder only if the app is nested in a monorepo.
3. Environment variables to add in Vercel (exact names from `.env.example`):
   1. Open **Settings** → **Environment Variables**.
   2. Add `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL (all environments you use: Production, Preview).
   3. Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon public key.
   4. Do **not** add `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_PASSWORD`.
4. Redeploy after saving env vars so the new values apply.
5. Keep an eye on Vercel free Fluid Active CPU — avoid extra always-on serverless work.

## 6. Production domain and DNS

1. App domain is `tret.ai.alphasolutions.software` (not `tretai.alphasolutions.software` — that name is reserved for Resend email and must not point at this app).
2. In Vercel → project → **Settings** → **Domains** → **Add** → enter `tret.ai.alphasolutions.software`.
3. Create the DNS record Vercel shows for the host **`tret.ai`** under the parent domain `alphasolutions.software` (usually a **CNAME** to `cname.vercel-dns.com`, or whatever Vercel displays on that Domains page).
4. Wait until the domain shows as Valid / HTTPS ready in Vercel.

## 7. Supabase Auth Site URL (production)

1. In Supabase → **Authentication** → **URL Configuration**.
2. Set **Site URL** = `https://tret.ai.alphasolutions.software`.
3. Save.

## 8. First login test

1. Open `https://tret.ai.alphasolutions.software` → Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` → should reach Overview.
2. Sign in with a wrong password → must show **Email or password is incorrect.**
3. In Supabase, create a temporary Auth user that is **not** in `allowed_users`, try to sign in → **Access denied**, then delete that temporary user.
4. While signed in as the owner, open `/health` → database connection should show **OK**.
5. Confirm the footer shows `TRET.AI v0.0.0.1` and that **Sign out** works.
6. If env vars are missing, the site must show **Setup incomplete** (not a 500).

## 9. Vektor Connect (v0.0.0.5) — do this before clicking Connect Vektor

1. In the Supabase SQL editor, run `supabase/migrations/20261007120000_vektor_mcp_oauth.sql`. Do this only when you are ready (say go). It adds token tables with Row Level Security and no client policies.
2. Create a random encryption secret locally and in Vercel (Production and Preview): name `VEKTOR_TOKEN_ENCRYPTION_KEY`. Example command on your machine: `openssl rand -base64 32`. Paste the value into the env var. Do not commit it. Do not put it in a `NEXT_PUBLIC_` variable.
3. Optional: set `VEKTOR_OAUTH_REDIRECT_URI` to `https://tret.ai.alphasolutions.software/api/vektor/oauth/callback`. If you leave it empty, the app uses the site origin plus that path.
4. Redeploy so Vercel picks up the new variable.
5. Open Settings and click **Connect Vektor**. Sign in once. Then click **Test connection**, choose **Vektor MCP**, and Save.

## 10. Fixed expenses (v0.0.0.6) — do this before saving expenses

1. In the Supabase SQL editor, run `supabase/migrations/20261007130000_fixed_expenses_monday_rule.sql`. Do this only when you are ready (say go).
2. It adds fixed weekly expenses, week overrides, and management operating expenses, all with Row Level Security. It also requires new fee rate versions to start on a Monday.
3. Until that script has run, the Fixed expenses tab and Operating expenses page say the migration has not been applied. Trucks, loads, and imports keep working.

## 11. Fuel and tolls (v0.0.0.7) — do this before importing fuel or tolls

1. In the Supabase SQL editor, run `supabase/migrations/20261007140000_fuel_tolls_import.sql`. Do this only when you are ready (say go).
2. It adds fuel and toll staging, `fuel_transactions`, `toll_transactions`, and threshold rows in `import_settings`. All new tables have Row Level Security.
3. Until that script has run, Fuel, Tolls, and Import fuel and tolls say the migration has not been applied. Loads keep working.
4. No new environment variables. Connect Vektor (section 9) is still required for the MCP path.

## 12. Weekly statements (v0.0.0.8) — do this before closing a week

1. In the Supabase SQL editor, run `supabase/migrations/20261007150000_weekly_statements.sql`. Do this only when you are ready (say go). Run it after the v0.0.0.6 and v0.0.0.7 scripts.
2. It adds `weekly_statements`, `weekly_statement_lines`, and `week_closes`, all with Row Level Security. Signed-in users can read. Only `lock_week` inserts. There is no reopen.
3. Until that script has run, Statements still shows a computed week, and Close says the migration has not been applied.
4. No new environment variables.

## 13. Weekly PDF (v0.0.0.9)

1. No new migration and no new environment variables.
2. After the v0.0.0.8 statements migration is applied, **Download PDF** on Statements uses the locked snapshot when the week is locked.
3. Before that migration, a week that is ready to close can still be downloaded from the computed statement. Close itself still waits on the v0.0.0.8 script.

## 14. Overview, P&L, and Issues (v0.0.0.10)

1. In the Supabase SQL editor, run `supabase/migrations/20261007160000_resolve_issue.sql` only when you say go. It does not add a table. It lets **Mark resolved** write `change_log`.
2. Until that script has run, Overview and Issues still load. **Mark resolved** says the migration has not been applied.
3. No new environment variables.

## 15. Truck Google Sheet link (v0.0.0.13) — do this before saving a sheet link

1. In the Supabase SQL editor, run `supabase/migrations/20261007170000_truck_google_sheet_url.sql`. Do this only when you are ready (say go).
2. It adds `trucks.google_sheet_url`. Row Level Security stays as it is. The existing trucks policy covers the new column.
3. Until that script has run, Edit still saves unit, name, class, and owner. The Google Sheet field says the migration has not been applied.
4. After it has run, paste each truck’s link on **Trucks → Edit** (or **Add truck**), in the field labeled **Google Sheet**.

## 16. Overview Ins and Outs (v0.0.0.14)

1. No new migration. The truck Google Sheet column from section 15 must already be applied, and each active truck needs its link.
2. Overview reads two tabs: the load ledger (Rate by delivery date) and **Mgmt Expenses** (Date, Category, Amount).
3. If the sheet is shared so anyone with the link can view, the server reads the public CSV. No new env var.
4. If the sheet stays private, create a Google service account, share each sheet with that email as a viewer, and set these server-only variables (Vercel and local). Do not prefix them with `NEXT_PUBLIC_`.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (PEM; use `\n` for line breaks if the value must be one line)
5. `GOOGLE_SHEETS_API_KEY` is optional and only works for sheets that are already public.
6. Open **Overview**, pick the week, and check **Ins and Outs**. A truck that cannot be read shows the note in the Loads cell. A banner names `GOOGLE_SERVICE_ACCOUNT_EMAIL` or `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` when that variable is missing.
7. Dates such as `2026-09-01 0:00:00` and `10/05/2026` count. A blank Amount is skipped.

## 17. Import sources and the asset report (v0.0.0.17)

1. No new migration.
2. Optional server variable `VEKTOR_API_MANIFESTS_PATH`. Leave it empty until Vektor confirms the list path. `VEKTOR_API_BASE_URL` and `VEKTOR_API_TOKEN` turn on the REST source. That path never calls MCP.
3. In **Settings**, read the four sources and save the one you want. CSV and Google Sheet Load Ledger work without Vektor keys. MCP stays listed and is labeled broken on filters proto.
4. On **Ins and Outs**, **Download report** builds the two-page Weekly Asset Management Report for that truck and week. Truck Pymts and Trailer Pymts are left off owner expenses. A missing dispatcher prints Legacy Dispatch Team.

## 18. Service account key and the footer (v0.0.0.18)

1. No new migration.
2. On Vercel, set `GOOGLE_SERVICE_ACCOUNT_JSON` to the full service account JSON. That value is preferred. It supplies the email and the private key.
3. You can still set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` when JSON is unset. A one-line PEM may use `\n` for line breaks. Quotes around the PEM are removed.
4. Share each truck sheet with that service account as a viewer.
5. The footer shows whether JSON, the email, and the private key are set, and whether the key format is ok. It does not show the key. The same check is on Health and Settings.
6. If the key format is wrong, the row says so in plain language. Click the error, or Copy, to copy the real cause.

## 19. Legacy fees and monthly expenses (v0.0.0.20)

1. In the Supabase SQL editor, run `supabase/migrations/20261007180000_legacy_management_fees.sql`. Do this only when you are ready (say go). Run it after the earlier scripts.
2. It adds `legacy_org_settings` (default management fee, 10 percent), `legacy_truck_week_fees`, and `legacy_load_fees`. All three have Row Level Security. Signed-in allowed users can read. Writes go through functions. It also adds `update_mgmt_operating_expense`.
3. Until that script has run, Ins and Outs still shows a 10 percent fee and does not store edits. Settings says the migration has not been applied. Legacy expenses still list rows from the v0.0.0.6 table.
4. No new environment variables. The footer is one short line under the page. It is not fixed to the screen.

## 20. Weekly asset report layout (v0.0.0.24)

1. No new migration. `trucks` does not gain trailer, VIN, or dispatcher columns.
2. Download report on Ins and Outs is still two Letter pages. Owner expenses omit Truck Pymts and Trailer Pymts. Dashboard Outs still include those lines.
3. Trailer, VIN, and dispatcher print when Fleet Directory, Weekly Expenses, or the Load Ledger has them. If dispatcher is missing, the PDF prints Legacy Dispatch Team and does not add a note. Driver prints the full truck or owner name when the sheet only has the first name.

## 21. Tolson payable on the truck (v0.0.0.24)

1. In the Supabase SQL editor, run `supabase/migrations/20261007200000_truck_tolson_payable.sql`. Do this only when you are ready. It adds two nullable columns on `trucks`. Row Level Security is unchanged.
2. Until that script has run, Edit truck still saves unit, name, class, owner, and the Google Sheet link. The Tolson fields say the migration has not been applied.
3. On Edit truck, Tolson payable type is percent of gross or a fixed weekly amount. Leave both blank to count that truck as $0. The form does not fill in a number for you.
4. Management and the Dashboard management table add those truck amounts for the week. Net subtracts portal expenses and Tolson payable. Legacy kept is income minus Tolson payable.

## 22. QuickBooks Online (v0.0.0.25)

Do this before Connect QuickBooks. The migration is not applied until you say go.

1. In the Supabase SQL editor, run `supabase/migrations/20261007210000_quickbooks.sql`.
2. It adds the QuickBooks tables. Token tables have Row Level Security and no client policies. Mapping, posting accounts, and push history allow role `owner` or `admin` only.
3. In the Intuit developer portal, create the app and add the redirect URI below. The click path is in the user guide.
4. On Vercel (Production and Preview) and in `.env.local`, set names only from `.env.example`:
   - `INTUIT_CLIENT_ID`
   - `INTUIT_CLIENT_SECRET`
   - `INTUIT_REDIRECT_URI` = `https://tret.ai.alphasolutions.software/api/quickbooks/oauth/callback`
   - `INTUIT_ENVIRONMENT` = `sandbox` or `production` (the same key set you copied)
   - `QUICKBOOKS_TOKEN_ENCRYPTION_KEY` from `openssl rand -base64 32`
5. Do not put any of those in a `NEXT_PUBLIC_` variable. Do not commit the values.
6. Redeploy. Open Integrations as the owner. If the keys are missing, the page says QuickBooks not set up yet.
7. Connect the Legacy Inc company only. Import and post both wait for a confirm.
8. Leave `QUICKBOOKS_API_ENABLED` blank. Integrations then hides Connect QuickBooks and uses the CSV export and import. Set it to `true` only if an Intuit developer app exists.

## 23. v0.0.0.26 database update

Do this only when you are ready. It is not applied yet.

1. In the Supabase SQL editor, run `supabase/migrations/20261007220000_v26_load_ids_compare_qbo_file.sql` after the v0.0.0.25 QuickBooks script.
2. It renames load ids to the `TBH--1192` form when that would not collide, adds date kind columns, decision tables with Row Level Security, and the file expense function.
3. Until it has run, Sheet vs Vektor still compares loads. Resolve buttons say the migration has not been applied. QuickBooks file import says the same before the first save. The journal CSV download does not need this script.
