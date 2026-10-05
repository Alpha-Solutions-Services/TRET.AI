# Overview

## What TRET.AI does

TRET.AI is an accounting and reporting system for a freight management company (**Legacy Inc Global**).

It will:

- Read loads, fuel, and tolls from **Vektor**
- Apply **per-truck fee rules** stored in the database
- Produce **weekly owner reports** (PDF)
- Keep the **management company’s** income and expenses
- Mirror selected data to **Google Sheets**
- Export to **Quicken** on Windows (QIF)

The **database** is always the source of truth. If a sheet disagrees with the database, the database wins and an issue is flagged.

## Who uses it

- **Owner / management** at Legacy Inc Global (and Alpha staff who maintain the system)
- Access is limited to emails listed in the `allowed_users` table

## What this version includes (v0.0.0.1)

- Project skeleton, tests, and CI
- Google sign-in with an allowlist
- Empty Overview page
- Health page (version + database check)
- Documentation of business rules and the roadmap

Later versions add imports, fee engine, weekly close, PDFs, and exports. See [modules.md](modules.md).
