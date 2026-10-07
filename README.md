# TRET.AI

Accounting and reporting for **Legacy Inc Global** (freight management).

TRET.AI reads loads, fuel, and tolls from Vektor, applies per-truck fee rules, makes weekly owner PDF reports, tracks the management company’s income and expenses, can mirror data to Google Sheets, and can export to Quicken (Windows, QIF). The **database is the source of truth**.

Current version: see the `VERSION` file (now **0.0.0.13**).

## How to run locally

1. Install Node.js 22+.
2. Copy `.env.example` to `.env.local` and fill in Supabase values (see [docs/setup.md](docs/setup.md)).
3. Apply the database migration in Supabase (file under `supabase/migrations/`).
4. From this folder:

```bash
npm install
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000). Sign in with email and password for an account listed in `allowed_users` (create the owner once with `npm run create-owner`).

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run create-owner
```

## Where the docs are

| Doc | What it covers |
|-----|----------------|
| [docs/overview.md](docs/overview.md) | What TRET.AI does and who uses it |
| [docs/business-rules.md](docs/business-rules.md) | Fee and reporting rules (DECIDED / OPEN) |
| [docs/decisions.md](docs/decisions.md) | Dated decision log |
| [docs/architecture.md](docs/architecture.md) | System layers |
| [docs/data-sources.md](docs/data-sources.md) | Vektor, Sheets, Quicken |
| [docs/setup.md](docs/setup.md) | Manual setup checklist |
| [docs/modules.md](docs/modules.md) | Roadmap and status |
| [docs/versioning.md](docs/versioning.md) | How versions work |
| [docs/WEEK-CLOSE-RUNBOOK.md](docs/WEEK-CLOSE-RUNBOOK.md) | How to run the week of 21–27 Sep 2026 |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |

Production domain: `tret.ai.alphasolutions.software`  
(`tretai.alphasolutions.software` is reserved for Resend email — do not use it for the app.)

