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

## Current version

`VERSION` is the source of truth. v0.0.0.27 rebuilds the Weekly Asset Management Report as the Legacy landscape template, including the executive cover, names this week's escrow Escrow Balance (this week), and counts loaded miles once per shared Vektor manifest. v0.0.0.26 imports a Vektor orders CSV, stores load ids as `TBH--1192`, lets an admin resolve Sheet vs Vektor, adds five themes, and replaces the QuickBooks connect screen with a CSV export and import unless `QUICKBOOKS_API_ENABLED` is true. v0.0.0.25 connects QuickBooks Online for the Legacy Inc company and restyles Glass Light. v0.0.0.24 keeps the Weekly Asset Management Report on two pages, drops MC Lease from owner expenses, fills trailer, VIN, dispatcher, on-time, and status from the truck sheet when those columns exist, sets Tolson payable per truck, and builds the Dashboard week snapshot from sheet Ins and Outs. v0.0.0.23 adds sheet fee cards, Weekly Expenses for dashboard Outs, Sheet vs Vektor, and five themes. v0.0.0.21 adds a fleet Dashboard and a Management page, with bar, area, and donut charts. v0.0.0.20 adds a per-load Legacy management fee (default 10 percent) and monthly Legacy expenses in the portal. The footer is one short line in normal page flow. v0.0.0.19 keeps the footer label `TRET.AI v…` without importing the server version reader into the browser bundle. See [modules.md](modules.md) and [WEEK-CLOSE-RUNBOOK.md](WEEK-CLOSE-RUNBOOK.md).

## What v0.0.0.1 included

- Project skeleton, tests, and CI
- Email + password sign-in with an allowlist
- Empty Overview page
- Health page (version + database check)
- Documentation of business rules and the roadmap

Later versions add imports, fee engine, weekly close, PDFs, and exports. See [modules.md](modules.md).
